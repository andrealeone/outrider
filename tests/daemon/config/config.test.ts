import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import type { ProjectConfig } from '../../shared/types/process-compose'

import { startOrder } from './dag'
import { expandEnv } from './expand'
import { ConfigLoadError, hashProject, loadProject, stackNameFor } from './load'
import { deepMerge } from './merge'
import { renderTemplate, TemplateError } from './template'
import { validateProject } from './validate'

const fixture = (name: string): string => join(import.meta.dir, 'fixtures', name)

describe('deepMerge', () => {
  test('maps merge, scalars and arrays replace, null deletes', () => {
    const merged = deepMerge(
      { a: { x: 1, y: 2 }, list: [1, 2], keep: 'yes', gone: 'soon' },
      { a: { y: 3 }, list: [9], gone: null },
    )
    expect(merged).toEqual({ a: { x: 1, y: 3 }, list: [9], keep: 'yes' })
  })
})

describe('expandEnv', () => {
  const env = { NAME: 'world', EMPTY: '' }

  test('expands ${VAR} and $VAR, escapes $$', () => {
    expect(expandEnv('hi ${NAME} $NAME $$NAME', env).value).toBe('hi world world $NAME')
  })

  test('unset variables expand to empty', () => {
    expect(expandEnv('[${MISSING}]', env).value).toBe('[]')
  })

  test('function forms warn and pass through unchanged', () => {
    const result = expandEnv('${NAME:-fallback}', env)
    expect(result.value).toBe('${NAME:-fallback}')
    expect(result.warnings[0]?.code).toBe('deferred-envsubst-form')
  })
})

describe('renderTemplate', () => {
  test('renders dotted lookups', () => {
    expect(renderTemplate('v={{.V}} p={{ .app.port }}', { V: 1, app: { port: 80 } }, 'ctx')).toBe(
      'v=1 p=80',
    )
  })

  test('hard-errors on unsupported constructs and missing vars', () => {
    expect(() => renderTemplate('{{if .X}}y{{end}}', {}, 'ctx')).toThrow(TemplateError)
    expect(() => renderTemplate('{{.MISSING}}', {}, 'ctx')).toThrow('not defined in vars')
  })
})

describe('startOrder', () => {
  test('groups processes into dependency levels', () => {
    const levels = startOrder({
      db: {},
      api: { depends_on: { db: {} } },
      worker: { depends_on: { api: {} } },
      cache: {},
    })
    expect(levels).toEqual([['db', 'cache'], ['api'], ['worker']])
  })

  test('reports cycles with the full path', () => {
    expect(() =>
      startOrder({ a: { depends_on: { b: {} } }, b: { depends_on: { a: {} } } }),
    ).toThrow(/cycle.*a -> b -> a|cycle.*b -> a -> b/)
  })
})

describe('validateProject', () => {
  const base = (proc: object): ProjectConfig =>
    ({ processes: { p: proc } }) as unknown as ProjectConfig

  test('requires a command, valid conditions, and known dependency targets', () => {
    const result = validateProject({
      processes: { p: { depends_on: { ghost: { condition: 'bogus' } } } },
    } as unknown as ProjectConfig)
    expect(result.errors).toHaveLength(3)
  })

  test('rejects ready_log_line combined with a readiness probe', () => {
    const result = validateProject(
      base({
        command: 'x',
        ready_log_line: 'up',
        readiness_probe: { exec: { command: 'y' } },
      }),
    )
    expect(result.errors[0]).toContain('mutually exclusive')
  })

  test('strict mode turns unknown keys into errors', () => {
    const lax = validateProject(base({ command: 'x', bogus_key: 1 }))
    expect(lax.errors).toHaveLength(0)
    expect(lax.warnings.some((w) => w.code === 'unknown-key')).toBe(true)

    const strict = validateProject({
      is_strict: true,
      processes: { p: { command: 'x', bogus_key: 1 } },
    } as unknown as ProjectConfig)
    expect(strict.errors[0]).toContain('bogus_key')
  })

  test('cut and deferred features warn by name instead of failing', () => {
    const result = validateProject(
      base({ command: 'x', is_elevated: true, is_tty: true, env_cmds: { A: 'date' } }),
    )
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.map((w) => w.code).sort()).toEqual([
      'cut-feature',
      'deferred-feature',
      'deferred-feature',
    ])
  })

  test('route names must be unique, valid labels, and not portless-reserved', () => {
    const result = validateProject({
      processes: {
        a: { 'command': 'x', 'x-portless': { route: 'proxy' } },
        b: { 'command': 'x', 'x-portless': { route: 'Bad_Label' } },
        c: { 'command': 'x', 'x-portless': { route: 'app' } },
        d: { 'command': 'x', 'x-portless': { route: 'app' } },
      },
    } as unknown as ProjectConfig)
    expect(result.errors).toHaveLength(3)
  })
})

describe('loadProject (golden fixtures)', () => {
  test('merges override, applies vars, expands env, keeps extension keys', () => {
    const project = loadProject(fixture('web'))
    const { processes } = project.config

    expect(project.sources).toHaveLength(2)
    expect(processes.api?.command).toBe('serve-api --version 1.4.0')
    expect(processes.api?.environment).toEqual(['API_MODE=dev'])
    expect(processes.api?.replicas).toBe(1)
    expect(processes.worker?.disabled).toBe(true)
    expect(processes.db?.command).toBe('run-db --data /tmp/outrider-fixture-data')
    expect(processes.api?.['x-portless']?.route).toBe('api')
    expect(stackNameFor(project)).toBe('webstack')
    expect(hashProject(project)).toHaveLength(16)
  })

  test('discovery accepts a directory and fails cycles at import time', () => {
    expect(() => loadProject(fixture('cycle'))).toThrow(/cycle/)
    expect(() => loadProject(fixture('missing-dir'))).toThrow(ConfigLoadError)
  })
})
