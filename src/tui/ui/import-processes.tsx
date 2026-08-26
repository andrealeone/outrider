import { Box, Text, useInput } from 'ink'
import { useEffect, useRef, useState } from 'react'

import type { ImportApplyResult, ImportPreview, ServiceDefinition } from '@/shared/types/protocol'
import type { DaemonHook } from '@/tui/lib/use-daemon'

import { theme } from '@/tui/lib/theme'
import { useServiceForm } from '@/tui/lib/use-service-form'
import { TextInput } from '@/tui/ui/text-input'
import { ServiceFields, handleServiceFieldInput } from '@/tui/ui/service-fields'
import { FocusRow } from '@/tui/ui/focus-row'
import { HintBar } from '@/tui/ui/hint-bar'

interface Props {
  daemon: DaemonHook
  active: boolean
  onDone: () => void
}

type Decision = 'pending' | 'approved' | 'rejected'

const decisionColor = (decision: Decision): string =>
  decision === 'approved' ? theme.ok : decision === 'rejected' ? theme.error : theme.dim

const DecisionRow = ({ field, decision }: { field: string; decision: Decision }) => (
  <Box marginTop={1}>
    <FocusRow label="" marker={false}>
      <Text bold color={field === 'approve' ? theme.ok : theme.dim}>
        {field === 'approve' ? '› ' : '  '}[approve]
      </Text>
      <Text> </Text>
      <Text bold color={field === 'reject' ? theme.error : theme.dim}>
        {field === 'reject' ? '› ' : '  '}[reject]
      </Text>
      <Text> </Text>
      <Text color={decisionColor(decision)}>({decision})</Text>
    </FocusRow>
  </Box>
)

/** One process's editor page: the shared service field editor plus an approve/reject decision. */
const ProcessPage = ({
  initial,
  decision,
  active,
  onChange,
  onDecide,
}: {
  initial: ServiceDefinition
  decision: Decision
  active: boolean
  onChange: (def: ServiceDefinition) => void
  onDecide: (decision: 'approved' | 'rejected') => void
}) => {
  const form = useServiceForm(initial, ['approve', 'reject'])

  useEffect(() => {
    onChange(form.definition())
  })

  useInput(
    (input, key) => {
      if (handleServiceFieldInput(form, input, key)) return
      if (key.tab && key.shift) form.move(-1)
      else if (key.tab) form.move(1)
      else if (key.return) {
        if (form.field === 'approve') onDecide('approved')
        else if (form.field === 'reject') onDecide('rejected')
        else form.move(1)
      }
    },
    { isActive: active },
  )

  return (
    <Box flexDirection="column">
      <ServiceFields form={form} active={active} />
      <DecisionRow field={form.field} decision={decision} />
    </Box>
  )
}

/** A process removed from the file since the last import: approve to delete it. */
const RemovalPage = ({
  processName,
  decision,
  active,
  onDecide,
}: {
  processName: string
  decision: Decision
  active: boolean
  onDecide: (decision: 'approved' | 'rejected') => void
}) => {
  const [field, setField] = useState<'approve' | 'reject'>('reject')

  useInput(
    (input, key) => {
      if (key.leftArrow || key.rightArrow || key.tab || key.upArrow || key.downArrow) {
        setField((f) => (f === 'approve' ? 'reject' : 'approve'))
      } else if (key.return) {
        onDecide(field === 'approve' ? 'approved' : 'rejected')
      }
    },
    { isActive: active },
  )

  return (
    <Box flexDirection="column">
      <Text color={theme.warn}>
        "{processName}" is no longer in the compose file. Approve to remove it from the registry.
      </Text>
      <DecisionRow field={field} decision={decision} />
    </Box>
  )
}

