import { describe, expect, test } from 'bun:test'
import { applyFrameworkQuirks } from '@/daemon/router/quirks'

describe('applyFrameworkQuirks', () => {
  test('auto-detects vite and appends --port, --strictPort, and --host', () => {
    expect(applyFrameworkQuirks('vite dev', 'auto', 5173)).toBe(
      'vite dev --port 5173 --strictPort --host 127.0.0.1',
    )
  })

  test('adds the package-manager separator for script runs', () => {
    expect(applyFrameworkQuirks('npm run dev', 'vite', 4001)).toBe(
      'npm run dev -- --port 4001 --strictPort --host 127.0.0.1',
    )
    expect(applyFrameworkQuirks('bun run dev -- --open', 'vite', 4001)).toBe(
      'bun run dev -- --open --port 4001 --strictPort --host 127.0.0.1',
    )
  })

  test('leaves PORT-respecting commands and explicit "none" untouched', () => {
    expect(applyFrameworkQuirks('node server.js', 'auto', 4001)).toBe('node server.js')
    expect(applyFrameworkQuirks('vite dev', 'none', 4001)).toBe('vite dev')
  })

  test('does not override flags already present in the command', () => {
    expect(applyFrameworkQuirks('vite dev --port 3000 --host 0.0.0.0', 'auto', 5173)).toBe(
      'vite dev --port 3000 --host 0.0.0.0',
    )
  })

  test('expo gets --host localhost rather than an IP', () => {
    expect(applyFrameworkQuirks('expo start', 'auto', 8081)).toBe(
      'expo start --port 8081 --host localhost',
    )
  })
})
