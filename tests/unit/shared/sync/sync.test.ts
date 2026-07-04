import { describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { RegistryModel, ServiceEntry } from '@/shared/types/registry'

import { diff } from '@/shared/sync/sync-diff'
import { exportRegistry, parseSyncFile, toDefinition, writeSyncFile } from '@/shared/sync/sync-file'

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

  test('round-trips working_dir, namespace, restart, and env', () => {
    const m = model([
      entry({
        id: 'api',
        namespace: 'backend',
        config: {
          command: 'bun run api.ts',
          working_dir: '/home/u/api',
          availability: { restart: 'always' },
          environment: ['LOG=debug'],
        },
      }),
    ])
    const svc = parseSyncFile(exportRegistry(m)).services.api
    expect(svc).toEqual({
      command: 'bun run api.ts',
      working_dir: '/home/u/api',
      namespace: 'backend',
      restart: 'always',
      env: { LOG: 'debug' },
    })
  })

  test('omits fields left at their defaults', () => {
    const m = model([entry({ id: 'api', autostart: false, config: { command: 'echo hi', availability: { restart: 'no' } } })])
    expect(parseSyncFile(exportRegistry(m)).services.api).toEqual({ command: 'echo hi' })
  })

  test('treats a comma-separated tag string as a tag list (normalised on diff)', () => {
    const m = model([entry({ id: 'api', config: { command: 'echo hi' }, tags: ['web', 'edge'] })])
    const desired = parseSyncFile('services:\n  api:\n    command: echo hi\n    tags: "web, edge"\n')
    expect(diff(m, desired)).toEqual([])
  })

  test('coerces env values to strings', () => {
    const doc = parseSyncFile('services:\n  api:\n    command: echo hi\n    env:\n      PORT: 8080\n')
    expect(doc.services.api?.env).toEqual({ PORT: '8080' })
  })

  test('rejects malformed fields with named errors', () => {
    const bad = (body: string): (() => unknown) => () => parseSyncFile(`services:\n  api:\n    command: echo hi\n${body}`)
    expect(bad('    autostart: maybe\n')).toThrow(/autostart must be true or false/)
    expect(bad('    restart: sometimes\n')).toThrow(/restart must be one of/)
    expect(bad('    env:\n      - nope\n')).toThrow(/env must be a mapping/)
    expect(bad('    route:\n      nested: true\n')).toThrow(/route must be a string/)
  })

  test('rejects a non-mapping top level and services node', () => {
    expect(() => parseSyncFile('- a\n- b\n')).toThrow(/top level must be a mapping/)
    expect(() => parseSyncFile('services:\n  - api\n')).toThrow(/"services" must be a mapping/)
  })
})

describe('toDefinition', () => {
  test('maps file fields to a service definition', () => {
    const def = toDefinition('api', {
      command: '  bun run api.ts  ',
      working_dir: '/home/u',
      autostart: true,
      restart: 'on_failure',
      tags: ['Web', 'web'],
      route: 'api',
      alias_port: 10020,
      namespace: 'backend',
      env: { B: '2', A: '1' },
    })
    expect(def).toEqual({
      name: 'api',
      command: 'bun run api.ts',
      workingDir: '/home/u',
      env: { A: '1', B: '2' },
      route: 'api',
      aliasPort: 10020,
      restart: 'on_failure',
      autostart: true,
      namespace: 'backend',
      tags: ['web'],
    })
  })

  test('defaults autostart to false and tags to empty', () => {
    const def = toDefinition('api', { command: 'echo hi' })
    expect(def.autostart).toBe(false)
    expect(def.tags).toEqual([])
  })
})

describe('writeSyncFile', () => {
  test('writes a headed, parseable file to disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outrider-sync-'))
    try {
      const path = join(dir, 'outrider.yml')
      const m = model([
        entry({ id: 'api', config: { command: 'bun run api.ts' }, tags: ['web'] }),
        entry({ id: 'demo/db', stack: 'demo', config: { command: 'postgres' } }),
      ])
      writeSyncFile(m, path)
      const text = readFileSync(path, 'utf8')
      expect(text.startsWith('# outrider services')).toBe(true)
      const doc = parseSyncFile(text)
      expect(Object.keys(doc.services)).toEqual(['api'])
      expect(diff(m, doc)).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
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

  test('reports every changed field in a stable order on an update', () => {
    const m = model([entry({ id: 'api', namespace: 'old', config: { command: 'echo hi', working_dir: '/a', environment: ['X=1'] } })])
    const desired = parseSyncFile(
      ['services:', '  api:', '    command: echo bye', '    working_dir: /b', '    namespace: new', '    env:', '      X: "2"'].join('\n'),
    )
    const ops = diff(m, desired)
    expect(ops.length).toBe(1)
    const op = ops[0]
    expect(op?.kind === 'update' && op.changes).toEqual(['command', 'working_dir', 'namespace', 'env'])
  })

  test('create carries the full definition', () => {
    const desired = parseSyncFile('services:\n  api:\n    command: echo hi\n    route: api\n')
    const ops = diff(model([]), desired)
    expect(ops).toHaveLength(1)
    expect(ops[0]?.kind === 'create' && ops[0].def.route).toBe('api')
  })
})
