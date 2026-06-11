import { Box, Text, useInput } from 'ink'
import React, { useMemo, useState } from 'react'

import type { ServiceState } from '../../shared/types/protocol'
import type { ServiceEntry } from '../../shared/types/registry'
import type { DaemonHook } from '../use-daemon'

import { theme } from '../theme'
import { Header } from './header'
import { ServiceTable } from './service-table'
import { TextInput } from './text-input'

export type View =
  | { name: 'dashboard' }
  | { name: 'logs'; id: string }
  | { name: 'detail'; id: string }
  | { name: 'add'; edit?: ServiceEntry }
  | { name: 'import' }

interface Props {
  daemon: DaemonHook
  rows: number
  width: number
  frame: number
  active: boolean
  onOpen: (view: View) => void
  onQuit: () => void
}

const SORTS = ['name', 'status', 'stack', 'uptime'] as const

const fuzzyMatch = (needle: string, haystack: string): boolean => {
  let i = 0
  const lower = haystack.toLowerCase()
  for (const ch of needle.toLowerCase()) {
    i = lower.indexOf(ch, i)
    if (i === -1) return false
    i += 1
  }
  return true
}

export const Dashboard = ({ daemon, rows, width, frame, active, onOpen, onQuit }: Props) => {
  const [selected, setSelected] = useState(0)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [sortIndex, setSortIndex] = useState(0)
  const [stackFilter, setStackFilter] = useState<string>()
  const [confirmOff, setConfirmOff] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<ServiceState>()

  const stacks = useMemo(
    () => [...new Set(daemon.services.map((s) => s.entry.stack ?? '(standalone)'))].sort(),
    [daemon.services],
  )

  const filtered = useMemo(() => {
    let list = daemon.services
    if (stackFilter !== undefined) {
      list = list.filter((s) => (s.entry.stack ?? '(standalone)') === stackFilter)
    }
    if (search !== '') list = list.filter((s) => fuzzyMatch(search, s.entry.id))
    const sort = SORTS[sortIndex % SORTS.length] ?? 'name'
    return [...list].sort((a, b) => {
      switch (sort) {
        case 'status':
          return a.status.localeCompare(b.status) || a.entry.id.localeCompare(b.entry.id)
        case 'stack':
          return (
            (a.entry.stack ?? '').localeCompare(b.entry.stack ?? '') ||
            a.entry.id.localeCompare(b.entry.id)
          )
        case 'uptime':
          return (b.startedAt ?? '').localeCompare(a.startedAt ?? '')
        case 'name':
        default:
          return a.entry.id.localeCompare(b.entry.id)
      }
    })
  }, [daemon.services, stackFilter, search, sortIndex])

  const tableHeight = Math.max(3, rows - 7)
  const clampedSelection = Math.min(selected, Math.max(0, filtered.length - 1))
  const offset = Math.max(
    0,
    Math.min(clampedSelection - tableHeight + 2, filtered.length - tableHeight),
  )
  const current: ServiceState | undefined = filtered[clampedSelection]

  /** y/n prompts and the search input swallow keys while open. */
  const handleModalKeys = (input: string, key: { escape: boolean; return: boolean }): boolean => {
    if (confirmOff) {
      if (input === 'y') daemon.daemonOff()
      if (input === 'y' || input === 'n' || key.escape) setConfirmOff(false)
      return true
    }
    if (confirmDelete !== undefined) {
      if (input === 'y') daemon.removeService(confirmDelete)
      if (input === 'y' || input === 'n' || key.escape) setConfirmDelete(undefined)
      return true
    }
    if (searching) {
      if (key.escape) setSearch('')
      if (key.escape || key.return) setSearching(false)
      return true
    }
    return false
  }

  const cycleStackFilter = (): void => {
    setStackFilter((f) => {
      const index = f === undefined ? -1 : stacks.indexOf(f)
      return index + 1 >= stacks.length ? undefined : stacks[index + 1]
    })
  }

  const globalActions: Record<string, () => void> = {
    'q': onQuit,
    'j': () => {
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    },
    'k': () => {
      setSelected((s) => Math.max(s - 1, 0))
    },
    'g': () => {
      setSelected(0)
    },
    'G': () => {
      setSelected(Math.max(0, filtered.length - 1))
    },
    '/': () => {
      setSearching(true)
    },
    's': () => {
      setSortIndex((i) => i + 1)
    },
    'f': cycleStackFilter,
    'a': () => {
      onOpen({ name: 'add' })
    },
    'm': () => {
      onOpen({ name: 'import' })
    },
    'D': () => {
      if (daemon.connection === 'online') setConfirmOff(true)
      else daemon.daemonOn()
    },
  }

  const serviceActions = (state: ServiceState): Record<string, () => void> => ({
    ' ': () => {
      daemon.toggle(state)
    },
    'r': () => {
      daemon.restart(state.entry.id)
    },
    'A': () => {
      daemon.setAutostart(state.entry.id, !state.entry.autostart)
    },
    'e': () => {
      onOpen({ name: 'add', edit: state.entry })
    },
    'x': () => {
      setConfirmDelete(state)
    },
    'l': () => {
      onOpen({ name: 'logs', id: state.entry.id })
    },
    'i': () => {
      onOpen({ name: 'detail', id: state.entry.id })
    },
  })

  useInput(
    (input, key) => {
      if (handleModalKeys(input, key)) return
      if (key.downArrow) globalActions['j']?.()
      else if (key.upArrow) globalActions['k']?.()
      else if (key.return && current !== undefined) daemon.toggle(current)
      else if (globalActions[input]) globalActions[input]?.()
      else if (current !== undefined) serviceActions(current)[input]?.()
    },
    { isActive: active },
  )

  return (
    <Box flexDirection="column" height={rows}>
      <Header
        connection={daemon.connection}
        shuttingDown={daemon.shuttingDown}
        services={daemon.services}
        version={daemon.daemon?.version}
      />
      <Box paddingX={1}>
        <Text color={theme.dim}>
          {stackFilter === undefined ? 'All stacks' : `stack: ${stackFilter}`} · sort:{' '}
          {SORTS[sortIndex % SORTS.length]}
          {searching || search !== '' ? ' · /' : ''}
        </Text>
        {searching || search !== '' ? (
          <TextInput
            value={search}
            onChange={setSearch}
            active={searching}
            onSubmit={() => {
              setSearching(false)
            }}
          />
        ) : null}
      </Box>
      <Box height={1} />
      <ServiceTable
        services={filtered}
        selected={clampedSelection}
        offset={offset}
        height={tableHeight}
        width={width}
        frame={frame}
        online={daemon.connection === 'online'}
      />
      <Box flexGrow={1} />
      {confirmOff ? (
        <Box paddingX={1} borderStyle="round" borderColor={theme.warn}>
          <Text color={theme.warn}>
            switch the daemon off? services stop in reverse dependency order. [y]es [n]o
          </Text>
        </Box>
      ) : confirmDelete !== undefined ? (
        <Box paddingX={1} borderStyle="round" borderColor={theme.error}>
          <Text color={theme.error}>
            {confirmDelete.entry.stack === undefined
              ? `delete service "${confirmDelete.entry.id}"? it will be stopped and removed from the registry. [y]es [n]o`
              : `"${confirmDelete.entry.id}" belongs to stack "${confirmDelete.entry.stack}" — delete the whole stack and stop its services? [y]es [n]o`}
          </Text>
        </Box>
      ) : daemon.notice !== undefined ? (
        <Box paddingX={1}>
          <Text color={theme.error}>{daemon.notice}</Text>
        </Box>
      ) : null}
      <Box paddingX={1}>
        <Text color={theme.dim}>
          {daemon.connection === 'offline'
            ? 'daemon is off — registry shown read-only · [D] switch on · [q]uit'
            : '[space] toggle · [r]estart · [e]dit · [x] delete · [l]ogs · [i]nfo · [a]dd · i[m]port · [/] search · [f]ilter · [s]ort · [A]utostart · [D]aemon · [q]uit'}
        </Text>
      </Box>
    </Box>
  )
}
