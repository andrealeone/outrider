import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { Subprocess } from 'bun'
import type { AvailabilityConfig } from '../shared/types/process-compose'
import type {
  InstanceState,
  ProbeHealth,
  ProcessStatus,
  ServiceState,
} from '../shared/types/protocol'
import type { JournalRecord, ServiceEntry } from '../shared/types/registry'

import type { EventBus } from './event-bus'
import type { Logger } from './logger'
import type { Prober } from './prober'

import { parseDotenv, parseEnvList } from '../shared/utils/env'
import { streamLines } from '../shared/utils/stream-lines'
import { nowIso } from '../shared/utils/time'
import { applyFrameworkQuirks } from './framework-quirks'

const DEFAULT_BACKOFF_SECONDS = 1
const DEFAULT_SHUTDOWN_TIMEOUT_SECONDS = 10
const DEFAULT_LAUNCH_TIMEOUT_SECONDS = 60

interface InstanceRuntime {
  name: string
  replica: number
  status: ProcessStatus
  health: ProbeHealth
  pid?: number
  exitCode?: number
  restarts: number
  startedAt?: string
  proc?: Subprocess<'ignore', 'pipe', 'pipe'>
  /** Stop was requested; suppress restarts and treat exit as completed. */
  stopRequested: boolean
  /** is_daemon process whose parent exited successfully. */
  daemonized: boolean
  backoffTimer?: ReturnType<typeof setTimeout>
  launchTimer?: ReturnType<typeof setTimeout>
  cancelReadyWatch?: () => void
  /**
   * Resolves once handleExit has fully processed the exit. proc.exited can
   * settle before the onExit callback runs, so stops await this instead to
   * avoid observing a half-stopped instance.
   */
  settled?: Promise<void>
  settle?: () => void
}

interface ServiceRuntime {
  entry: ServiceEntry
  instances: Map<number, InstanceRuntime>
  routeEnv: Record<string, string>
  routeUrl?: string
  skipped: boolean
}

const STATUS_PRIORITY: ProcessStatus[] = [
  'terminating',
  'restarting',
  'launching',
  'running',
  'error',
  'completed',
]

/**
 * A thin layer over Bun.spawn owning process groups, replica fan-out,
 * restart backoff, exit-code capture, the SIGTERM-wait-SIGKILL ladder, and
 * the canonical process state machine everything else reads.
 */
export class Supervisor {
  private readonly services = new Map<string, ServiceRuntime>()

  constructor(
    private readonly logger: Logger,
    private readonly prober: Prober,
    private readonly bus: EventBus,
    private readonly journal: (record: JournalRecord) => void,
    private readonly restartCounters: Map<string, number> = new Map(),
  ) {}

  /** Aggregate state for one service, or undefined when never managed. */
  stateOf(id: string): ServiceState | undefined {
    const runtime = this.services.get(id)
    return runtime && this.buildState(runtime)
  }

  /** Whether any instance is alive or scheduled to come back. */
  isActive(id: string): boolean {
    const runtime = this.services.get(id)
    if (!runtime) return false
    for (const inst of runtime.instances.values()) {
      if (['launching', 'running', 'terminating', 'restarting'].includes(inst.status)) return true
    }
    return false
  }

  /**
   * Start (or scale to) the entry's replica count. Idempotent per instance.
   * Omitting routeEnv keeps the bindings from the previous start, so a
   * rescale does not lose the allocated port.
   */
  start(entry: ServiceEntry, routeEnv?: Record<string, string>, routeUrl?: string): void {
    const runtime = this.ensureRuntime(entry)
    runtime.entry = entry
    if (routeEnv !== undefined) {
      runtime.routeEnv = routeEnv
      runtime.routeUrl = routeUrl
    }
    runtime.skipped = false

    const replicas = Math.max(entry.config.replicas ?? 1, 0)
    for (let replica = 0; replica < replicas; replica++) {
      const inst = this.ensureInstance(runtime, replica)
      if (inst.proc || inst.backoffTimer || inst.daemonized) continue
      this.spawnInstance(runtime, inst)
    }
    // Scale down: stop replicas beyond the desired count.
    for (const [replica, inst] of runtime.instances) {
      if (replica < replicas) continue
      void (async () => {
        await this.stopInstance(runtime, inst)
        runtime.instances.delete(replica)
        this.emitState(runtime)
      })()
    }
    this.emitState(runtime)
  }

