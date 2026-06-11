import { Box, Text } from 'ink'
import React from 'react'

import type { ServiceState } from '../../shared/types/protocol'

import { fit } from '../../shared/utils/format'
import { formatUptime } from '../../shared/utils/time'
import { theme } from '../theme'
import { StatusBadge } from './status-badge'

interface Props {
  services: ServiceState[]
  selected: number
  offset: number
  height: number
  width: number
  frame: number
  online: boolean
}

const COLUMNS = 'NAME · STACK · STATUS · HEALTH · UPTIME · ↻ · ROUTE'

/**
 * Virtualised table: only the rows inside the viewport render, so a large
 * registry never costs more than one screen of JSX per frame.
 */
export const ServiceTable = ({
  services,
  selected,
  offset,
  height,
  width,
  frame,
  online,
}: Props) => {
  const nameWidth = Math.max(14, Math.min(28, width - 64))
  const stackWidth = 12
  const visible = services.slice(offset, offset + height)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.dim}>
        {'   '}
        {fit('NAME', nameWidth)} {fit('STACK', stackWidth)} {fit('STATUS', 12)} {fit('HEALTH', 9)}{' '}
        {fit('UPTIME', 8)} {fit('↻', 3)} ROUTE
      </Text>
      {visible.map((state, i) => {
        const index = offset + i
        const isSelected = index === selected
        const desiredUp = state.entry.desired === 'up'
        const uptime =
          state.status === 'running' && state.startedAt !== undefined
            ? formatUptime(state.startedAt)
            : '—'
        return (
          <Box key={state.entry.id}>
            <Text inverse={isSelected} color={isSelected ? theme.selection : undefined}>
              <Text color={desiredUp ? theme.ok : theme.dim}>{desiredUp ? ' ◉ ' : ' ○ '}</Text>
              <Text bold={isSelected} dimColor={!online}>
                {fit(state.entry.name, nameWidth)}
              </Text>{' '}
              <Text color={theme.dim}>{fit(state.entry.stack ?? '·', stackWidth)}</Text>{' '}
              {online ? (
                <StatusBadge status={state.status} frame={frame} />
              ) : (
                <Text color={theme.dim}>{fit('· offline', 12)}</Text>
              )}{' '}
              <Text
                color={
                  state.health === 'ready'
                    ? theme.ok
                    : state.health === 'not_ready'
                      ? theme.warn
                      : theme.dim
                }
              >
                {fit(state.health === 'unknown' ? '—' : state.health, 9)}
              </Text>{' '}
              <Text>{fit(uptime, 8)}</Text> <Text>{fit(String(state.restarts || '·'), 3)}</Text>{' '}
              <Text color={theme.route}>{state.routeUrl ?? ''}</Text>
            </Text>
          </Box>
        )
      })}
      {services.length === 0 ? (
        <Text color={theme.dim}>
          {'   '}no services registered — [a]dd a service or i[m]port a stack
        </Text>
      ) : null}
    </Box>
  )
}

export const tableColumnsHint = COLUMNS
