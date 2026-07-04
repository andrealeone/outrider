import type { ProcessConfig } from '@/shared/types/process-compose'
import type { ServiceState } from '@/shared/types/protocol'
import type { ServiceEntry } from '@/shared/types/registry'

import { startOrder } from './config/dag'

export type GateResult = 'go' | 'wait' | 'never'

const TERMINAL: ReadonlySet<string> = new Set(['completed', 'error', 'skipped'])

/** Decide one dependency condition against the dependency's live state. */
const gateForCondition = (condition: string, state: ServiceState | undefined): GateResult => {
  const status = state?.status ?? 'pending'
  const gone = TERMINAL.has(status)
  switch (condition) {
    case 'process_started':
      if (status === 'running' || status === 'completed') return 'go'
      return status === 'skipped' || status === 'error' ? 'never' : 'wait'
    case 'process_completed':
      if (status === 'completed' || status === 'error') return 'go'
      return status === 'skipped' ? 'never' : 'wait'
    case 'process_completed_successfully':
      if (status === 'completed' && state?.exitCode === 0) return 'go'
      return gone ? 'never' : 'wait'
    case 'process_healthy':
    case 'process_log_ready':
      if (state?.health === 'ready' && status === 'running') return 'go'
      return gone ? 'never' : 'wait'
    default:
      return 'wait'
  }
}

/**
 * Gate one service's start on its depends_on conditions, evaluated against
 * live state. 'never' means the condition cannot be satisfied any more
 * (failed or skipped dependency), which cascades a skip.
 */
export const evaluateGate = (
  entry: ServiceEntry,
  stateOf: (id: string) => ServiceState | undefined,
): GateResult => {
  let result: GateResult = 'go'
  for (const [dep, depConfig] of Object.entries(entry.config.depends_on ?? {})) {
    const depId = entry.stack === undefined ? dep : `${entry.stack}/${dep}`
    const single = gateForCondition(depConfig?.condition ?? 'process_started', stateOf(depId))
    if (single === 'never') return 'never'
    if (single === 'wait') result = 'wait'
  }
  return result
}

/** Expand a set of ids with their transitive in-stack dependencies. */
export const withDependencies = (
  ids: string[],
  get: (id: string) => ServiceEntry | undefined,
): string[] => {
  const out = new Set<string>()
  const visit = (id: string): void => {
    if (out.has(id)) return
    const entry = get(id)
    if (!entry) return
    out.add(id)
    for (const dep of Object.keys(entry.config.depends_on ?? {})) {
      visit(entry.stack === undefined ? dep : `${entry.stack}/${dep}`)
    }
  }
  for (const id of ids) visit(id)
  return [...out]
}

/**
 * Compute reverse dependency order for shutdown: dependents stop before the
 * services they depend on. Entries from different stacks shut down in
 * parallel within each level.
 */
export const shutdownLevels = (entries: ServiceEntry[]): ServiceEntry[][] => {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const configs: Record<string, ProcessConfig> = {}
  for (const entry of entries) {
    // Rebuild a DAG over ids, keeping only edges inside the stopping set.
    const deps: Record<string, object> = {}
    for (const dep of Object.keys(entry.config.depends_on ?? {})) {
      const depId = entry.stack === undefined ? dep : `${entry.stack}/${dep}`
      if (byId.has(depId)) deps[depId] = {}
    }
    configs[entry.id] = { depends_on: deps } as ProcessConfig
  }
  return startOrder(configs)
    .reverse()
    .map((level) => level.map((id) => byId.get(id) as ServiceEntry))
}