  async stop(id: string): Promise<void> {
    const runtime = this.services.get(id)
    if (!runtime) return
    await Promise.all(
      [...runtime.instances.values()].map((inst) => this.stopInstance(runtime, inst)),
    )
    this.emitState(runtime)
  }

  /** Mark a service skipped: a dependency can never be satisfied. */
  markSkipped(entry: ServiceEntry): void {
    const runtime = this.ensureRuntime(entry)
    runtime.skipped = true
    for (const inst of runtime.instances.values()) {
      if (!inst.proc) inst.status = 'skipped'
    }
    if (runtime.instances.size === 0) {
      const inst = this.ensureInstance(runtime, 0)
      inst.status = 'skipped'
    }
    this.journal({ ts: nowIso(), type: 'status', service: entry.id, data: { status: 'skipped' } })
    this.emitState(runtime)
  }

  /** Drop runtime bookkeeping for a removed service (must be stopped first). */
  forget(id: string): void {
    this.services.delete(id)
  }

  private ensureRuntime(entry: ServiceEntry): ServiceRuntime {
    let runtime = this.services.get(entry.id)
    if (!runtime) {
      runtime = { entry, instances: new Map(), routeEnv: {}, skipped: false }
      this.services.set(entry.id, runtime)
      this.logger.open(entry.id, entry.config.log_configuration ?? entry.config.loggerConfig)
    }
    return runtime
  }

  /** Replica 0 keeps the plain id so names stay stable across rescales. */
  private instanceName(entry: ServiceEntry, replica: number): string {
    return replica === 0 ? entry.id : `${entry.id}-${replica}`
  }

  private ensureInstance(runtime: ServiceRuntime, replica: number): InstanceRuntime {
    let inst = runtime.instances.get(replica)
    if (!inst) {
      const name = this.instanceName(runtime.entry, replica)
      inst = {
        name,
        replica,
        status: 'pending',
        health: 'unknown',
        restarts: this.restartCounters.get(name) ?? 0,
        stopRequested: false,
        daemonized: false,
      }
      runtime.instances.set(replica, inst)
    }
    return inst
  }

  private buildEnv(runtime: ServiceRuntime, inst: InstanceRuntime): Record<string, string> {
    const { entry } = runtime
    const env: Record<string, string | undefined> = { ...process.env }

    const dotenvFile = resolve(entry.dir, '.env')
    if (!entry.config.is_dotenv_disabled && existsSync(dotenvFile)) {
      Object.assign(env, parseDotenv(readFileSync(dotenvFile, 'utf8')))
    }
    const envFiles = entry.config.env_file
    for (const file of typeof envFiles === 'string' ? [envFiles] : (envFiles ?? [])) {
      const path = resolve(entry.dir, file)
      if (existsSync(path)) Object.assign(env, parseDotenv(readFileSync(path, 'utf8')))
      else this.logger.write(entry.id, inst.name, 'system', `env_file not found: ${path}`)
    }
    Object.assign(env, parseEnvList(entry.config.environment), runtime.routeEnv)

    // Upstream-compatible names plus outrider aliases.
    env.PC_PROC_NAME = inst.name
    env.PC_REPLICA_NUM = String(inst.replica)
    env.OUTRIDER_SERVICE = entry.id
    env.OUTRIDER_PROC_NAME = inst.name
    env.OUTRIDER_REPLICA_NUM = String(inst.replica)
    if (runtime.routeUrl !== undefined) env.OUTRIDER_URL = runtime.routeUrl

    return Object.fromEntries(
      Object.entries(env).filter((kv): kv is [string, string] => kv[1] !== undefined),
    )
  }

