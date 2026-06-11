import { Box, Text, useInput } from 'ink'
import React, { useEffect, useRef, useState } from 'react'

import type { LogLine } from '../../shared/types/protocol'
import type { DaemonHook } from '../use-daemon'

import { theme } from '../theme'
import { TextInput } from './text-input'

interface Props {
  daemon: DaemonHook
  id: string
  rows: number
  width: number
  active: boolean
  onBack: () => void
}

const BUFFER_LINES = 2000
const FLUSH_MS = 100

const compileSearch = (pattern: string): RegExp | undefined => {
  if (pattern === '') return undefined
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return undefined
  }
}

/** Live log pane: follow mode, regex search with highlighting, wrap toggle. */
export const LogsView = ({ daemon, id, rows, width, active, onBack }: Props) => {
  const [lines, setLines] = useState<LogLine[]>([])
  const [follow, setFollow] = useState(true)
  const [wrap, setWrap] = useState(false)
  const [scroll, setScroll] = useState(0)
  const [search, setSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const pending = useRef<LogLine[]>([])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const history = await daemon.fetchLogs(id, BUFFER_LINES)
      if (!cancelled) setLines(history)
    })()
    const unsubscribe = daemon.onLog((line) => {
      if (line.service === id) pending.current.push(line)
    })
    // Log traffic batches to frame boundaries instead of rendering per line.
    const flusher = setInterval(() => {
      if (pending.current.length === 0) return
      const batch = pending.current
      pending.current = []
      setLines((prev) => [...prev, ...batch].slice(-BUFFER_LINES))
    }, FLUSH_MS)
    return () => {
      cancelled = true
      unsubscribe()
      clearInterval(flusher)
    }
  }, [daemon, id])

  const regex = compileSearch(search)
  const matched = regex === undefined ? lines : lines.filter((l) => regex.test(l.line))
  const viewHeight = rows - 4
  const maxScroll = Math.max(0, matched.length - viewHeight)
  const position = follow ? maxScroll : Math.min(scroll, maxScroll)
  const visible = matched.slice(position, position + viewHeight)

  useInput(
    (input, key) => {
      if (searching) {
        if (key.escape) {
          setSearch('')
          setSearching(false)
        } else if (key.return) setSearching(false)
        return
      }
      if (input === 'q' || key.escape) onBack()
      else if (input === 'f') setFollow((f) => !f)
      else if (input === 'w') setWrap((w) => !w)
      else if (input === '/') setSearching(true)
      else if (input === 'j' || key.downArrow) {
        setFollow(false)
        setScroll(Math.min(position + 1, maxScroll))
      } else if (input === 'k' || key.upArrow) {
        setFollow(false)
        setScroll(Math.max(position - 1, 0))
      } else if (input === 'g') {
        setFollow(false)
        setScroll(0)
      } else if (input === 'G') setFollow(true)
    },
    { isActive: active },
  )

  return (
    <Box flexDirection="column" height={rows} paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color={theme.accent}>
          Logs · {id}
        </Text>
        <Text color={theme.dim}>
          {follow ? 'following' : `line ${position + 1}/${matched.length}`}
          {regex !== undefined ? ` · /${search}/` : ''}
        </Text>
      </Box>
      {searching ? (
        <Box>
          <Text color={theme.accent}>/</Text>
          <TextInput
            value={search}
            onChange={setSearch}
            active
            onSubmit={() => {
              setSearching(false)
            }}
          />
        </Box>
      ) : null}
      <Box flexDirection="column" flexGrow={1}>
        {visible.map((line, i) => {
          const text = wrap ? line.line : line.line.slice(0, width - 14)
          const highlighted =
            regex !== undefined && regex.test(line.line) ? (
              <Text color={theme.warn}>{text}</Text>
            ) : (
              <Text>{text}</Text>
            )
          return (
            <Text key={position + i} wrap={wrap ? 'wrap' : 'truncate'}>
              <Text color={theme.dim}>{line.ts.slice(11, 19)} </Text>
              <Text
                color={
                  line.stream === 'stderr'
                    ? theme.error
                    : line.stream === 'system'
                      ? theme.info
                      : theme.dim
                }
              >
                {line.stream === 'stdout' ? '│' : line.stream === 'stderr' ? '┃' : '∙'}{' '}
              </Text>
              {highlighted}
            </Text>
          )
        })}
        {matched.length === 0 ? <Text color={theme.dim}>no log lines yet</Text> : null}
      </Box>
      <Text color={theme.dim}>
        [f]ollow · [w]rap · [/] regex · [j/k] scroll · [G] tail · [q] back
      </Text>
    </Box>
  )
}
