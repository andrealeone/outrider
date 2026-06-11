import { existsSync } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'

// Upstream auto-discovery order, first match wins.
const DISCOVERY_ORDER = [
  'compose.yml',
  'compose.yaml',
  'process-compose.yml',
  'process-compose.yaml',
]

/** Find the compose file in `dir` following the upstream discovery order. */
export const discoverComposeFile = (dir: string): string | undefined => {
  for (const name of DISCOVERY_ORDER) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
  return undefined
}

/** "process-compose.yml" → "process-compose.override.yml" when it exists. */
export const discoverOverrideFile = (composePath: string): string | undefined => {
  const ext = extname(composePath)
  const stem = basename(composePath, ext)
  const candidate = join(dirname(composePath), `${stem}.override${ext}`)
  return existsSync(candidate) ? candidate : undefined
}
