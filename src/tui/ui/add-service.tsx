import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'

import type { DaemonHook } from '@/tui/lib/use-daemon'
import type { ServiceEntry } from '@/shared/types/registry'
import type { ServiceDefinition } from '@/shared/types/protocol'

import { theme } from '@/tui/lib/theme'
import { useServiceForm } from '@/tui/lib/use-service-form'
import { ServiceFields, handleServiceFieldInput } from '@/tui/ui/service-fields'
import { HintBar } from '@/tui/ui/hint-bar'

interface Props {
  daemon: DaemonHook
  active: boolean
  edit?: ServiceEntry
  onDone: () => void
}

const definitionOf = (entry: ServiceEntry): ServiceDefinition => ({
  name: entry.name,
  command: entry.config.command ?? '',
  workingDir: entry.config.working_dir,
  route: entry.route?.route,
  aliasPort: entry.route?.port,
  restart: entry.config.availability?.restart ?? 'no',
  autostart: entry.autostart,
  tags: entry.tags,
})

/** Form wizard for a standalone service, validated live against the daemon. */
export const AddService = ({ daemon, active, edit, onDone }: Props) => {
  const editing = edit !== undefined
  const form = useServiceForm(editing ? definitionOf(edit) : undefined, ['submit'])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Live validation against the daemon as the form changes.
  useEffect(() => {
    if (form.name.trim() === '' && form.command.trim() === '') return undefined
    const timer = setTimeout(() => {
      void (async () => {
        setErrors(await daemon.validateService(form.definition(), edit?.id))
      })()
    }, 250)
    return () => {
      clearTimeout(timer)
    }
  }, [form.name, form.command, form.workingDir, form.route, form.aliasPort, form.tags])

  const submit = async (): Promise<void> => {
    if (submitting) return
    setSubmitting(true)
    const def = form.definition()
    const error = editing ? await daemon.updateService(edit.id, def) : await daemon.addService(def)
    setSubmitting(false)
    if (error === undefined) onDone()
    else setErrors([error])
  }

  useInput(
    (input, key) => {
      if (key.escape) {
        onDone()
        return
      }
      if (handleServiceFieldInput(form, input, key)) return
      if (key.tab && key.shift) form.move(-1)
      else if (key.tab || (key.return && form.field !== 'submit')) form.move(1)
      else if (form.field === 'submit' && key.return) void submit()
    },
    { isActive: active },
  )

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color={theme.accent}>
        {editing ? `Edit service · ${edit.id}` : 'Add service'}
      </Text>
      <HintBar
        hints={[
          'tab/enter/↑↓ to move',
          'esc to cancel',
          ...(editing ? ['a running service restarts on save'] : []),
        ]}
      />
      <Box marginTop={1} flexDirection="column">
        <ServiceFields form={form} active={active} />
        <Box marginTop={1}>
          <Text bold color={form.field === 'submit' ? theme.accent : theme.dim}>
            {form.field === 'submit' ? '› ' : '  '}
            {submitting ? 'Saving…' : editing ? 'Save changes' : 'Save service'}
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
