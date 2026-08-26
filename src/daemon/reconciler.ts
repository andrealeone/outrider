import type { Router } from '@/shared/types/router'
import type { ServiceState } from '@/shared/types/protocol'
import type { ServiceEntry } from '@/shared/types/registry'

import type { Logger } from '@/daemon/logger'
import type { EventBus } from '@/daemon/event-bus'
import type { Registry } from '@/daemon/registry'
import type { Supervisor } from '@/daemon/supervisor'

import { freePort } from '@/shared/utils/net'
import { caPath } from '@/shared/utils/paths'
import { evaluateGate, shutdownLevels, withDependencies } from '@/daemon/scheduler'

const TICK_INTERVAL_MS = 1000,
  TICK_DEBOUNCE_MS = 30

/**
 * The control loop: compares the registry's desired state against observed
 * supervisor state and issues actions. A CLI command, a TUI toggle, and a
 * cold daemon boot all flow through the same path.
 */
export class Reconciler {
  /** Services that should be brought up once their gates open. */
  private readonly pendingUp = new Map<string, { noDeps: boolean }>()
  private interval?: ReturnType<typeof setInterval>
  private debounce?: ReturnType<typeof setTimeout>
  private ticking = false

  constructor(
    private readonly registry: Registry,
    private readonly supervisor: Supervisor,
    private readonly router: Router,
    private readonly bus: EventBus,
    private readonly logger: Logger,
  ) {}

  start(): void {
    this.interval = setInterval(() => void this.tick(), TICK_INTERVAL_MS)
    this.bus.on((event) => {
      if (event.type !== 'state' && event.type !== 'probe') return
      this.scheduleTick()
      // Routes die with their service.
      if (
        event.type === 'state' &&
        event.service.entry.route &&
        ['completed', 'error', 'skipped'].includes(event.service.status)
      ) {
        const hostname = this.router.hostnameFor(event.service.entry.route.route)
        void this.router.unregister(hostname).catch(() => undefined)
      }
    })
    // Cold boot: resume everything marked autostart with desired state up.
    const resume = this.registry.list().filter((s) => s.desired === 'up' && s.autostart)
    void this.requestUp(resume.map((s) => s.id))
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval)
    if (this.debounce) clearTimeout(this.debounce)
  }

  /** Current state of one service, synthesising 'pending' for never-started. */
  stateOf = (id: string): ServiceState | undefined => {
    const live = this.supervisor.stateOf(id)
    if (live) return live
    const entry = this.registry.get(id)
    if (!entry) return undefined
    return {
      entry,
      status: 'pending',
      health: 'unknown',
      restarts: 0,
      instances: [],
      routeUrl: entry.route
        ? this.router.urlFor(this.router.hostnameFor(entry.route.route))
        : undefined,
    }
  }

  snapshot(): ServiceState[] {
    return this.registry.list().map((entry) => this.stateOf(entry.id) as ServiceState)
  }

  async requestUp(ids: string[], noDeps = false): Promise<void> {
    const expanded = noDeps ? ids : withDependencies(ids, (id) => this.registry.get(id))
    for (const id of expanded) {
      const entry = this.registry.get(id)
      if (!entry || entry.config.disabled) continue
      this.pendingUp.set(id, { noDeps })
    }
    await this.tick()
  }

  /**
   * Stop services. Reverse dependency order applies when any participant
   * opted into ordered_shutdown, and always for full daemon shutdown.
   */
  async requestDown(ids: string[], forceOrdered = false): Promise<void> {
    for (const id of ids) this.pendingUp.delete(id)
    const entries = ids
      .map((id) => this.registry.get(id))
      .filter((e): e is ServiceEntry => e !== undefined)

    const ordered = forceOrdered || entries.some((e) => e.config.ordered_shutdown)
    if (ordered) {
      for (const level of shutdownLevels(entries))
        await Promise.all(level.map((entry) => this.supervisor.stop(entry.id)))
    } else {
      await Promise.all(entries.map((entry) => this.supervisor.stop(entry.id)))
    }
  }

  /** Apply a replica-count change immediately when the service is live. */
  async applyScale(id: string): Promise<void> {
    const entry = this.registry.get(id)
    if (!entry) return
    if (this.supervisor.isActive(id)) this.supervisor.start(entry)
    else if (entry.desired === 'up') await this.requestUp([id], true)
  }

  /** Stop a service and drop its runtime bookkeeping (before removal). */
  async forgetService(id: string): Promise<void> {
    await this.requestDown([id])
    this.supervisor.forget(id)
  }

  /** Drop stale completed/error runtime state so snapshots use the latest registry entry. */
  refreshInactiveService(id: string): void {
    if (!this.supervisor.isActive(id)) this.supervisor.forget(id)
  }

  async restart(id: string): Promise<void> {
    const entry = this.registry.get(id)
    if (!entry) return
    this.pendingUp.delete(id)
    await this.supervisor.stop(id)
    await this.requestUp([id], true)
  }

  /** Ordered, full shutdown for `outrider off` and daemon exit. */
  async shutdownAll(): Promise<void> {
    this.stop()
    this.pendingUp.clear()
    const running = this.registry.list().filter((s) => this.supervisor.isActive(s.id))
    await this.requestDown(
      running.map((s) => s.id),
      true,
    )
  }

  private scheduleTick(): void {
    this.debounce ??= setTimeout(() => {
      this.debounce = undefined
      void this.tick()
    }, TICK_DEBOUNCE_MS)
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      for (const [id] of [...this.pendingUp]) {
        const entry = this.registry.get(id)
        if (!entry || entry.desired !== 'up') {
          this.pendingUp.delete(id)
          continue
        }
        if (this.supervisor.isActive(id)) {
          this.pendingUp.delete(id)
          continue
        }
        switch (evaluateGate(entry, this.stateOf)) {
          case 'go':
            this.pendingUp.delete(id)
            await this.startService(entry)
            break
          case 'never':
            this.pendingUp.delete(id)
            this.supervisor.markSkipped(entry)
            break
          case 'wait':
            break
        }
      }
    } finally {
      this.ticking = false
    }
  }

  private async startService(entry: ServiceEntry): Promise<void> {
    let routeEnv: Record<string, string> = {}
    let routeUrl: string | undefined

    if (entry.route) {
      const port = entry.route.port ?? freePort(),
        hostname = this.router.hostnameFor(entry.route.route),
        kind =
          entry.routeKind ??
          (entry.route.port !== undefined || entry.route.alias === true ? 'static' : 'managed')
      try {
        const binding = await this.router.register(hostname, port, kind, entry.id)
        routeUrl = binding.url
        routeEnv = {
          PORT: String(port),
          HOST: '127.0.0.1',
          OUTRIDER_URL: binding.url,
          PORTLESS_URL: binding.url,
          __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: '.localhost',
        }
        if (this.registry.proxySettings().tls) routeEnv.NODE_EXTRA_CA_CERTS = caPath
      } catch (err) {
        this.logger.open(entry.id)
        this.logger.write(
          entry.id,
          entry.id,
          'system',
          `route registration failed: ${(err as Error).message}; starting without a route`,
        )
      }
    }

    this.supervisor.start(entry, routeEnv, routeUrl)
  }
}
