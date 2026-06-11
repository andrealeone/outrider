import { Box, Text, useInput } from 'ink'
import React, { useState } from 'react'

import type { ImportReport } from '../../shared/types/protocol'
import type { DaemonHook } from '../use-daemon'

import { theme } from '../theme'
import { TextInput } from './text-input'

interface Props {
  daemon: DaemonHook
  active: boolean
  onDone: () => void
}

/** Path input plus a dry-run validation report before anything registers. */
export const ImportStack = ({ daemon, active, onDone }: Props) => {
  const [path, setPath] = useState('')
  const [report, setReport] = useState<ImportReport>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const preview = async (): Promise<void> => {
    if (path.trim() === '' || busy) return
    setBusy(true)
    setError(undefined)
    try {
      setReport(await daemon.importStack(path.trim(), true))
    } catch (err) {
      setReport(undefined)
      setError(err instanceof Error ? err.message : String(err))
    }
    setBusy(false)
  }

  const confirm = async (): Promise<void> => {
    if (report === undefined || busy) return
    setBusy(true)
    try {
      await daemon.importStack(path.trim(), false)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  useInput(
    (input, key) => {
      if (key.escape) onDone()
      else if (report !== undefined && input === 'y') void confirm()
      else if (report !== undefined && input === 'e') setReport(undefined)
    },
    { isActive: active },
  )

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        import stack
      </Text>
      <Box marginTop={1}>
        <Text color={theme.dim}>path: </Text>
        <TextInput
          value={path}
          onChange={(v) => {
            setPath(v)
            setReport(undefined)
          }}
          active={active && report === undefined}
          onSubmit={() => void preview()}
          placeholder="/path/to/process-compose.yaml (or a directory)"
        />
      </Box>
      {busy ? <Text color={theme.dim}>working…</Text> : null}
      {error !== undefined ? <Text color={theme.error}>✗ {error}</Text> : null}
      {report !== undefined ? (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            stack <Text bold>{report.stack}</Text> · {report.services.length} processes ·{' '}
            {report.sources.length} file{report.sources.length === 1 ? '' : 's'} merged
          </Text>
          <Text color={theme.dim}>
            start order: {report.startOrder.map((level) => level.join(', ')).join(' → ')}
          </Text>
          {report.warnings.map((w) => (
            <Text key={`${w.process ?? ''}${w.message}`} color={theme.warn}>
              ⚠ {w.message}
            </Text>
          ))}
          <Box marginTop={1}>
            <Text color={theme.ok}>[y] import · [e]dit path · [esc] cancel</Text>
          </Box>
        </Box>
      ) : (
        <Text color={theme.dim}>enter to preview (dry run) · esc to cancel</Text>
      )}
    </Box>
  )
}
