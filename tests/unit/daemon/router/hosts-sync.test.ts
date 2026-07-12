import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HostsSync } from '@/daemon/router/hosts-sync'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-hosts-'))
const hostsPath = join(tmp, 'hosts')

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('HostsSync', () => {
  test('an empty hostname list is considered synced on a missing file', () => {
    const sync = new HostsSync(join(tmp, 'never-created'))
    expect(sync.isSynced([])).toBe(true)
    expect(sync.isSynced(['api.test'])).toBe(false)
  })

  test('sync writes a marked block and isSynced reports it', () => {
    writeFileSync(hostsPath, '127.0.0.1 localhost\n')
    const sync = new HostsSync(hostsPath)
    expect(sync.isSynced(['api.test'])).toBe(false)

    sync.sync(['api.test', 'web.test'])
    expect(sync.isSynced(['api.test', 'web.test'])).toBe(true)

    const text = readFileSync(hostsPath, 'utf8')
    expect(text).toContain('127.0.0.1 localhost')
    expect(text).toContain('# BEGIN outrider')
    expect(text).toContain('127.0.0.1 api.test')
    expect(text).toContain('127.0.0.1 web.test')
    expect(text).toContain('# END outrider')
  })

  test('re-sync replaces the block in place without disturbing surrounding lines', () => {
    const sync = new HostsSync(hostsPath)
    sync.sync(['only.test'])
    const text = readFileSync(hostsPath, 'utf8')
    expect(text).toContain('127.0.0.1 localhost')
    expect(text).toContain('127.0.0.1 only.test')
    expect(text).not.toContain('api.test')
    expect(sync.isSynced(['only.test'])).toBe(true)
  })

  test('detects drift when the block no longer matches', () => {
    writeFileSync(hostsPath, ['127.0.0.1 localhost', '# BEGIN outrider', '127.0.0.1 stale.test', '# END outrider', ''].join('\n'))
    const sync = new HostsSync(hostsPath)
    expect(sync.isSynced(['fresh.test'])).toBe(false)
    expect(sync.isSynced(['stale.test'])).toBe(true)
  })
})
