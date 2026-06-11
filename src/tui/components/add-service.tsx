import { Box, Text, useInput } from 'ink'
import React, { useEffect, useState } from 'react'

import type { ServiceDefinition } from '../../shared/types/protocol'
import type { DaemonHook } from '../use-daemon'

import { theme } from '../theme'
import { TextInput } from './text-input'

interface Props {
  daemon: DaemonHook
  active: boolean
  onDone: () => void
}

const RESTART_OPTIONS = ['no', 'on_failure', 'always'] as const

const FIELDS = ['name', 'command', 'workingDir', 'route', 'restart', 'autostart', 'submit'] as const
type Field = (typeof FIELDS)[number]

/** Form wizard for a standalone service, validated live against the daemon. */
export const AddService = ({ daemon, active, onDone }: Props) => {
  const [field, setField] = useState<Field>('name')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [workingDir, setWorkingDir] = useState('')
  const [route, setRoute] = useState('')
  const [restartIndex, setRestartIndex] = useState(0)
  const [autostart, setAutostart] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  const definition = (): ServiceDefinition => ({
    name: name.trim(),
    command: command.trim(),
    workingDir: workingDir.trim() === '' ? undefined : workingDir.trim(),
    route: route.trim() === '' ? undefined : route.trim(),
    restart: RESTART_OPTIONS[restartIndex % RESTART_OPTIONS.length],
    autostart,
  })

  // Live validation against the daemon as the form changes.
  useEffect(() => {
    if (name.trim() === '' && command.trim() === '') return undefined
    const timer = setTimeout(() => {
      void (async () => {
        setErrors(await daemon.validateService(definition()))
      })()
    }, 250)
    return () => {
      clearTimeout(timer)
    }
  }, [name, command, workingDir, route])

  const move = (delta: number): void => {
    const index = FIELDS.indexOf(field)
    setField(FIELDS[Math.max(0, Math.min(FIELDS.length - 1, index + delta))] as Field)
  }

  const submit = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    const error = await daemon.addService(definition())
    setSubmitting(false)
    if (error === undefined) onDone()
    else setErrors([error])
  }

  useInput(
    (input, key) => {
      if (key.escape) onDone()
      else if (key.tab && key.shift) move(-1)
      else if (key.tab || (key.return && field !== 'submit')) move(1)
      else if (field === 'restart' && (input === ' ' || key.leftArrow || key.rightArrow)) {
        setRestartIndex((i) => i + 1)
      } else if (field === 'autostart' && input === ' ') setAutostart((a) => !a)
      else if (field === 'submit' && key.return) void submit()
    },
    { isActive: active },
  )

  const textField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    own: Field,
    placeholder: string,
  ) => (
    <Box>
      <Box width={14}>
        <Text color={field === own ? theme.accent : theme.dim}>
          {field === own ? '› ' : '  '}
          {label}
        </Text>
      </Box>
      <TextInput
        value={value}
        onChange={onChange}
        active={active && field === own}
        placeholder={placeholder}
      />
    </Box>
  )

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        add service
      </Text>
      <Text color={theme.dim}>tab/enter to move, esc to cancel</Text>
      <Box marginTop={1} flexDirection="column">
        {textField('name', name, setName, 'name', 'api')}
        {textField('command', command, setCommand, 'command', 'bun run server.ts')}
        {textField('working dir', workingDir, setWorkingDir, 'workingDir', '(home)')}
        {textField('route', route, setRoute, 'route', '(none — e.g. api → api.localhost)')}
        <Box>
          <Box width={14}>
            <Text color={field === 'restart' ? theme.accent : theme.dim}>
              {field === 'restart' ? '› ' : '  '}restart
            </Text>
          </Box>
          <Text>{RESTART_OPTIONS[restartIndex % RESTART_OPTIONS.length]} (space cycles)</Text>
        </Box>
        <Box>
          <Box width={14}>
            <Text color={field === 'autostart' ? theme.accent : theme.dim}>
              {field === 'autostart' ? '› ' : '  '}autostart
            </Text>
          </Box>
          <Text>{autostart ? 'yes' : 'no'} (space toggles)</Text>
        </Box>
        <Box marginTop={1}>
          <Text
            bold
            color={errors.length === 0 ? theme.ok : theme.dim}
            inverse={field === 'submit'}
          >
            {submitting ? ' saving… ' : ' save service '}
          </Text>
        </Box>
      </Box>
      {errors.length > 0 ? (
        <Box flexDirection="column" marginTop={1}>
          {errors.map((e) => (
            <Text key={e} color={theme.error}>
              ✗ {e}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  )
}
