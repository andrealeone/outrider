import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

import type { LoadedProject, ProcessConfig } from '@/shared/types/process-compose'
import type { ImportProcessPreview, ServiceDefinition } from '@/shared/types/protocol'
import type {
  DesiredState,
  ProxySettings,
  RegistryModel,
  RouteRecord,
  ServiceEntry,
} from '@/shared/types/registry'
import { isValidTag, normalizeTags as normalize, toTagList } from '@/shared/utils/tags'

import type { EventBus } from '@/daemon/event-bus'
import type { StateStore } from '@/daemon/state-store'

import { importTagFor } from '@/daemon/config/load'
import { isPinnedRoute, routeExtension } from '@/daemon/config/validate'
import { RegistryError } from '@/daemon/registry-error'

const NAME_PATTERN = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/i

/** Normalize tags and reject any malformed one, as the registry stores them. */
const normalizeTags = (tags?: string[]): string[] | undefined => {
  const cleaned = normalize(tags)

  for (const tag of cleaned ?? [])
    if (!isValidTag(tag))
      throw new RegistryError('invalid', `invalid tag "${tag}"; use letters, digits, and dashes`)

  return cleaned
}

const validateName = (name: string): void => {
  if (!name || !NAME_PATTERN.test(name))
    throw new RegistryError(
      'invalid',
      'service name must be alphanumeric with dashes or underscores',
    )

  if (name.includes('/')) throw new RegistryError('invalid', 'names cannot contain "/"')
}

/**
 * The desired model: services, routes, and autostart flags. Every mutation
 * persists atomically through the store and announces itself on the bus; the
 * reconciler turns the model into reality.
 */
export class Registry {
  private model: RegistryModel

  constructor(
    private readonly store: StateStore,
    private readonly bus: EventBus,
  ) {
    this.model = store.loadRegistry()
  }

  list(): ServiceEntry[] {
    return Object.values(this.model.services)
  }

  get(id: string): ServiceEntry | undefined {
    return this.model.services[id]
  }

  snapshot(): RegistryModel {
    return this.model
  }

  /**
   * Resolve user-facing names to service ids. An exact id wins outright;
   * otherwise a name resolves to the union of every namespace, tag, and
   * import source tag that bears it. No names means everything.
   */
  resolveIds(names?: string[]): string[] {
    if (!names || names.length === 0) return Object.keys(this.model.services)

    const ids = new Set<string>()

    for (const name of names) {
      if (name in this.model.services) {
        ids.add(name)
        continue
      }

      const members = this.list().filter(
        (s) => s.sourceTag === name || s.namespace === name || s.tags?.includes(name),
      )

      if (members.length === 0)
        throw new RegistryError('not-found', `no service, namespace, or tag named "${name}"`)

      for (const member of members) ids.add(member.id)
    }

    return [...ids]
  }

  /** Editable-field preview of every process in a compose file, ready for approval. */
  previewImport(project: LoadedProject): {
    sourceTag: string
    processes: ImportProcessPreview[]
    toRemove: string[]
  } {
    const sourceTag = importTagFor(project),
      { config } = project,
      previous = new Map(
        this.list()
          .filter((s) => s.sourceTag === sourceTag)
          .map((s) => [s.sourceProcess ?? s.name, s]),
      )

    const seen = new Set<string>(),
      processes: ImportProcessPreview[] = Object.entries(config.processes).map(
        ([processName, proc]) => {
          seen.add(processName)

          const route = routeExtension(proc),
            existing = previous.get(processName),
            definition: ServiceDefinition = {
              name: existing?.name ?? processName,
              command: proc.command ?? '',
              workingDir: proc.working_dir,
              route: route?.route,
              aliasPort: route?.port,
              restart: proc.availability?.restart ?? 'no',
              autostart: existing?.autostart ?? false,
              tags: normalizeTags(toTagList(proc['x-tags'])),
            }

          return { processName, definition }
        },
      )

    const toRemove = [...previous.keys()].filter((name) => !seen.has(name))

    return { sourceTag, processes, toRemove }
  }

