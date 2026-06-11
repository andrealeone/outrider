import { Text, useInput } from 'ink'
import React from 'react'

import { theme } from '../theme'

interface Props {
  value: string
  onChange: (next: string) => void
  onSubmit?: () => void
  active: boolean
  placeholder?: string
}

/** Minimal single-line input; built in-house per the dependency policy. */
export const TextInput = ({ value, onChange, onSubmit, active, placeholder }: Props) => {
  useInput(
    (input, key) => {
      if (key.return) onSubmit?.()
      else if (key.backspace || key.delete) onChange(value.slice(0, -1))
      else if (input && !key.ctrl && !key.meta && !key.escape && !key.tab) onChange(value + input)
    },
    { isActive: active },
  )

  if (value === '' && placeholder !== undefined && !active) {
    return <Text color={theme.dim}>{placeholder}</Text>
  }
  return (
    <Text>
      {value}
      {active ? <Text inverse> </Text> : null}
    </Text>
  )
}
