import { Box, Text, useInput } from 'ink'
import React from 'react'

import type { ServiceState } from '../../shared/types/protocol'

import { maskSecret } from '../../shared/utils/format'
import { formatUptime } from '../../shared/utils/time'
import { theme } from '../theme'

interface Props {
  state: ServiceState | undefined
  rows: number
  active: boolean
  onBack: () => void
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <Box>
    <Box width={16}>
      <Text color={theme.dim}>{label}</Text>
    </Box>
    <Text>{children}</Text>
  </Box>
)

/** Full config snapshot, environment with secrets masked, and route status. */
export const DetailView = ({ state, rows, active, onBack }: Props) => {
  useInput(
    (input, key) => {
      if (input === 'q' || key.escape) onBack()
    },
    { isActive: active },
  )

  if (state === undefined) {
    return (
      <Box padding={1}>
        <Text color={theme.error}>service not found</Text>
      </Box>
    )
  }

  const { entry } = state
  const env = (entry.config.environment ?? []).map((line) => {
    const eq = line.indexOf('=')
    const key = eq === -1 ? line : line.slice(0, eq)
    return `${key}=${maskSecret(key, eq === -1 ? '' : line.slice(eq + 1))}`
  })

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Text bold color={theme.accent}>
        detail · {entry.id}
      </Text>
      <Row label="command">{entry.config.command ?? entry.config.entrypoint?.join(' ') ?? '—'}</Row>
      <Row label="working dir">{entry.config.working_dir ?? entry.dir}</Row>
      <Row label="status">
        {state.status}
        {state.health !== 'unknown' ? ` (${state.health})` : ''}
        {state.status === 'running' && state.startedAt !== undefined
          ? ` · up ${formatUptime(state.startedAt)}`
          : ''}
      </Row>
      <Row label="desired">
        {entry.desired} · autostart {entry.autostart ? 'on' : 'off'}
      </Row>
      <Row label="restarts">{String(state.restarts)}</Row>
      <Row label="exit code">{state.exitCode === undefined ? '—' : String(state.exitCode)}</Row>
      <Row label="route">{state.routeUrl ?? entry.route?.route ?? '—'}</Row>
      <Row label="namespace">{entry.namespace ?? '—'}</Row>
      <Row label="restart policy">
        {entry.config.availability?.restart ?? 'no'}
        {entry.config.availability?.max_restarts
          ? ` (max ${entry.config.availability.max_restarts})`
          : ''}
      </Row>
      <Row label="probes">
        {[
          entry.config.readiness_probe ? 'readiness' : undefined,
          entry.config.liveness_probe ? 'liveness' : undefined,
          entry.config.ready_log_line !== undefined ? 'log line' : undefined,
        ]
          .filter(Boolean)
          .join(', ') || '—'}
      </Row>
      {entry.config.depends_on ? (
        <Row label="depends on">
          {Object.entries(entry.config.depends_on)
            .map(([dep, c]) => `${dep} (${c?.condition ?? 'process_started'})`)
            .join(', ')}
        </Row>
      ) : null}
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.dim}>instances</Text>
        {state.instances.map((inst) => (
          <Text key={inst.name}>
            {'  '}
            {inst.name} · {inst.status}
            {inst.pid !== undefined ? ` · pid ${inst.pid}` : ''}
            {inst.exitCode !== undefined ? ` · exit ${inst.exitCode}` : ''} · ↻ {inst.restarts}
          </Text>
        ))}
        {state.instances.length === 0 ? <Text color={theme.dim}> none</Text> : null}
      </Box>
      {env.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.dim}>environment (secrets masked)</Text>
          {env.slice(0, Math.max(2, rows - 22)).map((line) => (
            <Text key={line}> {line}</Text>
          ))}
        </Box>
      ) : null}
      <Box flexGrow={1} />
      <Text color={theme.dim}>[q] back</Text>
    </Box>
  )
}
