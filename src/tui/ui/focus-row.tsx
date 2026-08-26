import type { FC, ReactNode } from 'react'
import { Box, Text } from 'ink'

import { theme } from '@/tui/lib/theme'

interface FocusMarkerProps {
  focused: boolean
  color?: string
}

/** The `› `/`  ` prefix used to mark the focused row in a cursor-driven list. */
export const FocusMarker: FC<FocusMarkerProps> = ({ focused, color = theme.accent }) => (
  <Text color={focused ? color : undefined} bold={focused}>
    {focused ? '› ' : '  '}
  </Text>
)

interface FocusRowProps {
  label: string
  focused?: boolean
  labelWidth?: number
  marker?: boolean
  children?: ReactNode
}

/** A label-column row, optionally cursor-focusable: `› label   value`. */
export const FocusRow: FC<FocusRowProps> = ({
  label,
  focused = false,
  labelWidth = 14,
  marker = true,
  children,
}) => (
  <Box>
    <Box width={labelWidth}>
      <Text color={focused ? theme.accent : theme.dim}>
        {marker ? (focused ? '› ' : '  ') : ''}
        {label}
      </Text>
    </Box>
    {children}
  </Box>
)