  /**
   * Apply an approved subset of a compose file's processes. Processes absent
   * from both `approved` and `removedProcessNames` (rejected but still
   * present in the file) are left untouched. Returns the resulting ids by
   * outcome, keyed by their final name.
   */
  applyImportBatch(
    project: LoadedProject,
    sourceTag: string,
    approved: ImportProcessPreview[],
    removedProcessNames: string[],
  ): { created: string[]; updated: string[]; removed: string[] } {
    const dir = dirname(project.sources[0] as string),
      { config } = project,
      globalEnv = config.environment ?? [],
      previous = new Map(
        this.list()
          .filter((s) => s.sourceTag === sourceTag)
          .map((s) => [s.sourceProcess ?? s.name, s]),
      ),
      // depends_on keys in the file reference process-compose keys, which a
      // rename during approval can change; remap them to the final names so
      // dependents keep resolving.
      finalNameOf = new Map(approved.map((a) => [a.processName, a.definition.name.trim()]))

    const created: string[] = [],
      updated: string[] = [],
      nextEntries: Record<string, ServiceEntry> = {},
      toDelete = new Set<string>()

    for (const { processName, definition } of approved) {
      const proc = config.processes[processName]

      if (proc === undefined) {
        throw new RegistryError(
          'invalid',
          `process "${processName}" not found in ${project.sources[0]}`,
        )
      }

      const name = definition.name.trim()
      validateName(name)

      const existing = previous.get(processName)
      if (nextEntries[name] !== undefined)
        throw new RegistryError('conflict', `duplicate name "${name}" among approved processes`)

      const persistedConflict = this.model.services[name]
      if (persistedConflict !== undefined && persistedConflict.id !== existing?.id)
        throw new RegistryError('conflict', `service "${name}" already exists`)

      // Preserve x-portless's `alias` flag (a pinned route with no explicit
      // port) across the definition round-trip; ServiceDefinition has no
      // field for it since it's a legacy compat flag, not something edited.
      const parsedRoute = routeExtension(proc),
        route = definition.route?.trim()
          ? {
              route: definition.route.trim(),
              port: definition.aliasPort,
              alias: parsedRoute?.alias,
            }
          : undefined,
        dependsOn = proc.depends_on
          ? Object.fromEntries(
              Object.entries(proc.depends_on).map(([dep, cond]) => [
                finalNameOf.get(dep) ?? dep,
                cond,
              ]),
            )
          : undefined

      const merged: ProcessConfig = {
        ...proc,
        'command': definition.command,
        'working_dir': definition.workingDir,
        'availability': {
          ...(proc.availability ?? {}),
          restart: definition.restart ?? proc.availability?.restart,
        },
        'depends_on': dependsOn,
        'x-route': route,
        'environment': [...globalEnv, ...(proc.environment ?? [])],
        'log_configuration':
          proc.log_configuration ?? proc.loggerConfig ?? config.log_configuration,
        'ordered_shutdown': proc.ordered_shutdown ?? config.ordered_shutdown,
      }

      const entry: ServiceEntry = {
        id: name,
        name,
        sourceTag,
        sourceProcess: processName,
        namespace: proc.namespace,
        desired: existing?.desired ?? 'down',
        autostart: definition.autostart ?? existing?.autostart ?? false,
        tags: normalizeTags(definition.tags) ?? existing?.tags,
        config: merged,
        dir,
        shell: config.shell,
        route,
        routeKind: isPinnedRoute(route) ? 'static' : undefined,
      }

      this.assertRouteFree(entry)

      if (existing !== undefined && existing.id !== name) toDelete.add(existing.id)
      nextEntries[name] = entry

      if (existing === undefined) created.push(name)
      else updated.push(name)
    }

    const removed: string[] = []
    for (const processName of removedProcessNames) {
      const existing = previous.get(processName)

      if (existing === undefined) continue

      toDelete.add(existing.id)
      removed.push(existing.id)
    }

    for (const id of toDelete) delete this.model.services[id]

    Object.assign(this.model.services, nextEntries)

    this.persist()

    return { created, updated, removed }
  }

  private entryFromDefinition(def: ServiceDefinition, previous?: ServiceEntry): ServiceEntry {
    // An alias port pins a fixed port instead of an allocated one (the
    // command owns it already); clearing it reverts to an allocated port.
    // A pinned port on a standalone service is what makes it a static route.
    const pinnedPort = def.aliasPort ?? previous?.route?.port,
      route = def.route
        ? {
            ...previous?.route,
            route: def.route,
            port: pinnedPort,
          }
        : undefined

    const config: ProcessConfig = {
      ...(previous?.config ?? {}),
      'command': def.command,
      'working_dir': def.workingDir,
      'availability': def.restart
        ? { ...(previous?.config.availability ?? {}), restart: def.restart }
        : previous?.config.availability,
      'x-route': route,
    }

    if (def.env !== undefined)
      config.environment = Object.entries(def.env).map(([k, v]) => `${k}=${v}`)
    else if (previous === undefined) config.environment = []

    return {
      id: def.name,
      name: def.name,
      sourceTag: previous?.sourceTag,
      sourceProcess: previous?.sourceProcess,
      namespace: def.namespace ?? previous?.namespace,
      desired: previous?.desired ?? 'down',
      autostart: def.autostart ?? previous?.autostart ?? false,
      tags: def.tags === undefined ? previous?.tags : normalizeTags(def.tags),
      config,
      dir: previous?.dir ?? (def.workingDir ? resolve(def.workingDir) : homedir()),
      shell: previous?.shell,
      route,
      routeKind: route?.port !== undefined ? 'static' : undefined,
    }
  }

