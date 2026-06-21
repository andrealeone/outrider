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

/**
 * Virtualised table: only the rows inside the viewport render, so a large
 * registry never costs more than one screen of JSX per frame.
 *
 * Colour rules: the status cell keeps its semantic colour; every other cell
 * uses the terminal's default foreground, switching to the accent (bold) on
 * the selected row. Nothing paints a background.
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
  const nameWidth = Math.max(14, Math.min(28, width - 70))
  const stackWidth = 10
  // Pointer+toggle prefix (4), seven padded cells, sixteen separator chars (2 per gap),
  // and the box's own horizontal padding: ROUTE gets whatever remains.
  const fixed = 4 + nameWidth + stackWidth + 12 + 9 + 8 + 3 + 3 + 16
  const routeWidth = Math.max(6, width - 2 - fixed)
  const visible = services.slice(offset, offset + height)

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text color={theme.dim}>
        {'    '}
        {fit('NAME', nameWidth)}
        {'  '}
        {fit('STACK', stackWidth)}
        {'  '}
        {fit('STATUS', 12)}
        {'  '}
        {fit('HEALTH', 9)}
        {'  '}
        {fit('UPTIME', 8)}
        {'  '}
        {fit('RST', 3)}
        {'  '}
        {fit('AUTOSTART', 12)}
        {'  '}
        {'ROUTE'}
      </Text>
      {visible.map((state, i) => {
        const index = offset + i
        const isSelected = index === selected
        const desiredUp = state.entry.desired === 'up'
        const rowColor = isSelected ? theme.select : undefined
        const uptime =
          state.status === 'running' && state.startedAt !== undefined
            ? formatUptime(state.startedAt)
            : '—'
        const cells = [fit(state.entry.name, nameWidth), fit(state.entry.stack ?? '·', stackWidth)]
        const routeDisplay = state.routePending
          ? 'route pending — portless not installed'
          : state.routeUrl ?? ''
        const trailing = [
          fit(state.health === 'unknown' ? '—' : state.health, 9),
          fit(uptime, 8),
          fit(String(state.restarts || '·'), 3),
          fit(state.entry.autostart ? '✓' : '·', 12),
          fit(routeDisplay, routeWidth).trimEnd(),
        ]
        return (
          <Box key={state.entry.id}>
            <Text color={rowColor} bold={isSelected}>
              {isSelected ? '› ' : '  '}
            </Text>
            <Text color={desiredUp ? theme.ok : theme.dim}>{desiredUp ? '◉ ' : '○ '}</Text>
            <Text color={rowColor} bold={isSelected} dimColor={!online && !isSelected}>
              {cells.join('  ')}
              {'  '}
            </Text>
            {online ? (
              <StatusBadge status={state.status} frame={frame} />
            ) : (
              <Text color={theme.dim}>{fit('· offline', 12)}</Text>
            )}
            <Text color={rowColor} bold={isSelected} dimColor={!online && !isSelected}>
              {'  '}
              {trailing.slice(0, -1).join('  ')}
              {'  '}
            </Text>
            <Text
              color={state.routePending ? theme.dim : rowColor}
              bold={isSelected && !state.routePending}
              dimColor={!online && !isSelected}
            >
              {trailing[trailing.length - 1]}
            </Text>
          </Box>
        )
      })}
      {services.length === 0 ? <Text color={theme.dim}>{'    '}No services registered</Text> : null}
    </Box>
  )
}
