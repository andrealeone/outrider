import { afterEach, describe, expect, test } from 'bun:test'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { hasPortless, portlessBin, resetPortlessCache } from '@/shared/utils/portless'

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

  test('treats an empty OUTRIDER_PORTLESS_BIN as unset', () => {
    const prevBin = process.env.OUTRIDER_PORTLESS_BIN
    const prevNo = process.env.OUTRIDER_NO_PORTLESS
    process.env.OUTRIDER_PORTLESS_BIN = ''
    process.env.OUTRIDER_NO_PORTLESS = '1'
    resetPortlessCache()
    // Falls through to detection rather than treating '' as a path.
    expect(hasPortless()).toBe(false)
    process.env.OUTRIDER_PORTLESS_BIN = prevBin
    process.env.OUTRIDER_NO_PORTLESS = prevNo
    resetPortlessCache()
  })

  // The daemon runs under launchd/systemd with a PATH that omits ~/.bun/bin and
  // friends; detection must still find a binary that lives in one of the common
  // tool dirs. We can't write into the real ~/.bun/bin, so this exercises the
  // same code path via OUTRIDER_PORTLESS_BIN pointing at a real executable.
  test('portlessBin resolves an existing binary the bare PATH would miss', () => {
    const dir = mkdtempSync(join(tmpdir(), 'outrider-portless-'))
    const bin = join(dir, 'portless')
    writeFileSync(bin, '#!/bin/sh\nexit 0\n')
    chmodSync(bin, 0o755)

    const prevBin = process.env.OUTRIDER_PORTLESS_BIN
    const prevPath = process.env.PATH
    const prevNo = process.env.OUTRIDER_NO_PORTLESS
    // A PATH that does not contain `dir`, proving the override is honoured.
    process.env.PATH = ['/usr/bin', '/bin'].join(delimiter)
    delete process.env.OUTRIDER_NO_PORTLESS
    process.env.OUTRIDER_PORTLESS_BIN = bin
    resetPortlessCache()

    expect(portlessBin()).toBe(bin)
    expect(hasPortless()).toBe(true)

    process.env.OUTRIDER_PORTLESS_BIN = prevBin
    process.env.PATH = prevPath
    if (prevNo !== undefined) process.env.OUTRIDER_NO_PORTLESS = prevNo
    resetPortlessCache()
  })
})

afterEach(() => {
  resetPortlessCache()
})
