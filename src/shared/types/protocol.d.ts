// The JSON contract spoken over the unix socket. CLI and TUI depend on this
// file and the client only; daemon internals never leak across the socket.

import type { ConfigWarning } from '@/shared/types/process-compose'
import type { DesiredState, RegistryModel, ServiceEntry } from '@/shared/types/registry'
import type { RouterInspection } from '@/shared/types/router'

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
  /** Public URL when the service is routed. */
  routeUrl?: string
}

export interface DaemonInfo {
  version: string
  protocol: number
  pid: number
  startedAt: string
}

export interface StateSnapshot {
  daemon: DaemonInfo
  services: ServiceState[]
}

/** What a foreground command (`outrider on`, a TUI repair action) needs to grant trust and sync hosts. */
export interface ProxyStatus {
  inspection: RouterInspection
  tld: string
  hostnames: string[]
}

export interface LogLine {
  service: string
  instance: string
  stream: 'stdout' | 'stderr' | 'system'
  ts: string
  line: string
}

export interface ServiceDefinition {
  name: string
  command: string
  workingDir?: string
  env?: Record<string, string>
  route?: string
  /**
   * When set, the route is pinned to this fixed port instead of an
   * allocated one — for tools that manage their own port and ignore the
   * injected PORT. Requires `route`.
   */
  aliasPort?: number
  restart?: 'no' | 'on_failure' | 'always' | 'exit_on_failure'
  autostart?: boolean
  namespace?: string
  /**
   * Grouping labels. `undefined` leaves an existing service's tags untouched
   * on edit; an array (including `[]`) replaces them.
   */
  tags?: string[]
}

/** One process from a compose file, paired with its editable-field preview. */
export interface ImportProcessPreview {
  /** The process-compose key; stable across renames, used to correlate on apply. */
  processName: string
  definition: ServiceDefinition
}

export interface ImportPreview {
  sourceTag: string
  sources: string[]
  processes: ImportProcessPreview[]
  /** Previously-imported process names no longer present in the file. */
  toRemove: string[]
  /** Resolved start order, one array per dependency level. */
  startOrder: string[][]
  warnings: ConfigWarning[]
}

export interface ImportApplyBody {
  path: string
  sourceTag: string
  approved: ImportProcessPreview[]
  removedProcessNames: string[]
}

export interface ImportApplyResult {
  created: string[]
  updated: string[]
  removed: string[]
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
  /** Service ids, namespaces, tags (including import source tags), or empty for everything. */
  names?: string[]
  noDeps?: boolean
}

export interface ScaleBody {
  replicas: number
}
