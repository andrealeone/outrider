import type { ServiceDefinition } from '../types/protocol'
import type { RegistryModel } from '../types/registry'

import { canonical, entryToSyncService, type SyncDoc, type SyncService, toDefinition } from './sync-file'

export type SyncOp =
  | { kind: 'create'; name: string; def: ServiceDefinition }
  | { kind: 'update'; name: string; def: ServiceDefinition; changes: string[] }
  | { kind: 'delete'; name: string }

const COMPARE_FIELDS: (keyof SyncService)[] = [
  'command',
  'working_dir',
  'autostart',
  'restart',
  'tags',
  'route',
  'alias_port',
  'namespace',
  'env',
]

const changedFields = (a: SyncService, b: SyncService): string[] =>
  COMPARE_FIELDS.filter((f) => JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null))

/**
 * Compare the registry's standalone services against the desired YAML and
 * produce the operations that would reconcile them. Stack members never
 * participate: they are owned by their compose files. Pure and deterministic.
 */
export const diff = (current: RegistryModel, desired: SyncDoc): SyncOp[] => {
  const standalone = Object.values(current.services).filter((e) => e.stack === undefined)
  const byName = new Map(standalone.map((e) => [e.id, e]))
  const ops: SyncOp[] = []

  for (const [name, rawSvc] of Object.entries(desired.services)) {
    const want = canonical(rawSvc)
    const entry = byName.get(name)
    if (entry === undefined) {
      ops.push({ kind: 'create', name, def: toDefinition(name, want) })
      continue
    }
    const changes = changedFields(canonical(entryToSyncService(entry)), want)
    if (changes.length > 0) {
      ops.push({ kind: 'update', name, def: toDefinition(name, want), changes })
    }
  }

  for (const entry of standalone) {
    if (!Object.prototype.hasOwnProperty.call(desired.services, entry.id)) {
      ops.push({ kind: 'delete', name: entry.id })
    }
  }

  return ops.sort((a, b) => a.name.localeCompare(b.name))
}
