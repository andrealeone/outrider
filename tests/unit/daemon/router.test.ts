import { describe, expect, test } from 'bun:test'

import type { Router } from '@/shared/types/router'

import { resetPortlessCache } from '@/shared/utils/portless'
import { createRouter } from '@/daemon/router'

const noop = () => {}

describe('createRouter factory', () => {
  test('returns NoopRouter when portless is absent', () => {
    const prev = process.env.OUTRIDER_PORTLESS_BIN
    process.env.OUTRIDER_PORTLESS_BIN = '/nonexistent'
    resetPortlessCache()
    const router = createRouter(noop)
    expect(router.constructor.name).toBe('NoopRouter')
    process.env.OUTRIDER_PORTLESS_BIN = prev
    resetPortlessCache()
  })
})

describe('NoopRouter', () => {
  // Use a guaranteed absent portless by setting OUTRIDER_PORTLESS_BIN to a non-existent path
  // beforeEach would be nice but bun:test doesn't support it in the same way, so we create
  // the router in each test with the override set
  const withAbsentPortless = (fn: (router: Router) => void | Promise<void>): (() => void | Promise<void>) => {
    return async () => {
      const prev = process.env.OUTRIDER_PORTLESS_BIN
      process.env.OUTRIDER_PORTLESS_BIN = '/nonexistent/portless'
      resetPortlessCache()
      const r = createRouter(noop)
      try {
        await fn(r)
      } finally {
        process.env.OUTRIDER_PORTLESS_BIN = prev
        resetPortlessCache()
      }
    }
  }

  test(
    'ensureProxy returns false',
    withAbsentPortless(async (r) => {
      const result = await r.ensureProxy()
      expect(result).toBe(false)
    }),
  )

  test(
    'register returns a binding with computed hostname',
    withAbsentPortless(async (r) => {
      const binding = await r.register('testapi', 8080)
      expect(binding.route).toBe('testapi')
      expect(binding.port).toBe(8080)
      expect(binding.hostname).toBe('testapi.localhost')
      expect(binding.url).toContain('testapi.localhost')
      expect(binding.url.startsWith('http://')).toBe(true)
    }),
  )

  test(
    'unregister resolves without error',
    withAbsentPortless(async (r) => {
      await r.unregister('testapi')
      // Should not throw
      expect(true).toBe(true)
    }),
  )

  test(
    'urlFor returns computed URL for a route',
    withAbsentPortless((r) => {
      const url = r.urlFor('myroute')
      expect(url).toContain('myroute.localhost')
      expect(url.startsWith('http://')).toBe(true)
    }),
  )

  test(
    'status returns unavailable',
    withAbsentPortless(async (r) => {
      const status = await r.status()
      expect(status.available).toBe(false)
      expect(status.proxyRunning).toBe(false)
      expect(status.routes).toEqual([])
    }),
  )
})
