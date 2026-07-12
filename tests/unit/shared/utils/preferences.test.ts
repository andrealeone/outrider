import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_PREFERENCES,
  getPreference,
  readPreferences,
  resetPreference,
  setPreference,
} from '@/shared/utils/preferences'

const dir = mkdtempSync(join(tmpdir(), 'outrider-preferences-'))
const path = join(dir, 'preferences.json')

afterEach(() => {
  resetPreference(undefined, path)
})

describe('preferences', () => {
  test('defaults to the default theme', () => {
    expect(readPreferences(path)).toEqual(DEFAULT_PREFERENCES)
  })

  test('set/get round-trip the theme preference', () => {
    setPreference('theme', 'light', path)
    expect(getPreference('theme', path)).toBe('light')
  })

  test('rejects an unknown key', () => {
    expect(() => {
      setPreference('nope', 'on', path)
    }).toThrow(/Unknown preference/)
    expect(() => getPreference('nope', path)).toThrow(/Unknown preference/)
  })

  test('rejects a malformed value', () => {
    expect(() => {
      setPreference('theme', 'purple', path)
    }).toThrow(/not a theme/)
  })

  test('reset restores a single key to its default', () => {
    setPreference('theme', 'light', path)
    resetPreference('theme', path)
    expect(readPreferences(path).theme).toBe('default')
  })

  test('reset with no key restores every preference', () => {
    setPreference('theme', 'light', path)
    resetPreference(undefined, path)
    expect(readPreferences(path)).toEqual(DEFAULT_PREFERENCES)
  })

  test('persists across reads by writing to disk', () => {
    setPreference('theme', 'light', path)
    expect(readPreferences(path).theme).toBe('light')
  })
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})
