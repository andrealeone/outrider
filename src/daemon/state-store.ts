import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import { appendFileSync } from 'node:fs'

import type { JournalRecord, RegistryModel } from '@/shared/types/registry'

import { atomicWrite } from '@/shared/utils/atomic-file'
import { journalPath, registryPath } from '@/shared/utils/paths'
import { nowIso } from '@/shared/utils/time'

const JOURNAL_MAX_BYTES = 5 * 1024 * 1024
const JOURNAL_BACKUPS = 2

// TLS defaults to off: Bun 1.3.14's node:http2 shim rejects TLS connections
// whose ALPN offer omits h2, which is exactly what browsers send for a
// WebSocket handshake — enabling TLS by default would silently break
// WebSockets/HMR. Revisit once the upstream Bun bug is fixed; the CA, leaf
// minting, and hot-swap machinery all work today and are covered by tests,
// they are simply not switched on by default yet.
const emptyModel = (): RegistryModel => ({
  version: 1,
  stacks: {},
  services: {},
  routes: {},
  proxy: { port: 80, tls: false, tld: 'localhost' },
})

/**
 * The daemon-owned persistence layer: registry.json written atomically on
 * every change, journal.jsonl appended and rotated. Being the single writer
 * is what makes a database unnecessary.
 */
export class StateStore {
  constructor(
    private readonly registryFile = registryPath,
    private readonly journalFile = journalPath,
  ) {
    mkdirSync(dirname(registryFile), { recursive: true })
    mkdirSync(dirname(journalFile), { recursive: true })
  }

  loadRegistry(): RegistryModel {
    if (!existsSync(this.registryFile)) return emptyModel()
    try {
      const model = JSON.parse(readFileSync(this.registryFile, 'utf8')) as RegistryModel
      if (model.version !== 1) return emptyModel()
      // Older registry.json files predate the route table and proxy settings.
      model.routes ??= {}
      model.proxy ??= emptyModel().proxy
      return model
    } catch {
      // A corrupt registry must not brick the daemon; start empty and let
      // the journal tell the story.
      this.appendJournal({ ts: nowIso(), type: 'daemon', data: { event: 'registry-corrupt' } })
      return emptyModel()
    }
  }

  saveRegistry(model: RegistryModel): void {
    atomicWrite(this.registryFile, `${JSON.stringify(model, null, 2)}\n`)
  }

  appendJournal(record: JournalRecord): void {
    try {
      this.rotateJournalIfNeeded()
      appendFileSync(this.journalFile, `${JSON.stringify(record)}\n`)
    } catch {
      // Journalling is best-effort; it must never take the daemon down.
    }
  }

  /**
   * Rebuild cumulative restart counters by scanning the journal (backups
   * oldest-first, then the live file). Restart counters surviving daemon
   * restarts is part of the persistence contract.
   */
  loadRestartCounters(): Map<string, number> {
    const counters = new Map<string, number>()
    const files: string[] = []
    for (let i = JOURNAL_BACKUPS; i >= 1; i--) files.push(`${this.journalFile}.${i}`)
    files.push(this.journalFile)
    for (const file of files) {
      if (!existsSync(file)) continue
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line === '') continue
        try {
          const record = JSON.parse(line) as JournalRecord
          if (record.type === 'restart' && record.service !== undefined) {
            counters.set(record.service, (counters.get(record.service) ?? 0) + 1)
          }
        } catch {
          // Skip torn lines from a crash mid-append.
        }
      }
    }
    return counters
  }

  private rotateJournalIfNeeded(): void {
    if (!existsSync(this.journalFile) || statSync(this.journalFile).size < JOURNAL_MAX_BYTES) return
    const oldest = `${this.journalFile}.${JOURNAL_BACKUPS}`
    if (existsSync(oldest)) unlinkSync(oldest)
    for (let i = JOURNAL_BACKUPS - 1; i >= 1; i--) {
      if (existsSync(`${this.journalFile}.${i}`)) {
        renameSync(`${this.journalFile}.${i}`, `${this.journalFile}.${i + 1}`)
      }
    }
    renameSync(this.journalFile, `${this.journalFile}.1`)
  }
}
