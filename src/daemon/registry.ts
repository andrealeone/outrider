import { dirname, resolve } from 'node:path'
import { homedir } from 'node:os'

import type { LoadedProject, ProcessConfig } from '../shared/types/process-compose'
import type { ServiceDefinition } from '../shared/types/protocol'
import type {
  DesiredState,
  RegistryModel,
  ServiceEntry,
  StackEntry,
} from '../shared/types/registry'

import type { EventBus } from './event-bus'
import type { StateStore } from './state-store'

import { nowIso } from '../shared/utils/time'
import { hashProject, stackNameFor } from './config/load'
import { RegistryError } from './registry-error'

export { RegistryError } from './registry-error'

/**
 * The desired model: services, stacks, routes, and autostart flags. Every
 * mutation persists atomically through the store and announces itself on
 * the bus; the reconciler turns the model into reality.
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

  stacks(): StackEntry[] {
    return Object.values(this.model.stacks)
  }

  get(id: string): ServiceEntry | undefined {
    return this.model.services[id]
  }

  snapshot(): RegistryModel {
    return this.model
  }

  /**
   * Resolve user-facing names to service ids: exact id, stack name, or
   * namespace, in that order. No names means everything.
   */
  resolveIds(names?: string[]): string[] {
    if (!names || names.length === 0) return Object.keys(this.model.services)
    const ids = new Set<string>()
    for (const name of names) {
      if (name in this.model.services) {
        ids.add(name)
        continue
      }
      const members = this.list().filter((s) => s.stack === name || s.namespace === name)
      if (members.length === 0)
        throw new RegistryError('not-found', `no service, stack, or namespace named "${name}"`)
      for (const member of members) ids.add(member.id)
    }
    return [...ids]
  }

  /** Import or refresh a stack; returns the ids added, kept, and removed. */
  importProject(project: LoadedProject): { stack: StackEntry; ids: string[]; removed: string[] } {
    const name = stackNameFor(project)
    const dir = dirname(project.sources[0] as string)
    const { config } = project

    const stack: StackEntry = {
      name,
      sourcePath: project.sources[0] as string,
      contentHash: hashProject(project),
      sources: project.sources,
      importedAt: nowIso(),
    }

    const previous = this.list().filter((s) => s.stack === name)
    const nextIds: string[] = []
    const services: Record<string, ServiceEntry> = {}
    const globalEnv = config.environment ?? []

    for (const [procName, proc] of Object.entries(config.processes)) {
      const id = `${name}/${procName}`
      const merged: ProcessConfig = {
        ...proc,
        environment: [...globalEnv, ...(proc.environment ?? [])],
        log_configuration: proc.log_configuration ?? proc.loggerConfig ?? config.log_configuration,
        ordered_shutdown: proc.ordered_shutdown ?? config.ordered_shutdown,
      }
      const existing = this.model.services[id]
      const entry: ServiceEntry = {
        id,
        name: procName,
        stack: name,
        namespace: proc.namespace,
        desired: existing?.desired ?? 'down',
        autostart: existing?.autostart ?? false,
        config: merged,
        dir,
        shell: config.shell,
        route: proc['x-portless'],
      }
      this.assertRouteFree(entry, name)
      services[id] = entry
      nextIds.push(id)
    }

    const removed = previous.map((s) => s.id).filter((id) => !nextIds.includes(id))
    for (const id of removed) delete this.model.services[id]
    Object.assign(this.model.services, services)
    this.model.stacks[name] = stack
    this.persist()
    return { stack, ids: nextIds, removed }
  }

  removeStack(name: string): string[] {
    if (!(name in this.model.stacks))
      throw new RegistryError('not-found', `no stack named "${name}"`)
    const ids = this.list()
      .filter((s) => s.stack === name)
      .map((s) => s.id)
    for (const id of ids) delete this.model.services[id]
    delete this.model.stacks[name]
    this.persist()
    return ids
  }

  private entryFromDefinition(def: ServiceDefinition, previous?: ServiceEntry): ServiceEntry {
    const route = def.route ? { ...previous?.route, route: def.route } : undefined
    const config: ProcessConfig = {
      ...(previous?.config ?? {}),
      'command': def.command,
      'working_dir': def.workingDir,
      'availability': def.restart
        ? { ...(previous?.config.availability ?? {}), restart: def.restart }
        : previous?.config.availability,
      'x-portless': route,
    }
    if (def.env !== undefined) {
      config.environment = Object.entries(def.env).map(([k, v]) => `${k}=${v}`)
    } else if (previous === undefined) {
      config.environment = []
    }

    return {
      id: previous?.id ?? def.name,
      name: previous?.name ?? def.name,
      stack: previous?.stack,
      namespace: def.namespace ?? previous?.namespace,
      desired: previous?.desired ?? 'down',
      autostart: def.autostart ?? previous?.autostart ?? false,
      config,
      dir: previous?.dir ?? (def.workingDir ? resolve(def.workingDir) : homedir()),
      shell: previous?.shell,
      route,
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

  /** Replace a service's editable fields, preserving desired state and stack metadata. */
  updateService(id: string, def: ServiceDefinition): ServiceEntry {
    const existing = this.model.services[id]
    if (!existing) throw new RegistryError('not-found', `no service "${id}"`)
    this.validateDefinition(def, id)
    const entry = this.entryFromDefinition(def, existing)
    this.assertRouteFree(entry)
    this.model.services[id] = entry
    this.persist()
    return entry
  }

  /** `editOf` validates edits against the existing entry, including stack members. */
  validateDefinition(def: ServiceDefinition, editOf?: string): void {
    const existing = editOf === undefined ? undefined : this.model.services[editOf]
    if (existing !== undefined) {
      if (def.name !== existing.name) {
        throw new RegistryError('invalid', 'renaming is not supported; delete and recreate instead')
      }
      if (!def.command?.trim()) throw new RegistryError('invalid', 'command is required')
      return
    }

    if (!def.name || !/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/i.test(def.name)) {
      throw new RegistryError(
        'invalid',
        'service name must be alphanumeric with dashes or underscores',
      )
    }
    if (def.name.includes('/'))
      throw new RegistryError('invalid', 'standalone names cannot contain "/"')
    if (this.model.services[def.name]) {
      throw new RegistryError('conflict', `service "${def.name}" already exists`)
    }
    if (!def.command?.trim()) throw new RegistryError('invalid', 'command is required')
  }

  remove(id: string): ServiceEntry {
    const entry = this.model.services[id]
    if (!entry) throw new RegistryError('not-found', `no service "${id}"`)
    if (entry.stack !== undefined) {
      throw new RegistryError(
        'invalid',
        `"${id}" belongs to stack "${entry.stack}"; remove or re-import the stack instead`,
      )
    }
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
    if (!Number.isInteger(replicas) || replicas < 0) {
      throw new RegistryError('invalid', 'replicas must be a non-negative integer')
    }
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

  /** Global route uniqueness across stacks and standalone services. */
  private assertRouteFree(candidate: ServiceEntry, replacingStack?: string): void {
    const route = candidate.route?.route
    if (route === undefined) return
    const claimant = this.list().find(
      (s) =>
        s.id !== candidate.id &&
        s.route?.route === route &&
        (replacingStack === undefined || s.stack !== replacingStack),
    )
    if (claimant) {
      throw new RegistryError(
        'route-conflict',
        `route "${route}" is already claimed by "${claimant.id}"; routes are unique system-wide`,
      )
    }
  }

  private persist(): void {
    this.store.saveRegistry(this.model)
    this.bus.emit({ type: 'registry', registry: this.model })
  }
}
