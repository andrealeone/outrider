import { useState } from 'react'

import type { ServiceDefinition } from '@/shared/types/protocol'

import { useListCursor } from '@/tui/lib/use-list-cursor'

export const RESTART_OPTIONS = ['no', 'on_failure', 'always', 'exit_on_failure'] as const

export const SERVICE_FIELDS = [
  'name',
  'command',
  'workingDir',
  'route',
  'aliasPort',
  'tags',
  'restart',
  'autostart',
] as const

export interface ServiceForm {
  field: string
  fields: readonly string[]
  setField: (field: string) => void
  move: (delta: number) => void
  name: string
  setName: (v: string) => void
  command: string
  setCommand: (v: string) => void
  workingDir: string
  setWorkingDir: (v: string) => void
  route: string
  setRoute: (v: string) => void
  aliasPort: string
  setAliasPort: (v: string) => void
  tags: string
  setTags: (v: string) => void
  restartIndex: number
  cycleRestart: () => void
  autostart: boolean
  toggleAutostart: () => void
  definition: () => ServiceDefinition
}

/**
 * Shared field state and cursor navigation for a service editor: used by the
 * standalone add/edit form and each page of the import approval wizard.
 * `extraFields` lets a caller append its own pseudo-fields (e.g. "submit")
 * to the same up/down-navigable cursor.
 */
export const useServiceForm = (
  initial: ServiceDefinition | undefined,
  extraFields: readonly string[] = [],
  startField?: string,
): ServiceForm => {
  const fields = [...SERVICE_FIELDS, ...extraFields]
  const cursor = useListCursor(
    fields.length,
    startField ? Math.max(0, fields.indexOf(startField)) : 0,
  )

  const [name, setName] = useState(initial?.name ?? '')
  const [command, setCommand] = useState(initial?.command ?? '')
  const [workingDir, setWorkingDir] = useState(initial?.workingDir ?? '')
  const [route, setRoute] = useState(initial?.route ?? '')
  const [aliasPort, setAliasPort] = useState(
    initial?.aliasPort !== undefined ? String(initial.aliasPort) : '',
  )
  const [tags, setTags] = useState(initial?.tags?.join(', ') ?? '')
  const [restartIndex, setRestartIndex] = useState(
    Math.max(0, RESTART_OPTIONS.indexOf(initial?.restart ?? 'no')),
  )
  const [autostart, setAutostart] = useState(initial?.autostart ?? false)

  return {
    field: fields[cursor.index] as string,
    fields,
    setField: (f) => {
      const i = fields.indexOf(f)
      if (i >= 0) cursor.set(i)
    },
    move: (delta) => {
      if (delta > 0) cursor.next()
      else cursor.prev()
    },
    name,
    setName,
    command,
    setCommand,
    workingDir,
    setWorkingDir,
    route,
    setRoute,
    aliasPort,
    setAliasPort,
    tags,
    setTags,
    restartIndex,
    cycleRestart: () => {
      setRestartIndex((i) => (i + 1) % RESTART_OPTIONS.length)
    },
    autostart,
    toggleAutostart: () => {
      setAutostart((a) => !a)
    },
    definition: () => ({
      name: name.trim(),
      command: command.trim(),
      workingDir: workingDir.trim() === '' ? undefined : workingDir.trim(),
      route: route.trim() === '' ? undefined : route.trim(),
      aliasPort: aliasPort.trim() === '' ? undefined : Number(aliasPort.trim()),
      restart: RESTART_OPTIONS[restartIndex % RESTART_OPTIONS.length],
      autostart,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }),
  }
}
