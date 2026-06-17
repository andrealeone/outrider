// The plaintext mirror of the registry at ~/.config/outrider.yml. The daemon
// re-exports it on every registry change; `outrider sync` reads it back and
// reconciles. Only standalone services round-trip — stack members are owned by
// their compose files and are never written here.

import type { ServiceDefinition } from '../types/protocol'
import type { RegistryModel, ServiceEntry } from '../types/registry'

import { atomicWrite } from '../utils/atomic-file'
import { configYmlPath } from '../utils/paths'
import { normalizeTags } from '../utils/tags'

/** One service as it appears in the YAML file. Mirrors the editable definition. */
export interface SyncService {
  command: string
  working_dir?: string
  autostart?: boolean
  restart?: 'no' | 'on_failure' | 'always'
  tags?: string[]
  route?: string
  alias_port?: number
  namespace?: string
  env?: Record<string, string>
}

export interface SyncDoc {
  services: Record<string, SyncService>
}

/** Thrown on a malformed file; callers surface the message. */
class SyncError extends Error {}

const HEADER = `# outrider services — a plaintext mirror of the registry.
# The daemon rewrites this file whenever you add, edit, or remove a service.
# To edit at scale: change it here, then run \`outrider sync\` to apply the diff.
# Only standalone services appear; stack members are owned by their compose files.
`

const parseEnvLines = (lines?: string[]): Record<string, string> | undefined => {
  if (lines === undefined || lines.length === 0) return undefined
  const env: Record<string, string> = {}
  for (const line of lines) {
    const eq = line.indexOf('=')
    if (eq === -1) continue
    env[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return Object.keys(env).length > 0 ? env : undefined
}

/** Project a registry entry to its file form, dropping fields at their defaults. */
export const entryToSyncService = (entry: ServiceEntry): SyncService => {
  const svc: SyncService = { command: entry.config.command ?? '' }
  if (entry.config.working_dir) svc.working_dir = entry.config.working_dir
  if (entry.autostart) svc.autostart = true
  const restart = entry.config.availability?.restart
  if (restart !== undefined && restart !== 'no') svc.restart = restart as SyncService['restart']
  if (entry.tags && entry.tags.length > 0) svc.tags = entry.tags
  if (entry.route?.route) svc.route = entry.route.route
  if (entry.route?.alias && entry.route.port !== undefined) svc.alias_port = entry.route.port
  if (entry.namespace) svc.namespace = entry.namespace
  const env = parseEnvLines(entry.config.environment)
  if (env) svc.env = env
  return svc
}

/**
 * Canonical form for comparison: trims, drops defaults, normalises tags, and
 * sorts tag and env keys so a reorder in the file is not seen as a change.
 */
export const canonical = (svc: SyncService): SyncService => {
  const out: SyncService = { command: svc.command.trim() }
  if (svc.working_dir?.trim()) out.working_dir = svc.working_dir.trim()
  if (svc.autostart) out.autostart = true
  if (svc.restart !== undefined && svc.restart !== 'no') out.restart = svc.restart
  const tags = normalizeTags(svc.tags)
  if (tags) out.tags = [...tags].sort()
  if (svc.route?.trim()) out.route = svc.route.trim()
  if (svc.alias_port !== undefined && !Number.isNaN(svc.alias_port)) out.alias_port = svc.alias_port
  if (svc.namespace?.trim()) out.namespace = svc.namespace.trim()
  if (svc.env && Object.keys(svc.env).length > 0) {
    out.env = Object.fromEntries(Object.entries(svc.env).sort(([a], [b]) => a.localeCompare(b)))
  }
  return out
}

/** Build an API definition from a file service (apply the canonical intent). */
export const toDefinition = (name: string, svc: SyncService): ServiceDefinition => {
  const c = canonical(svc)
  return {
    name,
    command: c.command,
    workingDir: c.working_dir,
    env: c.env,
    route: c.route,
    aliasPort: c.alias_port,
    restart: c.restart,
    autostart: c.autostart ?? false,
    namespace: c.namespace,
    tags: c.tags ?? [],
  }
}

/** Serialise the standalone services of a registry to YAML, sorted by id. */
export const exportRegistry = (model: RegistryModel): string => {
  const services: Record<string, SyncService> = {}
  for (const entry of Object.values(model.services).sort((a, b) => a.id.localeCompare(b.id))) {
    if (entry.stack !== undefined) continue
    services[entry.id] = entryToSyncService(entry)
  }
  return `${HEADER}${Bun.YAML.stringify({ services }, null, 2)}`
}

/** Write the export atomically; called by the daemon on every registry change. */
export const writeSyncFile = (model: RegistryModel, path: string = configYmlPath): void => {
  atomicWrite(path, exportRegistry(model))
}

const coerceTags = (name: string, value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(',')
  throw new SyncError(`service "${name}": tags must be a list or comma-separated string`)
}

const coerceEnv = (name: string, value: unknown): Record<string, string> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SyncError(`service "${name}": env must be a mapping of KEY: value`)
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
}

const coerceService = (name: string, raw: unknown): SyncService => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SyncError(`service "${name}" must be a mapping`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.command !== 'string' || r.command.trim() === '') {
    throw new SyncError(`service "${name}" needs a command`)
  }
  const svc: SyncService = { command: r.command }
  if (r.working_dir !== undefined) svc.working_dir = String(r.working_dir)
  if (r.autostart !== undefined) svc.autostart = Boolean(r.autostart)
  if (r.restart !== undefined) svc.restart = String(r.restart) as SyncService['restart']
  if (r.tags !== undefined) svc.tags = coerceTags(name, r.tags)
  if (r.route !== undefined) svc.route = String(r.route)
  if (r.alias_port !== undefined) svc.alias_port = Number(r.alias_port)
  if (r.namespace !== undefined) svc.namespace = String(r.namespace)
  if (r.env !== undefined) svc.env = coerceEnv(name, r.env)
  return svc
}

/** Parse the file; tolerant of an empty or services-less document. */
export const parseSyncFile = (text: string): SyncDoc => {
  let tree: unknown
  try {
    tree = Bun.YAML.parse(text)
  } catch (err) {
    throw new SyncError(`YAML parse error: ${(err as Error).message}`)
  }
  if (tree === null || tree === undefined) return { services: {} }
  if (typeof tree !== 'object' || Array.isArray(tree)) {
    throw new SyncError('top level must be a mapping with a "services" key')
  }
  const node = (tree as Record<string, unknown>).services
  if (node === undefined || node === null) return { services: {} }
  if (typeof node !== 'object' || Array.isArray(node)) {
    throw new SyncError('"services" must be a mapping of name → config')
  }
  const services: Record<string, SyncService> = {}
  for (const [name, raw] of Object.entries(node as Record<string, unknown>)) {
    services[name] = coerceService(name, raw)
  }
  return { services }
}
