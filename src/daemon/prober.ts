import type { ProbeConfig } from '@/shared/types/process-compose'

// Upstream probe defaults.
const DEFAULT_PERIOD_SECONDS = 10,
  DEFAULT_TIMEOUT_SECONDS = 1,
  DEFAULT_FAILURE_THRESHOLD = 3

export interface ProbeAttachment {
  serviceId: string
  instance: string
  kind: 'readiness' | 'liveness'
  probe: ProbeConfig
  cwd: string
  /** PORT injected for routed services, used as the http_get fallback port. */
  port?: string
  /** Called on ready/not-ready transitions (after failure_threshold breaches). */
  onTransition: (ok: boolean) => void
}

interface ActiveProbe {
  attachment: ProbeAttachment
  timer?: ReturnType<typeof setTimeout>
  interval?: ReturnType<typeof setInterval>
  consecutiveFailures: number
  reportedOk?: boolean
}

/** Runs exec probes through Bun.spawn and http probes through fetch. */
export class Prober {
  private readonly active = new Map<string, ActiveProbe>()

  attach(attachment: ProbeAttachment): void {
    const key = `${attachment.instance}:${attachment.kind}`
    this.detachOne(key)

    const probe: ActiveProbe = { attachment, consecutiveFailures: 0 }
    this.active.set(key, probe)

    const period = (attachment.probe.period_seconds ?? DEFAULT_PERIOD_SECONDS) * 1000,
      initialDelay = (attachment.probe.initial_delay_seconds ?? 0) * 1000

    probe.timer = setTimeout(() => {
      void this.run(probe)
      probe.interval = setInterval(() => void this.run(probe), period)
    }, initialDelay)
  }

  detach(instance: string): void {
    this.detachOne(`${instance}:readiness`)
    this.detachOne(`${instance}:liveness`)
  }

  private detachOne(key: string): void {
    const probe = this.active.get(key)

    if (!probe) return
    if (probe.timer) clearTimeout(probe.timer)
    if (probe.interval) clearInterval(probe.interval)

    this.active.delete(key)
  }

  private async run(probe: ActiveProbe): Promise<void> {
    const ok = await this.check(probe.attachment).catch(() => false),
      threshold = probe.attachment.probe.failure_threshold ?? DEFAULT_FAILURE_THRESHOLD

    if (ok) {
      probe.consecutiveFailures = 0

      if (probe.reportedOk !== true) {
        probe.reportedOk = true
        probe.attachment.onTransition(true)
      }

      return
    }

    probe.consecutiveFailures += 1

    if (probe.consecutiveFailures >= threshold && probe.reportedOk !== false) {
      probe.reportedOk = false
      probe.attachment.onTransition(false)
    }
  }

  private check(attachment: ProbeAttachment): Promise<boolean> {
    const { probe } = attachment

    if (probe.exec?.command !== undefined) return this.checkExec(attachment)
    if (probe.http_get) return this.checkHttp(attachment)

    return Promise.resolve(false)
  }

  private async checkExec(attachment: ProbeAttachment): Promise<boolean> {
    const { probe, cwd } = attachment,
      timeout = (probe.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      proc = Bun.spawn({
        cmd: ['bash', '-c', probe.exec?.command as string],
        cwd: probe.exec?.working_dir ?? cwd,
        stdin: 'ignore',
        stdout: 'ignore',
        stderr: 'ignore',
      })

    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
    }, timeout)

    const code = await proc.exited

    clearTimeout(timer)

    return code === 0
  }

  private async checkHttp(attachment: ProbeAttachment): Promise<boolean> {
    const { probe, port } = attachment,
      http = probe.http_get as NonNullable<typeof probe.http_get>,
      path = http.path ?? '/'

    // Probes hit the service directly on its allocated port, never through
    // the routing proxy: Bun's fetch cannot self-connect to the daemon's own
    // node:http2 TLS listener from within the same process (a runtime
    // limitation, confirmed independently of this codebase), and a health
    // check should not depend on the proxy being healthy anyway.

    const url = `${http.scheme ?? 'http'}://${http.host ?? '127.0.0.1'}:${http.port ?? port ?? 80}${path}`,
      timeout = (probe.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000,
      res = await fetch(url, {
        headers: http.headers,
        signal: AbortSignal.timeout(timeout),
        tls: { rejectUnauthorized: false },
      })

    await res.arrayBuffer().catch(() => undefined)

    return http.status_code !== undefined ? res.status === http.status_code : res.ok
  }
}
