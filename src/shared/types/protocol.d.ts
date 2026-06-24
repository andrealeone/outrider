// The JSON contract spoken over the unix socket. CLI and TUI depend on this
// file and the client only; daemon internals never leak across the socket.

import type { ConfigWarning } from './process-compose'
import type { DesiredState, RegistryModel, ServiceEntry } from './registry'

/** Canonical process state machine, mirroring upstream statuses. */
export type ProcessStatus =
  | 'pending'
  | 'launching'
  | 'running'
  | 'completed'
  | 'skipped'
  | 'error'
  | 'terminating'
  | 'restarting'

export type ProbeHealth = 'ready' | 'not_ready' | 'unknown'

export interface InstanceState {
  /** Instance name: equals the service id, or "id-N" for replicas. */
  name: string
  replica: number
  status: ProcessStatus
  health: ProbeHealth
  pid?: number
  exitCode?: number
  restarts: number
  startedAt?: string
}

export interface ServiceState {
  entry: ServiceEntry
  status: ProcessStatus
  health: ProbeHealth
  restarts: number
  exitCode?: number
  startedAt?: string
  instances: InstanceState[]
  /** Public URL when the service is routed through portless. */
  routeUrl?: string
  /** Route declared but portless not installed; routeUrl shows what would work. */
  routePending?: boolean
}

export interface DaemonInfo {
  version: string
  protocol: number
  pid: number
  startedAt: string
  /** Whether the portless CLI is available on PATH. */
  portless: boolean
}

export interface StateSnapshot {
  daemon: DaemonInfo
  services: ServiceState[]
}

export interface LogLine {
  service: string
  instance: string
  stream: 'stdout' | 'stderr' | 'system'
  ts: string
  line: string
}

export interface ImportReport {
  stack: string
  sources: string[]
  services: string[]
  /** Resolved start order, one array per dependency level. */
  startOrder: string[][]
  warnings: ConfigWarning[]
  dryRun: boolean
}

export interface ServiceDefinition {
  name: string
  command: string
  workingDir?: string
  env?: Record<string, string>
  route?: string
  /**
   * When set, the route is a static portless alias pointing at this fixed
   * port — for external tools that manage their own port and ignore the
   * injected PORT. Requires `route`.
   */
  aliasPort?: number
  restart?: 'no' | 'on_failure' | 'always'
  autostart?: boolean
  namespace?: string
  /**
   * Grouping labels. `undefined` leaves an existing service's tags untouched
   * on edit; an array (including `[]`) replaces them.
   */
  tags?: string[]
}

export interface ApiError {
  error: { code: string; message: string }
}

/** Events pushed over the WebSocket stream. */
export type DaemonEvent =
  | { type: 'snapshot'; services: ServiceState[] }
  | { type: 'state'; service: ServiceState }
  | { type: 'registry'; registry: RegistryModel }
  | { type: 'log'; log: LogLine }
  | { type: 'probe'; service: string; probe: 'readiness' | 'liveness'; ok: boolean }
  | { type: 'daemon'; status: 'ready' | 'shutting-down' }

export interface PatchServiceBody {
  desired?: DesiredState
  autostart?: boolean
}

export interface UpDownBody {
  /** Service ids, stack names, or empty for everything. */
  names?: string[]
  noDeps?: boolean
}

export interface ImportBody {
  path: string
  dryRun?: boolean
}

export interface ScaleBody {
  replicas: number
}
