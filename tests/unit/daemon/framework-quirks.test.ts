import { describe, expect, test } from 'bun:test'
import { applyFrameworkQuirks } from '@/daemon/framework-quirks'

describe('applyFrameworkQuirks', () => {
  test('auto-detects vite and appends --port', () => {
    expect(applyFrameworkQuirks('vite dev', 'auto', 5173)).toBe('vite dev --port 5173')
  })

  test('adds the package-manager separator for script runs', () => {
    expect(applyFrameworkQuirks('npm run dev', 'vite', 4001)).toBe('npm run dev -- --port 4001')
    expect(applyFrameworkQuirks('bun run dev -- --open', 'vite', 4001)).toBe(
      'bun run dev -- --open --port 4001',
    )
  })

  test('leaves PORT-respecting commands and explicit "none" untouched', () => {
    expect(applyFrameworkQuirks('node server.js', 'auto', 4001)).toBe('node server.js')
    expect(applyFrameworkQuirks('vite dev', 'none', 4001)).toBe('vite dev')
  })
})
