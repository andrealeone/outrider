import type { Registry } from '@/daemon/registry'
import { ProxyEngine } from '@/daemon/router/proxy-engine'
import { RouteTable } from '@/daemon/router/route-table'
import type { RouteKind } from '@/shared/types/registry'
import type { Router, RouteBinding, RouteInfo, RouterInspection } from '@/shared/types/router'

const PLAIN_PRIMARY_PORT = 80
const PLAIN_FALLBACK_PORT = 1354

/**
 * The native router: an in-process reverse proxy backed by the registry's
 * route table. There is no external binary, no state-directory handshake,
 * and no "unavailable" mode: the proxy is part of the daemon and is always
 * there.
 */
class NativeRouter implements Router {
  private readonly routeTable: RouteTable
  private readonly engine: ProxyEngine
  private starting?: Promise<void>

  constructor(registry: Registry, private readonly log: (message: string) => void) {
    this.routeTable = new RouteTable(registry)
    this.engine = new ProxyEngine(this.routeTable, PLAIN_PRIMARY_PORT, PLAIN_FALLBACK_PORT)
  }

  async ensureReady(): Promise<RouterInspection> {
    this.starting ??= (async () => {
      const port = await this.engine.start()
      this.log(`routing proxy listening on ${port}`)
    })()
    await this.starting
    return this.inspect()
  }

  async register(hostname: string, port: number, kind: RouteKind, service?: string): Promise<RouteBinding> {
    await this.ensureReady()
    const record = this.routeTable.upsert(hostname, port, kind, service)
    return { hostname: record.hostname, port: record.port, url: this.urlFor(record.hostname) }
  }

  unregister(hostname: string): Promise<void> {
    this.routeTable.remove(hostname)
    return Promise.resolve()
  }

  list(): RouteInfo[] {
    return this.routeTable.list().map((r) => ({ ...r, url: this.urlFor(r.hostname), live: true }))
  }

  inspect(): RouterInspection {
    const port = this.engine.port
    return {
      listening: port !== undefined,
      port: port ?? PLAIN_PRIMARY_PORT,
      tls: false,
      certTrusted: false,
      hostsSynced: false,
      issues: port === undefined ? ['proxy is not listening'] : [],
    }
  }

  hostnameFor(label: string): string {
    return this.routeTable.hostnameFor(label)
  }

  urlFor(hostname: string): string {
    const port = this.engine.port
    const suffix = port !== undefined && port !== 80 ? `:${port}` : ''
    return `http://${hostname}${suffix}`
  }
}

export const createRouter = (registry: Registry, log: (message: string) => void): Router =>
  new NativeRouter(registry, log)
