import { Text, useInput } from 'ink'
import React, { useEffect, useState } from 'react'

import { theme } from '@/tui/theme'

interface Props {
  value: string
  onChange: (next: string) => void
  onSubmit?: () => void
  active: boolean
  placeholder?: string
}

/** Minimal single-line input with cursor navigation; built in-house per the dependency policy. */
export const TextInput = ({ value, onChange, onSubmit, active, placeholder }: Props) => {
  const [cursor, setCursor] = useState(value.length)

  // When this field gains focus, place the cursor at the end of the current value.
  useEffect(() => {
    if (active) setCursor(value.length)
  }, [active])

  useInput(
    (input, key) => {
      if (key.return) {
        onSubmit?.()
      } else if (key.leftArrow) {
        setCursor((c) => Math.max(0, c - 1))
      } else if (key.rightArrow) {
        setCursor((c) => Math.min(value.length, c + 1))
      } else if (key.backspace) {
        if (cursor > 0) {
          onChange(value.slice(0, cursor - 1) + value.slice(cursor))
          setCursor((c) => Math.max(0, c - 1))
        }
      } else if (key.delete) {
        if (cursor < value.length) {
          onChange(value.slice(0, cursor) + value.slice(cursor + 1))
        }
      } else if (input && !key.ctrl && !key.meta && !key.escape && !key.tab) {
        onChange(value.slice(0, cursor) + input + value.slice(cursor))
        setCursor((c) => c + 1)
      }
    },
    { isActive: active },
  )

  // Clamp in case value shrinks externally (e.g. cleared from a parent component).
  const clampedCursor = Math.min(cursor, value.length)

  if (value === '' && placeholder !== undefined && !active) {
    return <Text color={theme.dim}>{placeholder}</Text>
  }

  if (!active) {
    return <Text>{value}</Text>
  }

  const before = value.slice(0, clampedCursor)
  const cursorChar = value[clampedCursor] ?? ' '
  const after = value.slice(clampedCursor + 1)

  return (
    <Text>
      {before}
      <Text inverse>{cursorChar}</Text>
      {after}
    </Text>
  )
}
