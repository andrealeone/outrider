import { connect } from 'node:net'

import { HostsSync } from '@/daemon/router/hosts-sync'
import { RouteTable } from '@/daemon/router/route-table'
import { ProxyEngine } from '@/daemon/router/proxy-engine'
import { CertAuthority } from '@/daemon/router/cert-authority'
import { type Registry } from '@/daemon/registry'

import { type RouteKind } from '@/shared/types/registry'
import type { Router, RouteBinding, RouteInfo, RouterInspection } from '@/shared/types/router'

const PLAIN_PRIMARY_PORT = 80,
  PLAIN_FALLBACK_PORT = 1354,
  TLS_PRIMARY_PORT = 443,
  TLS_FALLBACK_PORT = 1355,
  LIVE_CACHE_MS = 2000,
  LIVE_DIAL_TIMEOUT_MS = 300

/** A short-lived TCP dial: is anything listening on this port right now? */
const dialLive = (port: number): Promise<boolean> =>
  new Promise((resolve) => {
    const socket = connect({ host: '127.0.0.1', port, timeout: LIVE_DIAL_TIMEOUT_MS }),
      settle = (live: boolean): void => {
        socket.destroy()
        resolve(live)
      }

    socket.once('connect', () => {
      settle(true)
    })

    socket.once('timeout', () => {
      settle(false)
    })

    socket.once('error', () => {
      settle(false)
    })
  })

/**
 * The native router: an in-process reverse proxy backed by the registry's
 * route table. There is no external binary, no state-directory handshake,
 * and no "unavailable" mode: the proxy is part of the daemon and is always
 * there.
 */
interface NativeRouterDeps {
  certAuthority?: CertAuthority
  hostsSync?: HostsSync
}

class NativeRouter implements Router {
  private readonly routeTable: RouteTable
  private readonly certAuthority: CertAuthority
  private readonly hostsSync: HostsSync
  private readonly engine: ProxyEngine
  private starting?: Promise<void>
  private readonly liveCache = new Map<number, { checkedAt: number; live: boolean }>()

  constructor(
    registry: Registry,
    private readonly log: (message: string) => void,
    deps: NativeRouterDeps = {},
  ) {
    this.routeTable = new RouteTable(registry)
    this.certAuthority = deps.certAuthority ?? new CertAuthority()
    this.hostsSync = deps.hostsSync ?? new HostsSync()

    const settings = registry.proxySettings(),
      [primary, fallback] = settings.tls
        ? [TLS_PRIMARY_PORT, TLS_FALLBACK_PORT]
        : [PLAIN_PRIMARY_PORT, PLAIN_FALLBACK_PORT]

    this.engine = new ProxyEngine(
      this.routeTable,
      primary,
      fallback,
      settings.tls
        ? () => ({ key: this.certAuthority.leafKey(), cert: this.certAuthority.leafCert() })
        : undefined,
    )
  }

  /** Every hostname the leaf certificate and hosts block must cover. */
  private currentHostnames(): string[] {
    return [this.routeTable.tld(), ...this.routeTable.list().map((r) => r.hostname)]
  }

  /** .localhost resolves natively in Chromium/Firefox; only other TLDs need the hosts block. */
  private needsHostsSync(): boolean {
    return this.routeTable.tld() !== 'localhost'
  }

  private refreshCert(): void {
    if (!this.engine.tls) return

    const changed = this.certAuthority.ensureLeaf(this.currentHostnames())
    if (changed)
      this.engine.setCert({
        key: this.certAuthority.leafKey(),
        cert: this.certAuthority.leafCert(),
      })
  }

  async ensureReady(): Promise<RouterInspection> {
    this.starting ??= (async () => {
      if (this.engine.tls) {
        this.certAuthority.ensureCA()
        this.certAuthority.ensureLeaf(this.currentHostnames())
      }

      const port = await this.engine.start()

      this.log(`routing proxy listening on ${port}${this.engine.tls ? ' (TLS)' : ''}`)
    })()

    await this.starting
    return this.inspect()
  }

  async register(
    hostname: string,
    port: number,
    kind: RouteKind,
    service?: string,
  ): Promise<RouteBinding> {
    await this.ensureReady()

    const record = this.routeTable.upsert(hostname, port, kind, service)

    this.refreshCert()
    return { hostname: record.hostname, port: record.port, url: this.urlFor(record.hostname) }
  }

  unregister(hostname: string): Promise<void> {
    this.routeTable.remove(hostname)
    this.refreshCert()

    return Promise.resolve()
  }

  private async isLive(port: number): Promise<boolean> {
    const cached = this.liveCache.get(port),
      now = Date.now()

    if (cached && now - cached.checkedAt < LIVE_CACHE_MS) return cached.live

    const live = await dialLive(port)
    this.liveCache.set(port, { checkedAt: now, live })

    return live
  }

  async list(): Promise<RouteInfo[]> {
    return Promise.all(
      this.routeTable.list().map(async (r) => ({
        ...r,
        url: this.urlFor(r.hostname),
        live: await this.isLive(r.port),
      })),
    )
  }

  inspect(): RouterInspection {
    const port = this.engine.port,
      tls = this.engine.tls,
      certTrusted = tls && this.certAuthority.isTrusted(),
      hostsSynced =
        !tls || !this.needsHostsSync() || this.hostsSync.isSynced(this.currentHostnames())

    const issues: string[] = []

    if (port === undefined) issues.push('proxy is not listening')

    if (tls && !certTrusted)
      issues.push('the outrider CA is not trusted system-wide; run `outrider on` to grant trust')
    if (tls && !hostsSynced)
      issues.push('/etc/hosts is out of date for the configured TLD; run `outrider on` to sync it')

    return {
      listening: port !== undefined,
      port: port ?? (tls ? TLS_PRIMARY_PORT : PLAIN_PRIMARY_PORT),
      tls,
      certTrusted,
      hostsSynced,
      issues,
    }
  }

  hostnameFor(label: string): string {
    return this.routeTable.hostnameFor(label)
  }

  urlFor(hostname: string): string {
    const port = this.engine.port,
      scheme = this.engine.tls ? 'https' : 'http',
      defaultPort = this.engine.tls ? 443 : 80,
      suffix = port !== undefined && port !== defaultPort ? `:${port}` : ''

    return `${scheme}://${hostname}${suffix}`
  }

  tld(): string {
    return this.routeTable.tld()
  }
}

export const createRouter = (
  registry: Registry,
  log: (message: string) => void,
  deps?: NativeRouterDeps,
): Router => new NativeRouter(registry, log, deps)