  private argvFor(entry: ServiceEntry, command: string): string[] {
    if (entry.config.entrypoint?.length) return entry.config.entrypoint
    const shell = entry.shell?.shell_command ?? process.env.SHELL ?? '/bin/bash'
    const flag = entry.shell?.shell_argument ?? '-ic'
    return [shell, flag, command]
  }

  private spawnInstance(runtime: ServiceRuntime, inst: InstanceRuntime): void {
    const { entry } = runtime
    let command = entry.config.command ?? ''
    if (entry.route && runtime.routeEnv.PORT !== undefined) {
      command = applyFrameworkQuirks(command, entry.route.framework, runtime.routeEnv.PORT)
    }
    inst.stopRequested = false
    inst.daemonized = false
    inst.exitCode = undefined
    inst.status = 'launching'
    inst.health = 'unknown'
    inst.startedAt = nowIso()
    inst.settled = new Promise((markSettled) => {
      inst.settle = markSettled
    })

    let proc: Subprocess<'ignore', 'pipe', 'pipe'>
    try {
      proc = Bun.spawn({
        cmd: this.argvFor(entry, command),
        cwd: resolve(entry.dir, entry.config.working_dir ?? '.'),
        env: this.buildEnv(runtime, inst),
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        detached: true,
        onExit: (_proc, exitCode, signalCode) => {
          this.handleExit(runtime, inst, exitCode, signalCode)
        },
      })
    } catch (err) {
      inst.status = 'error'
      inst.settle?.()
      this.logger.write(entry.id, inst.name, 'system', `spawn failed: ${(err as Error).message}`)
      this.scheduleRestart(runtime, inst, 1)
      this.emitState(runtime)
      return
    }

    inst.proc = proc
    inst.pid = proc.pid
    void this.pump(entry.id, inst.name, proc.stdout, 'stdout')
    void this.pump(entry.id, inst.name, proc.stderr, 'stderr')

    if (entry.config.is_daemon) {
      const timeout = (entry.config.launch_timeout_seconds ?? DEFAULT_LAUNCH_TIMEOUT_SECONDS) * 1000
      inst.launchTimer = setTimeout(() => {
        if (inst.status === 'launching') {
          this.logger.write(
            entry.id,
            inst.name,
            'system',
            'is_daemon process did not detach within launch_timeout_seconds; supervising it directly',
          )
          inst.status = 'running'
          this.emitState(runtime)
        }
      }, timeout)
    } else {
      inst.status = 'running'
    }

    this.attachReadiness(runtime, inst)
    this.journal({
      ts: nowIso(),
      type: 'status',
      service: inst.name,
      data: { status: inst.status, pid: inst.pid },
    })
    this.emitState(runtime)
  }

  private attachReadiness(runtime: ServiceRuntime, inst: InstanceRuntime): void {
    const { entry } = runtime
    const readyLine = entry.config.ready_log_line
    if (readyLine) {
      inst.cancelReadyWatch = this.logger.watchReadyLine(entry.id, inst.name, readyLine, () => {
        if (inst.health !== 'ready') {
          inst.health = 'ready'
          this.bus.emit({ type: 'probe', service: entry.id, probe: 'readiness', ok: true })
          this.emitState(runtime)
        }
      })
    }

    const probeTarget = {
      serviceId: entry.id,
      instance: inst.name,
      cwd: resolve(entry.dir, entry.config.working_dir ?? '.'),
      port: runtime.routeEnv.PORT,
      routeUrl: runtime.routeUrl,
    }
    if (entry.config.readiness_probe) {
      this.prober.attach({
        ...probeTarget,
        kind: 'readiness',
        probe: entry.config.readiness_probe,
        onTransition: (ok) => {
          inst.health = ok ? 'ready' : 'not_ready'
          this.bus.emit({ type: 'probe', service: entry.id, probe: 'readiness', ok })
          this.emitState(runtime)
        },
      })
    }
    if (entry.config.liveness_probe) {
      this.prober.attach({
        ...probeTarget,
        kind: 'liveness',
        probe: entry.config.liveness_probe,
        onTransition: (ok) => {
          this.bus.emit({ type: 'probe', service: entry.id, probe: 'liveness', ok })
          if (!ok && !inst.stopRequested) {
            this.logger.write(entry.id, inst.name, 'system', 'liveness probe failed; restarting')
            void (async () => {
              await this.stopInstance(runtime, inst)
              this.scheduleRestart(runtime, inst, 0)
            })()
          }
        },
      })
    }
  }

