import { Box, Text, useInput } from 'ink'
import React, { useMemo, useState } from 'react'

import type { ServiceState } from '../../shared/types/protocol'
import type { DaemonHook } from '../use-daemon'

import { theme } from '../theme'
import { Header } from './header'
import { ServiceTable } from './service-table'
import { TextInput } from './text-input'

export type View =
  | { name: 'dashboard' }
  | { name: 'logs'; id: string }
  | { name: 'detail'; id: string }
  | { name: 'add' }
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

  const tableHeight = Math.max(3, rows - 6)
  const clampedSelection = Math.min(selected, Math.max(0, filtered.length - 1))
  const offset = Math.max(
    0,
    Math.min(clampedSelection - tableHeight + 2, filtered.length - tableHeight),
  )
  const current: ServiceState | undefined = filtered[clampedSelection]

  useInput(
    (input, key) => {
      if (confirmOff) {
        if (input === 'y') {
          daemon.daemonOff()
          setConfirmOff(false)
        } else if (input === 'n' || key.escape) setConfirmOff(false)
        return
      }
      if (searching) {
        if (key.escape) {
          setSearch('')
          setSearching(false)
        } else if (key.return) setSearching(false)
        return
      }

      if (input === 'q') onQuit()
      else if (input === 'j' || key.downArrow)
        setSelected((s) => Math.min(s + 1, filtered.length - 1))
      else if (input === 'k' || key.upArrow) setSelected((s) => Math.max(s - 1, 0))
      else if (input === 'g') setSelected(0)
      else if (input === 'G') setSelected(Math.max(0, filtered.length - 1))
      else if (input === '/') setSearching(true)
      else if (input === 's') setSortIndex((i) => i + 1)
      else if (input === 'f') {
        setStackFilter((f) => {
          const index = f === undefined ? -1 : stacks.indexOf(f)
          return index + 1 >= stacks.length ? undefined : stacks[index + 1]
        })
      } else if (input === 'D') {
        if (daemon.connection === 'online') setConfirmOff(true)
        else daemon.daemonOn()
      } else if (input === 'a') onOpen({ name: 'add' })
      else if (input === 'm') onOpen({ name: 'import' })
      else if (current !== undefined) {
        if (input === ' ' || key.return) daemon.toggle(current)
        else if (input === 'r') daemon.restart(current.entry.id)
        else if (input === '+')
          daemon.scale(current.entry.id, (current.entry.config.replicas ?? 1) + 1)
        else if (input === '-')
          daemon.scale(current.entry.id, Math.max(1, (current.entry.config.replicas ?? 1) - 1))
        else if (input === 'A') daemon.setAutostart(current.entry.id, !current.entry.autostart)
        else if (input === 'l') onOpen({ name: 'logs', id: current.entry.id })
        else if (input === 'i') onOpen({ name: 'detail', id: current.entry.id })
      }
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
          {stackFilter === undefined ? 'all stacks' : `stack: ${stackFilter}`} · sort:{' '}
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
      ) : daemon.notice !== undefined ? (
        <Box paddingX={1}>
          <Text color={theme.error}>{daemon.notice}</Text>
        </Box>
      ) : null}
      <Box paddingX={1}>
        <Text color={theme.dim}>
          {daemon.connection === 'offline'
            ? 'daemon is off — registry shown read-only · [D] switch on · [q]uit'
            : '[space] toggle · [r]estart · [+/-] scale · [l]ogs · [i]nfo · [a]dd · i[m]port · [/] search · [f]ilter · [s]ort · [A]utostart · [D]aemon · [q]uit'}
        </Text>
      </Box>
    </Box>
  )
}
