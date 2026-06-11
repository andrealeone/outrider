import { Text } from 'ink'
import React from 'react'

import type { ProcessStatus } from '../../shared/types/protocol'

import { SPINNER_FRAMES, statusColor, statusGlyph, TRANSIENT_STATUSES } from '../theme'

interface Props {
  status: ProcessStatus
  frame: number
  width?: number
}

/** Status cell: transient states animate on the shared frame clock. */
export const StatusBadge = ({ status, frame, width = 12 }: Props) => {
  const glyph = TRANSIENT_STATUSES.has(status)
    ? SPINNER_FRAMES[frame % SPINNER_FRAMES.length]
    : statusGlyph(status)
  return <Text color={statusColor(status)}>{`${glyph} ${status}`.padEnd(width)}</Text>
}