  private async pump(
    serviceId: string,
    instance: string,
    stream: ReadableStream<Uint8Array>,
    name: 'stdout' | 'stderr',
  ): Promise<void> {
    try {
      for await (const line of streamLines(stream))
        this.logger.write(serviceId, instance, name, line)
    } catch {
      // Stream tear-down during kill; nothing to log to.
    }
  }

  private detachInstance(inst: InstanceRuntime): void {
    this.prober.detach(inst.name)
    inst.cancelReadyWatch?.()
    inst.cancelReadyWatch = undefined
    if (inst.launchTimer) clearTimeout(inst.launchTimer)
    if (inst.backoffTimer) {
      clearTimeout(inst.backoffTimer)
      inst.backoffTimer = undefined
    }
  }

  private handleExit(
    runtime: ServiceRuntime,
    inst: InstanceRuntime,
    exitCode: number | null,
    signalCode: number | string | null,
  ): void {
    const { entry } = runtime
    this.detachInstance(inst)
    inst.proc = undefined
    inst.pid = undefined
    inst.exitCode = exitCode ?? undefined
    inst.health = 'unknown'
    this.journal({
      ts: nowIso(),
      type: 'exit',
      service: inst.name,
      data: { exitCode, signal: signalCode },
    })

    if (
      entry.config.is_daemon &&
      exitCode === 0 &&
      inst.status === 'launching' &&
      !inst.stopRequested
    ) {
      inst.daemonized = true
      inst.status = 'running'
      this.logger.write(
        entry.id,
        inst.name,
        'system',
        'daemon detached; tracked via shutdown command',
      )
      this.emitState(runtime)
      inst.settle?.()
      return
    }

    if (inst.stopRequested) {
      inst.status = 'completed'
      this.emitState(runtime)
      inst.settle?.()
      return
    }

    const availability = entry.config.availability ?? {}
    if (this.shouldRestart(availability, inst, exitCode)) {
      this.scheduleRestart(runtime, inst, availability.backoff_seconds ?? DEFAULT_BACKOFF_SECONDS)
    } else {
      inst.status = exitCode === 0 ? 'completed' : 'error'
      this.logger.write(
        entry.id,
        inst.name,
        'system',
        `exited with code ${exitCode ?? `signal ${signalCode}`}`,
      )
    }
    this.emitState(runtime)
    inst.settle?.()
  }

  private shouldRestart(
    availability: AvailabilityConfig,
    inst: InstanceRuntime,
    exitCode: number | null,
  ): boolean {
    // exit_on_failure terminates ephemeral runs; persistent mode treats it as "no".
    const policy = availability.restart ?? 'no'
    if (policy !== 'always' && !(policy === 'on_failure' && exitCode !== 0)) return false
    const max = availability.max_restarts ?? 0
    return max === 0 || inst.restarts < max
  }

  private scheduleRestart(
    runtime: ServiceRuntime,
    inst: InstanceRuntime,
    backoffSeconds: number,
  ): void {
    inst.status = 'restarting'
    inst.restarts += 1
    this.journal({ ts: nowIso(), type: 'restart', service: inst.name })
    inst.backoffTimer = setTimeout(() => {
      inst.backoffTimer = undefined
      if (!inst.stopRequested && !runtime.skipped) this.spawnInstance(runtime, inst)
    }, backoffSeconds * 1000)
    this.emitState(runtime)
  }

