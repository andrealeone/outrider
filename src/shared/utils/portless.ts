import { existsSync } from 'node:fs'

let cached: boolean | undefined

export function hasPortless(): boolean {
  if (cached !== undefined) return cached
  if (process.env.OUTRIDER_NO_PORTLESS === '1') return (cached = false)

  const cli = process.env.OUTRIDER_PORTLESS_BIN ?? Bun.which('portless')
  cached = cli !== null && cli !== undefined && existsSync(cli)
  return cached
}

export function resetPortlessCache(): void {
  cached = undefined
}
