import type { ProcessStatus } from '../shared/types/protocol'

export interface Theme {
  accent: string
  dim: string
  text: string
  selection: string
  ok: string
  warn: string
  error: string
  info: string
  route: string
}

const dark: Theme = {
  accent: 'cyan',
  dim: 'gray',
  text: 'white',
  selection: 'cyan',
  ok: 'green',
  warn: 'yellow',
  error: 'red',
  info: 'blue',
  route: 'magenta',
}

const light: Theme = { ...dark, text: 'black', dim: 'gray', selection: 'blue', accent: 'blue' }

export const theme: Theme = process.env.OUTRIDER_THEME === 'light' ? light : dark

export const statusColor = (status: ProcessStatus): string =>
  ({
    pending: theme.dim,
    launching: theme.warn,
    running: theme.ok,
    completed: theme.info,
    skipped: theme.route,
    error: theme.error,
    terminating: theme.warn,
    restarting: theme.warn,
  })[status]

export const statusGlyph = (status: ProcessStatus): string =>
  ({
    pending: '○',
    launching: '◐',
    running: '●',
    completed: '✓',
    skipped: '⊘',
    error: '✗',
    terminating: '◑',
    restarting: '↻',
  })[status]

export const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Statuses that animate with the spinner instead of a static glyph. */
export const TRANSIENT_STATUSES = new Set<ProcessStatus>(['launching', 'terminating', 'restarting'])
