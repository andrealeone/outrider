import { existsSync, readFileSync } from 'node:fs'

import { render } from 'ink'
import React from 'react'

import { diff, type SyncOp } from '@/shared/sync/sync-diff'
import { parseSyncFile, type SyncDoc, writeSyncFile } from '@/shared/sync/sync-file'
import { Client } from '@/shared/client'
import { fail, reply } from '@/cli/output'
import { configYmlPath } from '@/shared/utils/paths'

import { type ApplyResult, SyncView } from './components/sync-view'

const applyOp = (client: Client, op: SyncOp): Promise<unknown> => {
  if (op.kind === 'create') return client.addService(op.def)
  if (op.kind === 'update') return client.updateService(op.name, op.def)
  return client.removeService(op.name)
}

const applyAll =
  (client: Client) =>
  async (ops: SyncOp[]): Promise<ApplyResult[]> => {
    const results: ApplyResult[] = []
    for (const op of ops) {
      try {
        await applyOp(client, op)
        results.push({ op, ok: true })
      } catch (err) {
        results.push({ op, ok: false, error: err instanceof Error ? err.message : String(err) })
      }
    }
    return results
  }

/**
 * Reconcile ~/.config/outrider.yml into the registry. Seeds the file on first
 * run, computes the diff against the live registry, and applies it — through
 * an Ink checklist on a TTY, or directly with `--yes`.
 */
export const runSync = async (opts: { yes?: boolean } = {}): Promise<void> => {
  const client = new Client()
  if (!(await client.ping().catch(() => false))) {
    fail('Outrider daemon is not running; start it with `outrider on`')
    return
  }

  const model = await client.registry()
  if (!existsSync(configYmlPath)) {
    writeSyncFile(model)

    reply(
      `Wrote ${configYmlPath} from the current registry. Edit it and run \`outrider sync\` again.`,
    )

    return
  }

  let desired: SyncDoc
  try {
    desired = parseSyncFile(readFileSync(configYmlPath, 'utf8'))
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
    return
  }

  const ops = diff(model, desired)
  if (ops.length === 0) {
    reply(`Registry already in sync with ${configYmlPath}`)
    return
  }

  const apply = applyAll(client)
  if (!process.stdout.isTTY && !opts.yes) {
    fail(
      'Refusing to apply sync operations without a TTY. Re-run with `--yes` to apply non-interactively.',
    )
    return
  }
  if (opts.yes) {
    const results = await apply(ops)
    const succeeded = results.filter((r) => r.ok).length
    const failed = results.filter((r) => !r.ok).length
    const summary = results
      .map((r) => `${r.ok ? '✓' : '✗'} ${r.op.kind} ${r.op.name}${r.error ? ` — ${r.error}` : ''}`)
      .join('\n')

    const message = `Applied ${results.length} operation${results.length !== 1 ? 's' : ''} (${succeeded} succeeded${failed > 0 ? `, ${failed} failed` : ''}).\n${summary}`
    if (failed > 0) fail(message)
    else reply(message)
    return
  }

  const app = render(<SyncView ops={ops} onApply={apply} />, { exitOnCtrlC: true })
  await app.waitUntilExit()
}
