import type { Key } from 'ink'
import { Box, Text } from 'ink'

import { RESTART_OPTIONS, type ServiceForm } from '@/tui/lib/use-service-form'
import { FocusRow } from '@/tui/ui/focus-row'
import { TextInput } from '@/tui/ui/text-input'

interface Props {
  form: ServiceForm
  active: boolean
}

/** The name/command/route/... field rows shared by the standalone editor and the import wizard. */
export const ServiceFields = ({ form, active }: Props) => {
  const text = (
    key: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <FocusRow label={label} focused={form.field === key}>
      <TextInput
        value={value}
        onChange={onChange}
        active={active && form.field === key}
        placeholder={placeholder}
      />
    </FocusRow>
  )

  return (
    <Box flexDirection="column">
      {text('name', 'name', form.name, form.setName, 'api')}
      {text('command', 'command', form.command, form.setCommand, 'bun run server.ts')}
      {text('workingDir', 'working dir', form.workingDir, form.setWorkingDir, '(home)')}
      {text('route', 'route', form.route, form.setRoute, '(none — e.g. api → api.localhost)')}
      {text(
        'aliasPort',
        'alias port',
        form.aliasPort,
        form.setAliasPort,
        '(none — fixed port for external tools, e.g. 10020)',
      )}
      {text('tags', 'tags', form.tags, form.setTags, '(none — comma-separated, e.g. web, db)')}
      <FocusRow label="restart" focused={form.field === 'restart'}>
        <Text>{RESTART_OPTIONS[form.restartIndex % RESTART_OPTIONS.length]}</Text>
      </FocusRow>
      <FocusRow label="autostart" focused={form.field === 'autostart'}>
        <Text>{form.autostart ? 'yes' : 'no'}</Text>
      </FocusRow>
    </Box>
  )
}

/**
 * Up/down move between fields; left/right/space act on the focused field's
 * value (restart cycles, autostart toggles). Returns whether the key was
 * consumed, so callers can chain their own bindings after it.
 */
export const handleServiceFieldInput = (form: ServiceForm, input: string, key: Key): boolean => {
  if (key.downArrow) {
    form.move(1)
    return true
  }
  if (key.upArrow) {
    form.move(-1)
    return true
  }
  if (form.field === 'restart' && (input === ' ' || key.leftArrow || key.rightArrow)) {
    form.cycleRestart()
    return true
  }
  if (form.field === 'autostart' && input === ' ') {
    form.toggleAutostart()
    return true
  }
  return false
}
