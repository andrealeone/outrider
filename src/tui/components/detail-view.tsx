import { Box, Text, useInput } from 'ink'
import React from 'react'

import type { ServiceState } from '@/shared/types/protocol'
import type { InstanceState } from '@/shared/types/protocol'
import type { ServiceEntry } from '@/shared/types/registry'

import { maskSecret } from '@/shared/utils/format'
import { formatUptime } from '@/shared/utils/time'
import { theme } from '@/tui/theme'

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

const statusLine = (state: ServiceState): string => {
  const health = state.health !== 'unknown' ? ` (${state.health})` : ''
  const uptime =
    state.status === 'running' && state.startedAt !== undefined
      ? ` · up ${formatUptime(state.startedAt)}`
      : ''
  return `${state.status}${health}${uptime}`
}

const restartPolicyLine = (entry: ServiceEntry): string => {
  const max = entry.config.availability?.max_restarts
  return `${entry.config.availability?.restart ?? 'no'}${max ? ` (max ${max})` : ''}`
}

const probesLine = (entry: ServiceEntry): string =>
  [
    entry.config.readiness_probe ? 'readiness' : undefined,
    entry.config.liveness_probe ? 'liveness' : undefined,
    entry.config.ready_log_line !== undefined ? 'log line' : undefined,
  ]
    .filter(Boolean)
    .join(', ') || '—'

const dependsLine = (entry: ServiceEntry): string =>
  Object.entries(entry.config.depends_on ?? {})
    .map(([dep, c]) => `${dep} (${c?.condition ?? 'process_started'})`)
    .join(', ')

const instanceLine = (inst: InstanceState): string => {
  const pid = inst.pid !== undefined ? ` · pid ${inst.pid}` : ''
  const exit = inst.exitCode !== undefined ? ` · exit ${inst.exitCode}` : ''
  return `${inst.name} · ${inst.status}${pid}${exit} · ↻ ${inst.restarts}`
}

const maskedEnv = (entry: ServiceEntry): string[] =>
  (entry.config.environment ?? []).map((line) => {
    const eq = line.indexOf('=')
    const key = eq === -1 ? line : line.slice(0, eq)
    return `${key}=${maskSecret(key, eq === -1 ? '' : line.slice(eq + 1))}`
  })

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
  const env = maskedEnv(entry)

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Text bold color={theme.accent}>
        detail · {entry.id}
      </Text>
      <Row label="command">{entry.config.command ?? entry.config.entrypoint?.join(' ') ?? '—'}</Row>
      <Row label="working dir">{entry.config.working_dir ?? entry.dir}</Row>
      <Row label="status">{statusLine(state)}</Row>
      <Row label="desired">
        {entry.desired} · autostart {entry.autostart ? 'on' : 'off'}
      </Row>
      <Row label="restarts">{String(state.restarts)}</Row>
      <Row label="exit code">{state.exitCode === undefined ? '—' : String(state.exitCode)}</Row>
      {state.routePending ? (
        <Box>
          <Box width={16}>
            <Text color={theme.dim}>route</Text>
          </Box>
          <Text color={theme.dim}>
            {state.routeUrl} · <Text>pending — portless not installed</Text>
          </Text>
        </Box>
      ) : (
        <Row label="route">{state.routeUrl ?? entry.route?.route ?? '—'}</Row>
      )}
      <Row label="namespace">{entry.namespace ?? '—'}</Row>
      <Row label="tags">{entry.tags?.length ? entry.tags.join(', ') : '—'}</Row>
      <Row label="restart policy">{restartPolicyLine(entry)}</Row>
      <Row label="probes">{probesLine(entry)}</Row>
      {entry.config.depends_on ? <Row label="depends on">{dependsLine(entry)}</Row> : null}
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.dim}>instances</Text>
        {state.instances.map((inst) => (
          <Text key={inst.name}> {instanceLine(inst)}</Text>
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
