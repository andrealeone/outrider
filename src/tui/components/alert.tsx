import React from 'react'
import { Box, Text } from 'ink'

interface AlertProps {
  children: string
  type?: 'info' | 'warning' | 'error'
}

export const Alert: React.FC<AlertProps> = ({ children, type = 'info' }) => {
  const colors: Record<string, 'cyan' | 'yellow' | 'red'> = {
    info: 'cyan',
    warning: 'yellow',
    error: 'red',
  }

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={colors[type]} padding={1}>
      <Text color={colors[type]}>{children}</Text>
    </Box>
  )
}
