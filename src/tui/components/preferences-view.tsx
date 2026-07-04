import { Box, Text, useApp, useInput } from 'ink'
import React, { useState } from 'react'

import { theme } from '@/tui/theme'
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  readPreferences,
  setPreference,
} from '@/shared/utils/preferences'

type Field = 'use-portless' | 'theme'

const FIELDS: Field[] = ['use-portless', 'theme']

const DESCRIPTIONS: Record<Field, string> = {
  'use-portless': 'route services through portless when installed',
  theme: 'dashboard palette',
}

/**
 * Interactive `outrider preferences` screen: arrow through the switches,
 * space/enter flips or cycles the value, writing to disk immediately so a
 * change is never lost to an unexpected exit.
 */
export const PreferencesView = () => {
  const { exit } = useApp()
  const [prefs, setPrefs] = useState<Preferences>(() => readPreferences())
  const [cursor, setCursor] = useState(0)

  const flip = (): void => {
    const field = FIELDS[cursor]
    if (field === 'use-portless') {
      const next = !prefs.usePortless
      setPreference('use-portless', next ? 'on' : 'off')
      setPrefs((p) => ({ ...p, usePortless: next }))
    } else {
      const next: Preferences['theme'] = prefs.theme === 'default' ? 'light' : 'default'
      setPreference('theme', next)
      setPrefs((p) => ({ ...p, theme: next }))
    }
  }

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit()
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(c + 1, FIELDS.length - 1))
    else if (key.upArrow || input === 'k') setCursor((c) => Math.max(c - 1, 0))
    else if (input === ' ' || key.return || key.leftArrow || key.rightArrow) flip()
    else if (input === 'r') {
      setPreference('use-portless', DEFAULT_PREFERENCES.usePortless ? 'on' : 'off')
      setPreference('theme', DEFAULT_PREFERENCES.theme)
      setPrefs({ ...DEFAULT_PREFERENCES })
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        preferences
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {FIELDS.map((field, i) => {
          const focused = i === cursor
          const value = field === 'use-portless' ? (prefs.usePortless ? 'on' : 'off') : prefs.theme
          const valueColor = field === 'use-portless' ? (prefs.usePortless ? theme.ok : theme.dim) : undefined
          return (
            <Box key={field}>
              <Text color={focused ? theme.accent : undefined}>{focused ? '› ' : '  '}</Text>
              <Box width={14}>
                <Text bold={focused}>{field}</Text>
              </Box>
              <Text color={valueColor}>{value}</Text>
              <Text color={theme.dim}> · {DESCRIPTIONS[field]}</Text>
            </Box>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.dim}>[space/↵] toggle · [r] reset all · [q] close</Text>
      </Box>
    </Box>
  )
}
