import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EventBus } from '@/daemon/event-bus'
import { Registry } from '@/daemon/registry'
import { createRouter } from '@/daemon/router'
import { StateStore } from '@/daemon/state-store'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-router-'))
const store = new StateStore(join(tmp, 'registry.json'), join(tmp, 'journal.jsonl'))
const registry = new Registry(store, new EventBus())
const router = createRouter(registry, () => {})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('NativeRouter', () => {
  test('hostnameFor appends the default tld', () => {
    expect(router.hostnameFor('api')).toBe('api.localhost')
  })

  test('urlFor builds a URL for a hostname', () => {
    const url = router.urlFor('myroute.localhost')
    expect(url).toContain('myroute.localhost')
    expect(url.startsWith('http://')).toBe(true)
  })

  test('register starts the proxy and returns a binding', async () => {
    const binding = await router.register('api.localhost', 8080, 'managed', 'api')
    expect(binding.hostname).toBe('api.localhost')
    expect(binding.port).toBe(8080)
    expect(binding.url).toContain('api.localhost')
  })

  test('ensureReady reports the proxy listening', async () => {
    const inspection = await router.ensureReady()
    expect(inspection.listening).toBe(true)
    expect(inspection.issues).toEqual([])
  })

  test('list reflects registered routes', () => {
    const routes = router.list()
    expect(routes.some((r) => r.hostname === 'api.localhost' && r.service === 'api')).toBe(true)
  })

  test('re-registering the same service is idempotent', async () => {
    const binding = await router.register('api.localhost', 9090, 'managed', 'api')
    expect(binding.port).toBe(9090)
  })

  test('registering a hostname claimed by a different service conflicts', async () => {
    let error: Error | undefined
    try {
      await router.register('api.localhost', 8081, 'managed', 'other')
    } catch (err) {
      error = err as Error
    }
    expect(error?.message).toMatch(/claimed/)
  })

  test('unregister removes the route', async () => {
    await router.unregister('api.localhost')
    expect(router.list().some((r) => r.hostname === 'api.localhost')).toBe(false)
  })
})
