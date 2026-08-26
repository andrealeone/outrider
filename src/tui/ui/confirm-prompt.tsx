import type { FC } from 'react'

import { Alert } from '@/tui/ui/alert'

interface ConfirmPromptProps {
  message: string
  type?: 'warning' | 'error'
}

/** A y/n confirmation banner; the caller owns the `useInput` handling. */
export const ConfirmPrompt: FC<ConfirmPromptProps> = ({ message, type = 'warning' }) => (
  <Alert type={type}>{message}</Alert>
)
