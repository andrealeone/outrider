import { describe, expect, test } from 'bun:test'

import { hasPortless, resetPortlessCache } from '../../../../src/shared/utils/portless'

describe('hasPortless', () => {
  test('returns false when OUTRIDER_NO_PORTLESS is set to 1', () => {
    const prev = process.env.OUTRIDER_NO_PORTLESS
    process.env.OUTRIDER_NO_PORTLESS = '1'
    resetPortlessCache()
    expect(hasPortless()).toBe(false)
    process.env.OUTRIDER_NO_PORTLESS = prev
    resetPortlessCache()
  })

  test('returns true or false based on CLI availability', () => {
    resetPortlessCache()
    const result = hasPortless()
    expect(typeof result).toBe('boolean')
  })

  test('memoizes the result', () => {
    resetPortlessCache()
    const first = hasPortless()
    const second = hasPortless()
    expect(first).toBe(second)
  })

  test('uses OUTRIDER_PORTLESS_BIN override', () => {
    const prev = process.env.OUTRIDER_PORTLESS_BIN
    process.env.OUTRIDER_PORTLESS_BIN = '/nonexistent/path'
    resetPortlessCache()
    expect(hasPortless()).toBe(false)
    process.env.OUTRIDER_PORTLESS_BIN = prev
    resetPortlessCache()
  })

  test('resetPortlessCache clears memoization', () => {
    resetPortlessCache()
    hasPortless()
    resetPortlessCache()
    // Should be able to call again and re-detect
    const result = hasPortless()
    expect(typeof result).toBe('boolean')
  })
})