  private async runShutdownCommand(runtime: ServiceRuntime, inst: InstanceRuntime): Promise<void> {
    const { entry } = runtime
    const command = entry.config.shutdown?.command as string
    const timeout =
      (entry.config.shutdown?.timeout_seconds ?? DEFAULT_SHUTDOWN_TIMEOUT_SECONDS) * 1000
    const proc = Bun.spawn({
      cmd: this.argvFor(entry, command),
      cwd: resolve(entry.dir, entry.config.working_dir ?? '.'),
      env: this.buildEnv(runtime, inst),
      stdin: 'ignore',
      stdout: 'ignore',
      stderr: 'ignore',
    })
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
    }, timeout)
    await proc.exited
    clearTimeout(timer)
  }

  private async stopInstance(runtime: ServiceRuntime, inst: InstanceRuntime): Promise<void> {
    const { entry } = runtime
    inst.stopRequested = true
    this.detachInstance(inst)

    if (inst.daemonized) {
      // Nothing to signal; the shutdown command is the only handle we have.
      if (entry.config.shutdown?.command) await this.runShutdownCommand(runtime, inst)
      inst.daemonized = false
      inst.status = 'completed'
      this.emitState(runtime)
      return
    }

    const proc = inst.proc
    if (!proc || inst.pid === undefined) {
      if (inst.status !== 'skipped') inst.status = inst.startedAt ? 'completed' : 'pending'
      return
    }

    inst.status = 'terminating'
    this.emitState(runtime)

    if (entry.config.shutdown?.command) {
      await this.runShutdownCommand(runtime, inst)
      if (proc.exitCode === null && proc.signalCode === null) this.killGroup(inst, 'SIGKILL', entry)
      await (inst.settled ?? proc.exited)
      return
    }

    const signal = entry.config.shutdown?.signal ?? 15
    const timeout =
      (entry.config.shutdown?.timeout_seconds ?? DEFAULT_SHUTDOWN_TIMEOUT_SECONDS) * 1000
    this.killGroup(inst, signal, entry)
    const killTimer = setTimeout(() => {
      this.killGroup(inst, 'SIGKILL', entry)
    }, timeout)
    await (inst.settled ?? proc.exited)
    clearTimeout(killTimer)
  }

  /** Signal the whole process group, not only the parent (unless parent_only). */
  private killGroup(
    inst: InstanceRuntime,
    signal: number | NodeJS.Signals,
    entry: ServiceEntry,
  ): void {
    if (inst.pid === undefined) return
    const target = entry.config.shutdown?.parent_only ? inst.pid : -inst.pid
    try {
      process.kill(target, signal)
    } catch {
      // Group already gone, or the leader exited between checks.
    }
  }

  private aggregateStatus(runtime: ServiceRuntime): ProcessStatus {
    if (runtime.skipped) return 'skipped'
    const statuses = [...runtime.instances.values()].map((i) => i.status)
    for (const status of STATUS_PRIORITY) {
      if (statuses.includes(status)) return status
    }
    return statuses.includes('skipped') ? 'skipped' : 'pending'
  }

  private aggregateHealth(runtime: ServiceRuntime): ProbeHealth {
    const { entry } = runtime
    const probed = entry.config.readiness_probe ?? entry.config.ready_log_line
    if (!probed) return 'unknown'
    const alive = [...runtime.instances.values()].filter((i) => i.status === 'running')
    if (alive.length === 0) return 'unknown'
    if (alive.some((i) => i.health === 'not_ready')) return 'not_ready'
    return alive.every((i) => i.health === 'ready') ? 'ready' : 'unknown'
  }

  private buildState(runtime: ServiceRuntime): ServiceState {
    const instances: InstanceState[] = [...runtime.instances.values()].map((inst) => ({
      name: inst.name,
      replica: inst.replica,
      status: inst.status,
      health: inst.health,
      pid: inst.pid,
      exitCode: inst.exitCode,
      restarts: inst.restarts,
      startedAt: inst.startedAt,
    }))
    const first = instances[0]
    return {
      entry: runtime.entry,
      status: this.aggregateStatus(runtime),
      health: this.aggregateHealth(runtime),
      restarts: instances.reduce((sum, i) => sum + i.restarts, 0),
      exitCode: first?.exitCode,
      startedAt: first?.startedAt,
      instances,
      routeUrl: runtime.routeUrl,
    }
  }

  private emitState(runtime: ServiceRuntime): void {
    this.bus.emit({ type: 'state', service: this.buildState(runtime) })
  }
}