  addStandalone(def: ServiceDefinition): ServiceEntry {
    this.validateDefinition(def)

    const entry = this.entryFromDefinition(def)

    this.assertRouteFree(entry)
    this.model.services[entry.id] = entry
    this.persist()

    return entry
  }

  /** Replace a service's editable fields, preserving desired state and import metadata. */
  updateService(id: string, def: ServiceDefinition): ServiceEntry {
    const existing = this.model.services[id]

    if (!existing) throw new RegistryError('not-found', `no service "${id}"`)
    this.validateDefinition(def, id)

    const entry = this.entryFromDefinition(def, existing)
    this.assertRouteFree(entry)

    if (entry.id !== id) delete this.model.services[id]
    this.model.services[entry.id] = entry
    this.persist()

    return entry
  }

  /** `editOf` validates a rename against every other existing entry. */
  validateDefinition(def: ServiceDefinition, editOf?: string): void {
    if (def.aliasPort !== undefined) {
      if (!def.route?.trim()) throw new RegistryError('invalid', 'an alias port requires a route')
      if (!Number.isInteger(def.aliasPort) || def.aliasPort < 1 || def.aliasPort > 65535)
        throw new RegistryError('invalid', 'alias port must be an integer between 1 and 65535')
    }

    for (const tag of def.tags ?? [])
      if (tag.trim() !== '' && !isValidTag(tag.trim()))
        throw new RegistryError('invalid', `invalid tag "${tag}"; use letters, digits, and dashes`)

    validateName(def.name)

    const existing = editOf === undefined ? undefined : this.model.services[editOf],
      conflict = this.model.services[def.name]

    if (conflict !== undefined && conflict.id !== existing?.id)
      throw new RegistryError('conflict', `service "${def.name}" already exists`)

    if (!def.command?.trim()) throw new RegistryError('invalid', 'command is required')
  }

  remove(id: string): ServiceEntry {
    const entry = this.model.services[id]

    if (!entry) throw new RegistryError('not-found', `no service "${id}"`)

    delete this.model.services[id]

    this.persist()

    return entry
  }

  setDesired(ids: string[], desired: DesiredState): ServiceEntry[] {
    const entries = ids.map((id) => {
      const entry = this.model.services[id]

      if (!entry) throw new RegistryError('not-found', `no service "${id}"`)
      entry.desired = desired

      return entry
    })

    this.persist()

    return entries
  }

  setReplicas(id: string, replicas: number): ServiceEntry {
    const entry = this.model.services[id]

    if (!entry) throw new RegistryError('not-found', `no service "${id}"`)
    if (!Number.isInteger(replicas) || replicas < 0)
      throw new RegistryError('invalid', 'replicas must be a non-negative integer')

    entry.config.replicas = replicas
    this.persist()

    return entry
  }

  setAutostart(id: string, autostart: boolean): ServiceEntry {
    const entry = this.model.services[id]

    if (!entry) throw new RegistryError('not-found', `no service "${id}"`)

    entry.autostart = autostart
    this.persist()

    return entry
  }

  /** Global route uniqueness across every service. */
  private assertRouteFree(candidate: ServiceEntry): void {
    const route = candidate.route?.route

    if (route === undefined) return

    const claimant = this.list().find((s) => s.id !== candidate.id && s.route?.route === route)

    if (claimant)
      throw new RegistryError(
        'route-conflict',
        `route "${route}" is already claimed by "${claimant.id}"; routes are unique system-wide`,
      )
  }

  routes(): RouteRecord[] {
    return Object.values(this.model.routes)
  }

  route(hostname: string): RouteRecord | undefined {
    return this.model.routes[hostname]
  }

  upsertRoute(record: RouteRecord): void {
    this.model.routes[record.hostname] = record
    this.persist()
  }

  removeRoute(hostname: string): void {
    delete this.model.routes[hostname]
    this.persist()
  }

  proxySettings(): ProxySettings {
    return this.model.proxy
  }

  private persist(): void {
    this.store.saveRegistry(this.model)
    this.bus.emit({ type: 'registry', registry: this.model })
  }
}
