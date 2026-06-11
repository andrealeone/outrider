import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { formatUrl, parseHostname, PORTLESS_HEADER, RouteStore } from 'portless'

import type { RouteBinding, Router, RouterStatus } from '../shared/types/router'

import { waitFor } from '../shared/utils/time'

// Hostname policy: .localhost resolves natively in browsers, .test is the
// IANA-reserved alternative; .local collides with mDNS and .dev is
// HSTS-forced by Google, so both are refused.
const REFUSED_TLDS = new Set(['local', 'dev'])

const PROXY_START_TIMEOUT_MS = 8000

/**
 * The portless bridge. Portless is pre-1.0 and its state format may change
 * between releases, so every call into it lives in this one file behind the
 * Router interface; nothing else imports the package.
 */
export class PortlessRouter implements Router {
  private readonly stateDir: string
  private readonly store: RouteStore
  private warnedMissingCli = false

  constructor(private readonly log: (message: string) => void) {
    this.stateDir = process.env.PORTLESS_STATE_DIR ?? join(homedir(), '.portless')
    this.store = new RouteStore(this.stateDir, { onWarning: log })
  }

  private readStateFile(name: string): string | undefined {
    const path = join(this.stateDir, name)
    if (!existsSync(path)) return undefined
    return readFileSync(path, 'utf8').trim() || undefined
  }

  private get tld(): string {
    const tld = this.readStateFile('proxy.tld') ?? 'localhost'
    return REFUSED_TLDS.has(tld) ? 'localhost' : tld
  }

  private get tls(): boolean {
    return this.readStateFile('proxy.tls') !== '0'
  }

  private get proxyPort(): number {
    const raw = Number(this.readStateFile('proxy.port'))
    return Number.isInteger(raw) && raw > 0 ? raw : this.tls ? 443 : 80
  }

  urlFor(route: string): string {
    return formatUrl(parseHostname(route, this.tld), this.proxyPort, this.tls)
  }

  private async proxyRunning(): Promise<boolean> {
    const scheme = this.tls ? 'https' : 'http'
    try {
      const res = await fetch(`${scheme}://127.0.0.1:${this.proxyPort}/`, {
        signal: AbortSignal.timeout(1500),
        tls: { rejectUnauthorized: false },
      })
      await res.arrayBuffer().catch(() => undefined)
      return res.headers.get(PORTLESS_HEADER) === '1'
    } catch {
      return false
    }
  }

  /** Check, start, and repair the proxy; exactly one component owns this. */
  async ensureProxy(): Promise<boolean> {
    if (await this.proxyRunning()) return true

    const cli = process.env.OUTRIDER_PORTLESS_BIN ?? Bun.which('portless')
    if (cli === null || cli === undefined) {
      if (!this.warnedMissingCli) {
        this.warnedMissingCli = true
        this.log(
          'portless CLI not found on PATH; routed services start without hostnames. ' +
            'Install it with "bun add -g portless" (or npm i -g portless)',
        )
      }
      return false
    }

    this.log('starting portless proxy')
    Bun.spawn({ cmd: [cli, 'proxy', 'start'], stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' })
    const up = await waitFor(() => this.proxyRunning(), PROXY_START_TIMEOUT_MS, 250)
    if (!up) this.log('portless proxy did not come up; check "portless status"')
    return up
  }

  async register(route: string, port: number, alias = false): Promise<RouteBinding> {
    await this.ensureProxy()
    const hostname = parseHostname(route, this.tld)
    // Managed routes register under the daemon's pid: portless prunes routes
    // whose owner died, so a crashed daemon leaves no stale claims behind.
    // Aliases use pid 0 — the same static-route mechanism as `portless alias`,
    // for external tools that own their port. portless never prunes those, so
    // the daemon clears them itself (see Reconciler boot/shutdown). force stays
    // off — a route held by a live foreign process is an error, not a kill.
    this.store.addRoute(hostname, port, alias ? 0 : process.pid, false)
    return { route, hostname, port, url: formatUrl(hostname, this.proxyPort, this.tls) }
  }

  unregister(route: string): Promise<void> {
    this.store.removeRoute(parseHostname(route, this.tld))
    return Promise.resolve()
  }

  async status(): Promise<RouterStatus> {
    const proxyRunning = await this.proxyRunning()
    const routes: RouteBinding[] = this.store.loadRoutes().map((r) => ({
      route: r.hostname.split('.')[0] as string,
      hostname: r.hostname,
      port: r.port,
      url: formatUrl(r.hostname, this.proxyPort, this.tls),
    }))
    return { available: Bun.which('portless') !== null, proxyRunning, routes }
  }
}
