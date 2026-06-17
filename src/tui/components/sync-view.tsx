import { Box, Text, useApp, useInput } from 'ink'
import React, { useState } from 'react'

import type { SyncOp } from '../../shared/sync/sync-diff'

import { theme } from '../theme'

export interface ApplyResult {
  op: SyncOp
  ok: boolean
  error?: string
}

interface Props {
  ops: SyncOp[]
  onApply: (ops: SyncOp[]) => Promise<ApplyResult[]>
}

type Phase = 'review' | 'applying' | 'done'

const KIND_LABEL: Record<SyncOp['kind'], string> = {
  create: '+ create',
  update: '~ update',
  delete: '- delete',
}

const kindColor = (kind: SyncOp['kind']): string =>
  kind === 'create' ? theme.ok : kind === 'delete' ? theme.error : theme.warn

const summary = (op: SyncOp): string =>
  op.kind === 'update' ? `changes: ${op.changes.join(', ')}` : ''

/**
 * The `outrider sync` review screen: a checklist of the diff between the YAML
 * file and the registry. Toggle rows, then apply only the checked ones.
 */
export const SyncView = ({ ops, onApply }: Props) => {
  const { exit } = useApp()
  const [checked, setChecked] = useState<boolean[]>(() => ops.map(() => true))
  const [cursor, setCursor] = useState(0)
  const [phase, setPhase] = useState<Phase>('review')
  const [results, setResults] = useState<ApplyResult[]>([])

  const selectedCount = checked.filter(Boolean).length

  const apply = async (): Promise<void> => {
    setPhase('applying')
    const res = await onApply(ops.filter((_, i) => checked[i]))
    setResults(res)
    setPhase('done')
  }

  useInput((input, key) => {
    if (phase === 'applying') return
    if (phase === 'done') {
      if (input === 'q' || key.escape || key.return) exit()
      return
    }
    if (input === 'q' || key.escape) exit()
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(c + 1, ops.length - 1))
    else if (key.upArrow || input === 'k') setCursor((c) => Math.max(c - 1, 0))
    else if (input === ' ') setChecked((c) => c.map((v, i) => (i === cursor ? !v : v)))
    else if (input === 'a') {
      const next = selectedCount < ops.length
      setChecked(ops.map(() => next))
    } else if (key.return && selectedCount > 0) void apply()
  })

  if (phase === 'done') {
    const failed = results.filter((r) => !r.ok).length
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={failed === 0 ? theme.ok : theme.warn}>
          applied {results.length - failed}/{results.length}
          {failed > 0 ? ` · ${failed} failed` : ''}
        </Text>
        <Box flexDirection="column" marginTop={1}>
          {results.map((r) => (
            <Text key={r.op.name} color={r.ok ? theme.ok : theme.error}>
              {r.ok ? '✓' : '✗'} {r.op.kind} {r.op.name}
              {r.error ? ` — ${r.error}` : ''}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color={theme.dim}>[q] close</Text>
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        sync · {ops.length} change{ops.length === 1 ? '' : 's'} from ~/.config/outrider.yml
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {ops.map((op, i) => {
          const focused = i === cursor && phase === 'review'
          return (
            <Box key={op.name}>
              <Text color={focused ? theme.accent : undefined}>{focused ? '› ' : '  '}</Text>
              <Text color={checked[i] ? theme.ok : theme.dim}>{checked[i] ? '[x]' : '[ ]'}</Text>
              <Text color={kindColor(op.kind)}> {KIND_LABEL[op.kind]}</Text>
              <Text bold={focused}> {op.name}</Text>
              {summary(op) ? <Text color={theme.dim}> · {summary(op)}</Text> : null}
            </Box>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>
          {phase === 'applying'
            ? 'applying…'
            : `[space] toggle · [a] all/none · [↵] apply ${selectedCount} · [q] cancel`}
        </Text>
      </Box>
    </Box>
  )
}
