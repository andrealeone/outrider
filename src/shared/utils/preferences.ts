import { existsSync, readFileSync } from 'node:fs'

import { atomicWrite } from '@/shared/utils/atomic-file'
import { preferencesPath } from '@/shared/utils/paths'

/** Persisted, user-facing feature switches — set via `outrider preferences`. */
export interface Preferences {
  /** Palette tuned for light terminal backgrounds. */
  theme: 'default' | 'light'
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'default',
}

/** CLI key, description shown by `outrider preferences`, and default. */
export const PREFERENCE_KEYS = [{ key: 'theme', description: 'dashboard palette (default/light)' }] as const

// Only the real, default path is memoized — tests pass a throwaway path to
// stay isolated from each other, and must always see a fresh read.
let cached: Preferences | undefined

const readFromDisk = (path: string): Preferences => {
  if (!existsSync(path)) return { ...DEFAULT_PREFERENCES }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<Preferences>
    return { ...DEFAULT_PREFERENCES, ...parsed }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

const load = (path: string): Preferences => {
  if (path !== preferencesPath) return readFromDisk(path)
  return (cached ??= readFromDisk(path))
}

const save = (prefs: Preferences, path: string): void => {
  atomicWrite(path, `${JSON.stringify(prefs, null, 2)}\n`)
  if (path === preferencesPath) cached = prefs
}

const parseTheme = (raw: string): Preferences['theme'] => {
  if (raw === 'default' || raw === 'light') return raw
  throw new Error(`"${raw}" is not a theme; use default/light`)
}

const unknownKey = (key: string): Error =>
  new Error(`Unknown preference "${key}". Available: ${PREFERENCE_KEYS.map((k) => k.key).join(', ')}`)

/** Read the current preferences, defaults included. */
export const readPreferences = (path = preferencesPath): Preferences => ({ ...load(path) })

export const resetPreferencesCache = (): void => {
  cached = undefined
}

export const getPreference = (key: string, path = preferencesPath): string => {
  const prefs = load(path)
  switch (key) {
    case 'theme':
      return prefs.theme
    default:
      throw unknownKey(key)
  }
}

export const setPreference = (key: string, rawValue: string, path = preferencesPath): void => {
  const prefs = load(path)
  switch (key) {
    case 'theme':
      save({ ...prefs, theme: parseTheme(rawValue) }, path)
      return
    default:
      throw unknownKey(key)
  }
}

/** Reset one preference, or all of them when `key` is omitted. */
export const resetPreference = (key: string | undefined, path = preferencesPath): void => {
  if (key === undefined) {
    save({ ...DEFAULT_PREFERENCES }, path)
    return
  }
  const prefs = load(path)
  switch (key) {
    case 'theme':
      save({ ...prefs, theme: DEFAULT_PREFERENCES.theme }, path)
      return
    default:
      throw unknownKey(key)
  }
}

export const describePreferences = (path = preferencesPath): string => {
  const prefs = load(path)
  return [`  theme          ${prefs.theme}`].join('\n')
}
