import { Box, Text, useApp, useInput } from 'ink'
import { useState } from 'react'

import { theme } from '@/tui/lib/theme'
import {
  DEFAULT_PREFERENCES,
  type Preferences,
  readPreferences,
  setPreference,
} from '@/shared/utils/preferences'

type Field = 'theme'

const FIELDS: Field[] = ['theme']

const DESCRIPTIONS: Record<Field, string> = {
  'theme': 'dashboard palette',
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
    const next: Preferences['theme'] = prefs.theme === 'default' ? 'light' : 'default'
    setPreference('theme', next)
    setPrefs((p) => ({ ...p, theme: next }))
  }

  useInput((input, key) => {
    if (input === 'q' || key.escape) exit()
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(c + 1, FIELDS.length - 1))
    else if (key.upArrow || input === 'k') setCursor((c) => Math.max(c - 1, 0))
    else if (input === ' ' || key.return || key.leftArrow || key.rightArrow) flip()
    else if (input === 'r') {
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
          const value = prefs.theme
          return (
            <Box key={field}>
              <Text color={focused ? theme.accent : undefined}>{focused ? '› ' : '  '}</Text>
              <Box width={14}>
                <Text bold={focused}>{field}</Text>
              </Box>
              <Text>{value}</Text>
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
