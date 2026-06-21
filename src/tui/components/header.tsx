import { Box, Text } from 'ink'
import React from 'react'

import type { ServiceState } from '@/shared/types/protocol'
import type { Connection } from '@/tui/use-daemon'

import { theme } from '@/tui/theme'

interface Props {
  connection: Connection
  shuttingDown: boolean
  services: ServiceState[]
  version?: string
}

/** Aggregate counts and the daemon master switch state. */
export const Header = ({ connection, shuttingDown, services, version }: Props) => {
  const running = services.filter((s) => s.status === 'running').length
  const unhealthy = services.filter(
    (s) => s.status === 'running' && s.health === 'not_ready',
  ).length
  const errored = services.filter((s) => s.status === 'error').length
  const stopped = services.length - running - errored

  const daemonLabel = shuttingDown
    ? 'shutting down…'
    : connection === 'online'
      ? 'on'
      : connection === 'connecting'
        ? 'connecting…'
        : 'off'
  const daemonColor =
    connection === 'online' && !shuttingDown
      ? theme.ok
      : connection === 'offline'
        ? theme.error
        : theme.warn

  return (
    <Box justifyContent="space-between" paddingX={1}>
      <Text>
        <Text bold color={theme.accent}>
          outrider
        </Text>
        <Text color={theme.dim}>{version === undefined ? '' : ` ${version}`}</Text>
        {'  daemon '}
        <Text bold color={daemonColor}>
          ⏻ {daemonLabel}
        </Text>
        <Text color={theme.dim}> [D]</Text>
      </Text>
      <Text>
        <Text color={theme.ok}>● {running} running </Text>
        {unhealthy > 0 ? <Text color={theme.warn}>◑ {unhealthy} unhealthy </Text> : null}
        {errored > 0 ? <Text color={theme.error}>✗ {errored} error </Text> : null}
        <Text color={theme.dim}>○ {stopped} stopped</Text>
      </Text>
    </Box>
  )
}
