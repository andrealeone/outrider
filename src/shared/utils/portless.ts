import { existsSync } from 'node:fs'

import { withCommonPath } from './path-env'

let cached: string | null | undefined

/**
 * Resolve the portless CLI. The daemon usually runs under launchd/systemd with
 * a minimal PATH that omits ~/.bun/bin, ~/.local/bin and the like, so a bare
 * `Bun.which('portless')` misses a perfectly installed binary. Look it up
 * through the same augmented PATH spawned services get, so detection matches
 * what a service would actually find.
 */
export function portlessBin(): string | null {
  if (cached !== undefined) return cached
  if (process.env.OUTRIDER_NO_PORTLESS === '1') return (cached = null)

  const override = process.env.OUTRIDER_PORTLESS_BIN
  if (override !== undefined && override !== '') {
    return (cached = existsSync(override) ? override : null)
  }

  cached = Bun.which('portless', { PATH: withCommonPath(process.env.PATH) }) ?? null
  return cached
}

export function hasPortless(): boolean {
  return portlessBin() !== null
}

export function resetPortlessCache(): void {
  cached = undefined
}
