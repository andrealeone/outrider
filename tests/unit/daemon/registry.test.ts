import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { LoadedProject, ProcessConfig } from '@/shared/types/process-compose'
import type { ImportProcessPreview, ServiceDefinition } from '@/shared/types/protocol'

import { EventBus } from '@/daemon/event-bus'
import { Registry, RegistryError } from '@/daemon/registry'
import { StateStore } from '@/daemon/state-store'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-registry-'))
let registry: Registry

const def = (over: Partial<ServiceDefinition> = {}): ServiceDefinition => ({
  name: 'api',
  command: 'bun run server.ts',
  ...over,
})

/** Preview then apply every process in a project, as the import wizard would with everything approved. */
const importAll = (
  project: LoadedProject,
): { sourceTag: string; created: string[]; updated: string[]; removed: string[] } => {
  const { sourceTag, processes } = registry.previewImport(project)
  const result = registry.applyImportBatch(project, sourceTag, processes, [])
  return { sourceTag, ...result }
}

beforeEach(() => {
  const store = new StateStore(join(tmp, 'registry.json'), join(tmp, 'journal.jsonl'))
  store.saveRegistry({
    version: 1,
    services: {},
    routes: {},
    proxy: { port: 80, tls: false, tld: 'localhost' },
  })
  registry = new Registry(store, new EventBus())
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('service tags', () => {
  test('normalises tags on add: trim, lowercase, dedupe, drop blanks', () => {
    const entry = registry.addStandalone(def({ tags: [' Web ', 'web', 'DB', ''] }))
    expect(entry.tags).toEqual(['web', 'db'])
  })

  test('empty tag list stores no tags', () => {
    expect(registry.addStandalone(def({ tags: [] })).tags).toBeUndefined()
  })

  test('resolveIds matches a tag across services', () => {
    registry.addStandalone(def({ name: 'api', tags: ['web'] }))
    registry.addStandalone(def({ name: 'worker', tags: ['web', 'jobs'] }))
    registry.addStandalone(def({ name: 'cache', tags: ['infra'] }))
    expect(registry.resolveIds(['web']).sort()).toEqual(['api', 'worker'])
    expect(registry.resolveIds(['infra'])).toEqual(['cache'])
  })

  test('resolveIds reports unknown names mentioning tags', () => {
    expect(() => registry.resolveIds(['nope'])).toThrow(RegistryError)
    expect(() => registry.resolveIds(['nope'])).toThrow(/tag/)
  })

  test('update with undefined tags preserves, with [] clears', () => {
    registry.addStandalone(def({ tags: ['web'] }))
    expect(registry.updateService('api', def()).tags).toEqual(['web'])
    expect(registry.updateService('api', def({ tags: [] })).tags).toBeUndefined()
  })

  test('rejects malformed tags', () => {
    expect(() => registry.addStandalone(def({ tags: ['has space'] }))).toThrow(/invalid tag/)
  })

  test('import reads x-tags as a list or comma string', () => {
    const project: LoadedProject = {
      sources: [join(tmp, 'demo', 'process-compose.yaml')],
      warnings: [],
      config: {
        name: 'demo',
        processes: {
          api: { 'command': 'echo api', 'x-tags': ['web', 'edge'] },
          db: { 'command': 'echo db', 'x-tags': 'infra, data' },
        },
      },
    }
    importAll(project)
    expect(registry.get('api')?.tags).toEqual(['web', 'edge'])
    expect(registry.get('db')?.tags).toEqual(['infra', 'data'])
  })

  test('import reads x-portless as a route and pins alias ports as static', () => {
    const project: LoadedProject = {
      sources: [join(tmp, 'demo', 'process-compose.yaml')],
      warnings: [],
      config: {
        name: 'demo',
        processes: {
          api: {
            'command': 'kubectl port-forward svc/api 10015:8080',
            'x-portless': { route: 'atoka-api', alias: true, port: 10015 },
          },
        },
      },
    }
    importAll(project)
    const entry = registry.get('api')
    expect(entry?.route).toEqual({ route: 'atoka-api', alias: true, port: 10015 })
    expect(entry?.routeKind).toBe('static')
  })
})

describe('resolveIds union resolution', () => {
  const project = (name: string, procs: string[]): LoadedProject => ({
    sources: [join(tmp, name, 'process-compose.yaml')],
    warnings: [],
    config: {
      name,
      processes: Object.fromEntries(procs.map((p) => [p, { command: `echo ${p}` }])),
    },
  })

  test('an exact id wins outright over a same-named tag', () => {
    registry.addStandalone(def({ name: 'api', tags: ['api'] }))
    registry.addStandalone(def({ name: 'worker', tags: ['api'] }))
    expect(registry.resolveIds(['api'])).toEqual(['api'])
  })

  test('a name resolves to the union of source tag, namespace, and tag', () => {
    registry.addStandalone(def({ name: 'a', namespace: 'infra' }))
    registry.addStandalone(def({ name: 'b', tags: ['infra'] }))
    importAll(project('infra', ['svc']))
    expect(registry.resolveIds(['infra']).sort()).toEqual(['a', 'b', 'svc'])
  })

  test('a service matched through multiple categories appears once', () => {
    registry.addStandalone(def({ name: 'a', namespace: 'x', tags: ['x'] }))
    expect(registry.resolveIds(['x'])).toEqual(['a'])
  })

  test('no names resolves to every service', () => {
    registry.addStandalone(def({ name: 'a' }))
    registry.addStandalone(def({ name: 'b' }))
    expect(registry.resolveIds().sort()).toEqual(['a', 'b'])
    expect(registry.resolveIds([]).sort()).toEqual(['a', 'b'])
  })
})

describe('import approval batch', () => {
  const project = (name: string, processes: Record<string, ProcessConfig>): LoadedProject => ({
    sources: [join(tmp, name, 'process-compose.yaml')],
    warnings: [],
    config: { name, processes },
  })

  test('previewImport is non-mutating', () => {
    const p = project('demo', { api: { command: 'echo api' } })
    registry.previewImport(p)
    expect(registry.list()).toHaveLength(0)
  })

  test('rejected processes are neither created nor updated', () => {
    const p = project('demo', { api: { command: 'echo api' }, worker: { command: 'echo worker' } })
    const { sourceTag, processes } = registry.previewImport(p)
    const approved = processes.filter((proc) => proc.processName === 'api')
    registry.applyImportBatch(p, sourceTag, approved, [])
    expect(registry.get('api')).toBeDefined()
    expect(registry.get('worker')).toBeUndefined()
  })

  test('renaming a process during approval moves its id and keeps sibling depends_on resolvable', () => {
    const p = project('demo', {
      db: { command: 'echo db' },
      migrate: { command: 'echo migrate', depends_on: { db: { condition: 'process_healthy' } } },
    })
    const { sourceTag, processes } = registry.previewImport(p)
    const approved: ImportProcessPreview[] = processes.map((proc) =>
      proc.processName === 'db'
        ? { processName: 'db', definition: { ...proc.definition, name: 'db-renamed' } }
        : proc,
    )
    registry.applyImportBatch(p, sourceTag, approved, [])
    expect(registry.get('db')).toBeUndefined()
    expect(registry.get('db-renamed')).toBeDefined()
    expect(registry.get('migrate')?.config.depends_on).toEqual({
      'db-renamed': { condition: 'process_healthy' },
    })
  })

  test('re-import correlates by process-compose key, not by name, across a prior rename', () => {
    const p = project('demo', { db: { command: 'echo db' } })
    let preview = registry.previewImport(p)
    registry.applyImportBatch(
      p,
      preview.sourceTag,
      [
        {
          processName: 'db',
          definition: { ...preview.processes[0]!.definition, name: 'db-renamed' },
        },
      ],
      [],
    )
    registry.setDesired(['db-renamed'], 'up')

    preview = registry.previewImport(p)
    expect(preview.processes[0]?.definition.name).toBe('db-renamed')
    registry.applyImportBatch(p, preview.sourceTag, preview.processes, [])
    expect(registry.get('db-renamed')?.desired).toBe('up')
  })

  test('a process removed from the file is reported in toRemove but not deleted until approved', () => {
    const first = project('demo', {
      api: { command: 'echo api' },
      worker: { command: 'echo worker' },
    })
    importAll(first)

    const second = project('demo', { api: { command: 'echo api' } })
    const preview = registry.previewImport(second)
    expect(preview.toRemove).toEqual(['worker'])
    expect(registry.get('worker')).toBeDefined()

    registry.applyImportBatch(second, preview.sourceTag, preview.processes, preview.toRemove)
    expect(registry.get('worker')).toBeUndefined()
  })

  test('renaming an imported process to an existing name conflicts', () => {
    registry.addStandalone(def({ name: 'taken' }))
    const p = project('demo', { api: { command: 'echo api' } })
    const { sourceTag, processes } = registry.previewImport(p)
    const approved = processes.map((proc) => ({
      processName: proc.processName,
      definition: { ...proc.definition, name: 'taken' },
    }))
    expect(() => registry.applyImportBatch(p, sourceTag, approved, [])).toThrow(/already exists/)
  })
})

describe('renaming a standalone service', () => {
  test('updateService allows a rename and moves the entry to the new id', () => {
    registry.addStandalone(def({ name: 'api' }))
    const entry = registry.updateService('api', def({ name: 'api-v2' }))
    expect(entry.id).toBe('api-v2')
    expect(registry.get('api')).toBeUndefined()
    expect(registry.get('api-v2')).toBeDefined()
  })

  test('renaming to an existing name is a conflict', () => {
    registry.addStandalone(def({ name: 'api' }))
    registry.addStandalone(def({ name: 'worker' }))
    expect(() => registry.updateService('api', def({ name: 'worker' }))).toThrow(/already exists/)
  })
})
