import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

import { hostsFilePath } from '@/shared/utils/paths'

const BEGIN = '# BEGIN outrider'
const END = '# END outrider'

const blockLines = (hostnames: string[]): string[] =>
  [...new Set(hostnames)].sort().map((h) => `127.0.0.1 ${h}`)

const withBlock = (text: string, hostnames: string[]): string => {
  const block = [BEGIN, ...blockLines(hostnames), END].join('\n')
  const beginAt = text.indexOf(BEGIN)
  const endAt = text.indexOf(END)
  if (beginAt !== -1 && endAt !== -1) {
    return `${text.slice(0, beginAt)}${block}${text.slice(endAt + END.length)}`
  }
  const sep = text.endsWith('\n') || text === '' ? '' : '\n'
  return `${text}${sep}${block}\n`
}

/**
 * The /etc/hosts marked block: the Safari and custom-TLD fix (.localhost
 * resolves natively in Chromium/Firefox without it). Writing to /etc/hosts
 * needs root, so this runs only from a foreground command with a terminal
 * to prompt from — never from the daemon.
 */
export class HostsSync {
  /** Defaults to the real /etc/hosts; overridable so tests never touch it. */
  constructor(private readonly path: string = hostsFilePath) {}

  private current(): string {
    return existsSync(this.path) ? readFileSync(this.path, 'utf8') : ''
  }

  /** Read-only: is the marked block already in sync with the given hostnames? */
  isSynced(hostnames: string[]): boolean {
    const text = this.current()
    const beginAt = text.indexOf(BEGIN)
    const endAt = text.indexOf(END)
    if (beginAt === -1 || endAt === -1) return hostnames.length === 0
    const current = text.slice(beginAt, endAt + END.length)
    const expected = [BEGIN, ...blockLines(hostnames), END].join('\n')
    return current === expected
  }

  sync(hostnames: string[]): void {
    const next = withBlock(this.current(), hostnames)
    try {
      writeFileSync(this.path, next)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EACCES') throw err
      execFileSync('sudo', ['tee', this.path], { input: next, stdio: ['pipe', 'ignore', 'inherit'] })
    }
  }
}
