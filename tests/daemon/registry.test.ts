import { afterAll, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { LoadedProject } from '../shared/types/process-compose'
import type { ServiceDefinition } from '../shared/types/protocol'

import { EventBus } from './event-bus'
import { Registry, RegistryError } from './registry'
import { StateStore } from './state-store'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-registry-'))
let registry: Registry

const def = (over: Partial<ServiceDefinition> = {}): ServiceDefinition => ({
  name: 'api',
  command: 'bun run server.ts',
  ...over,
})

beforeEach(() => {
  const store = new StateStore(join(tmp, 'registry.json'), join(tmp, 'journal.jsonl'))
  store.saveRegistry({ version: 1, stacks: {}, services: {} })
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

  test('importProject reads x-tags as a list or comma string', () => {
    const project: LoadedProject = {
      sources: [join(tmp, 'stack', 'process-compose.yaml')],
      warnings: [],
      config: {
        name: 'demo',
        processes: {
          api: { 'command': 'echo api', 'x-tags': ['web', 'edge'] },
          db: { 'command': 'echo db', 'x-tags': 'infra, data' },
        },
      },
    }
    registry.importProject(project)
    expect(registry.get('demo/api')?.tags).toEqual(['web', 'edge'])
    expect(registry.get('demo/db')?.tags).toEqual(['infra', 'data'])
  })
})
