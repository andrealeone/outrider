import type { Registry } from '@/daemon/registry'
import type { RouteKind, RouteRecord } from '@/shared/types/registry'

// Hostname policy: .localhost resolves natively in browsers, .test is the
// IANA-reserved alternative; .local collides with mDNS and .dev is
// HSTS-forced by Google, so both are refused.
const REFUSED_TLDS = new Set(['local', 'dev'])

class RouteConflictError extends Error {}

const normalizeTld = (tld: string): string => (REFUSED_TLDS.has(tld) ? 'localhost' : tld),
  hostnameFor = (label: string, tld: string): string => `${label}.${normalizeTld(tld)}`

/** Registry-backed route CRUD and hostname conflict checks. */
export class RouteTable {
  constructor(private readonly registry: Registry) {}

  tld(): string {
    return normalizeTld(this.registry.proxySettings().tld)
  }

  hostnameFor(label: string): string {
    return hostnameFor(label, this.tld())
  }

  list(): RouteRecord[] {
    return this.registry.routes()
  }

  get(hostname: string): RouteRecord | undefined {
    return this.registry.route(hostname)
  }

  /** Idempotent upsert: re-registering the same owner just refreshes the port. */
  upsert(hostname: string, port: number, kind: RouteKind, service?: string): RouteRecord {
    const existing = this.get(hostname)

    if (existing && existing.service !== service) {
      const claimant = existing.service ?? 'a static route'
      throw new RouteConflictError(`route "${hostname}" is already claimed by "${claimant}"`)
    }

    const record: RouteRecord = { hostname, kind, service, port }

    this.registry.upsertRoute(record)

    return record
  }

  remove(hostname: string): void {
    this.registry.removeRoute(hostname)
  }
}
