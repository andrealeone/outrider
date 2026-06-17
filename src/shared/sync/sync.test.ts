import { describe, expect, test } from 'bun:test'

import type { RegistryModel, ServiceEntry } from '../types/registry'

import { diff } from './sync-diff'
import { exportRegistry, parseSyncFile } from './sync-file'

const entry = (over: Partial<ServiceEntry> & { id: string }): ServiceEntry => ({
  name: over.id,
  desired: 'down',
  autostart: false,
  config: { command: 'echo hi' },
  dir: '/home/u',
  ...over,
})

const model = (entries: ServiceEntry[]): RegistryModel => ({
  version: 1,
  stacks: {},
  services: Object.fromEntries(entries.map((e) => [e.id, e])),
})

describe('sync file codec', () => {
  test('exports standalone services and omits stack members', () => {
    const m = model([
      entry({ id: 'api', config: { command: 'bun run api.ts' }, tags: ['web'] }),
      entry({ id: 'demo/db', stack: 'demo', config: { command: 'postgres' } }),
    ])
    const doc = parseSyncFile(exportRegistry(m))
    expect(Object.keys(doc.services)).toEqual(['api'])
    expect(doc.services.api?.command).toBe('bun run api.ts')
    expect(doc.services.api?.tags).toEqual(['web'])
  })

  test('export → parse → diff is empty (idempotent round-trip)', () => {
    const m = model([
      entry({
        id: 'api',
        autostart: true,
        tags: ['web', 'edge'],
        namespace: 'backend',
        route: { route: 'api' },
        config: {
          command: 'bun run api.ts',
          working_dir: 'src',
          availability: { restart: 'on_failure' },
          environment: ['FOO=bar', 'BAZ=qux'],
        },
      }),
      entry({ id: 'worker', config: { command: 'bun run worker.ts' } }),
    ])
    expect(diff(m, parseSyncFile(exportRegistry(m)))).toEqual([])
  })

  test('parses an alias-port route', () => {
    const m = model([
      entry({ id: 'pf', config: { command: 'kubectl ...' }, route: { route: 'pf', alias: true, port: 10020 } }),
    ])
    const doc = parseSyncFile(exportRegistry(m))
    expect(doc.services.pf?.route).toBe('pf')
    expect(doc.services.pf?.alias_port).toBe(10020)
  })

  test('rejects a service without a command', () => {
    expect(() => parseSyncFile('services:\n  api:\n    autostart: true\n')).toThrow(/needs a command/)
  })

  test('tolerates an empty document', () => {
    expect(parseSyncFile('').services).toEqual({})
    expect(parseSyncFile('services:\n').services).toEqual({})
  })
})

describe('sync diff', () => {
  const current = model([
    entry({ id: 'api', config: { command: 'bun run api.ts' } }),
    entry({ id: 'old', config: { command: 'echo old' } }),
  ])

  test('detects create, update, and delete', () => {
    const desired = parseSyncFile(
      ['services:', '  api:', '    command: bun run api.ts', '    autostart: true', '  new:', '    command: echo new'].join('\n'),
    )
    const ops = diff(current, desired)
    expect(ops.map((o) => `${o.kind} ${o.name}`)).toEqual(['update api', 'create new', 'delete old'])
    const update = ops.find((o) => o.kind === 'update')
    expect(update?.kind === 'update' && update.changes).toEqual(['autostart'])
  })

  test('ignores tag case and order (no spurious update)', () => {
    const m = model([entry({ id: 'api', config: { command: 'echo hi' }, tags: ['web', 'db'] })])
    const desired = parseSyncFile('services:\n  api:\n    command: echo hi\n    tags: [DB, Web]\n')
    expect(diff(m, desired)).toEqual([])
  })

  test('never touches stack members', () => {
    const m = model([entry({ id: 'demo/api', stack: 'demo', config: { command: 'echo hi' } })])
    expect(diff(m, parseSyncFile('services: {}\n'))).toEqual([])
  })
})
