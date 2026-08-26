import type { FC } from 'react'
import { Text } from 'ink'

import { theme } from '@/tui/lib/theme'

interface HintBarProps {
  hints: string[]
}

/** Footer key-hint line: each entry already carries its own `[key]` markup. */
export const HintBar: FC<HintBarProps> = ({ hints }) => (
  <Text color={theme.dim}>{hints.join(' · ')}</Text>
)