/** Path input, then a paginated review of every process before anything registers. */
export const ImportProcesses = ({ daemon, active, onDone }: Props) => {
  const [path, setPath] = useState('')
  const [preview, setPreview] = useState<ImportPreview>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportApplyResult>()

  const [pageIndex, setPageIndex] = useState(0)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const drafts = useRef<Record<string, ServiceDefinition>>({})

  const pages =
    preview === undefined
      ? []
      : [
          ...preview.processes,
          ...preview.toRemove.map((processName) => ({ processName, removal: true as const })),
        ]
  const pageCount = pages.length
  const clampedPage = Math.max(0, Math.min(pageIndex, pageCount))
  const onSummary = clampedPage === pageCount

  const startPreview = async (): Promise<void> => {
    if (path.trim() === '' || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const p = await daemon.previewImport(path.trim())
      setPreview(p)
      drafts.current = Object.fromEntries(
        p.processes.map((proc) => [proc.processName, proc.definition]),
      )
      setDecisions({})
      setPageIndex(0)
    } catch (err) {
      setPreview(undefined)
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const apply = async (): Promise<void> => {
    if (preview === undefined || busy) return
    setBusy(true)
    try {
      const approved = preview.processes
        .filter((proc) => decisions[proc.processName] === 'approved')
        .map((proc) => ({
          processName: proc.processName,
          definition: drafts.current[proc.processName] as ServiceDefinition,
        }))
      const removedProcessNames = preview.toRemove.filter((name) => decisions[name] === 'approved')
      const res = await daemon.applyImport({
        path: path.trim(),
        sourceTag: preview.sourceTag,
        approved,
        removedProcessNames,
      })
      setResult(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  useInput(
    (input, key) => {
      if (result !== undefined) {
        if (input === 'q' || key.escape || key.return) onDone()
        return
      }
      if (key.escape) {
        onDone()
        return
      }
      if (preview === undefined) return
      if (key.pageDown) {
        setPageIndex((i) => Math.min(pageCount, i + 1))
        return
      }
      if (key.pageUp) {
        setPageIndex((i) => Math.max(0, i - 1))
        return
      }
      if (onSummary && input === 'y' && !busy) void apply()
    },
    { isActive: active },
  )

  // Path phase: no preview yet.
  if (preview === undefined) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={theme.accent}>
          import processes
        </Text>
        <Box marginTop={1}>
          <Text color={theme.dim}>path: </Text>
          <TextInput
            value={path}
            onChange={setPath}
            active={active}
            onSubmit={() => void startPreview()}
            placeholder="/path/to/process-compose.yaml (or a directory)"
          />
        </Box>
        {busy ? <Text color={theme.dim}>working…</Text> : null}
        {error !== undefined ? <Text color={theme.error}>✗ {error}</Text> : null}
        <Box marginTop={1}>
          <HintBar hints={['[↵] preview', '[esc] cancel']} />
        </Box>
      </Box>
    )
  }

  // Done phase.
  if (result !== undefined) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={theme.ok}>
          import applied
        </Text>
        <Text>
          {result.created.length} created · {result.updated.length} updated ·{' '}
          {result.removed.length} removed
        </Text>
        <Box marginTop={1}>
          <HintBar hints={['[q] close']} />
        </Box>
      </Box>
    )
  }

  const decisionOf = (processName: string): Decision => decisions[processName] ?? 'pending'
  const decide = (processName: string, decision: 'approved' | 'rejected'): void => {
    setDecisions((d) => ({ ...d, [processName]: decision }))
    setPageIndex((i) => Math.min(pageCount, i + 1))
  }

  // Summary/confirm phase, one past the last page.
  if (onSummary) {
    const approvedCount = preview.processes.filter(
      (p) => decisionOf(p.processName) === 'approved',
    ).length
    const removeCount = preview.toRemove.filter((n) => decisionOf(n) === 'approved').length
    const pendingCount = pages.filter((p) => decisionOf(p.processName) === 'pending').length

    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color={theme.accent}>
          review · {preview.sourceTag}
        </Text>
        <Text>
          {approvedCount} to import/update · {removeCount} to remove
          {pendingCount > 0 ? ` · ${pendingCount} undecided (skipped)` : ''}
        </Text>
        {preview.warnings.map((w) => (
          <Text key={`${w.process ?? ''}${w.message}`} color={theme.warn}>
            ⚠ {w.message}
          </Text>
        ))}
        {error !== undefined ? <Text color={theme.error}>✗ {error}</Text> : null}
        {busy ? <Text color={theme.dim}>applying…</Text> : null}
        <Box marginTop={1}>
          <HintBar hints={['[y] apply', '[pageUp] back to review', '[esc] cancel']} />
        </Box>
      </Box>
    )
  }

  const page = pages[clampedPage] as (typeof pages)[number]
  const isRemoval = 'removal' in page

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        import · process {clampedPage + 1}/{pageCount} · {preview.sourceTag}
      </Text>
      {isRemoval ? (
        <RemovalPage
          processName={page.processName}
          decision={decisionOf(page.processName)}
          active={active}
          onDecide={(d) => {
            decide(page.processName, d)
          }}
        />
      ) : (
        <ProcessPage
          key={page.processName}
          initial={drafts.current[page.processName] as ServiceDefinition}
          decision={decisionOf(page.processName)}
          active={active}
          onChange={(def) => {
            drafts.current[page.processName] = def
          }}
          onDecide={(d) => {
            decide(page.processName, d)
          }}
        />
      )}
      <Box marginTop={1}>
        <HintBar
          hints={['tab/enter/↑↓ within page', '[pageUp/pageDown] switch process', '[esc] cancel']}
        />
      </Box>
    </Box>
  )
}
