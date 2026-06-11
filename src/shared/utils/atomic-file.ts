import { closeSync, fsyncSync, mkdirSync, openSync, renameSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Write via temp file + fsync + rename so readers never observe a torn file. */
export const atomicWrite = (path: string, content: string): void => {
  const dir = dirname(path)
  mkdirSync(dir, { recursive: true })
  const tmp = join(dir, `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
  const fd = openSync(tmp, 'w', 0o600)
  try {
    writeSync(fd, content)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(tmp, path)
}
