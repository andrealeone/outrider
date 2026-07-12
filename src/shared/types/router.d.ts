// The boundary around the routing subsystem. The daemon, TUI, and CLI reach
// the in-process proxy only through this interface, so the engine underneath
// (plain HTTP today, TLS/HTTP2 from Phase R2) can change without callers
// noticing.

import type { RouteKind } from '@/shared/types/registry'

export interface RouteBinding {
  hostname: string
  port: number
  url: string
}

export interface RouteInfo extends RouteBinding {
  kind: RouteKind
  service?: string
  live: boolean
}

export interface RouterInspection {
  listening: boolean
  port: number
  tls: boolean
  certTrusted: boolean
  hostsSynced: boolean
  issues: string[]
}

export interface Router {
  /** Confirm listener, certificates, and hosts block; repair what it can. */
  ensureReady(): Promise<RouterInspection>
  /** Idempotent upsert: adds a route or refreshes the port of an existing one. */
  register(hostname: string, port: number, kind: RouteKind, service?: string): Promise<RouteBinding>
  unregister(hostname: string): Promise<void>
  list(): RouteInfo[]
  inspect(): RouterInspection
  /** Full hostname for a route label, honouring the configured TLD. */
  hostnameFor(label: string): string
  urlFor(hostname: string): string
}
