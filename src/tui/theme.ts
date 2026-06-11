import type { ProcessStatus } from '../shared/types/protocol'

export interface Theme {
  /** Pastel green: titles, selection, the running state. */
  accent: string
  ok: string
  warn: string
  error: string
  info: string
  dim: string
}

// Mid-lightness pastels chosen to stay legible on both light and dark
// backgrounds. Text cells carry no colour at all (terminal default) and
// nothing paints a background, so the dashboard adapts to any terminal.
const palette: Theme = {
  accent: '#8fce87',
  ok: '#8fce87',
  warn: '#d8b465',
  error: '#e08e8e',
  info: '#7da6d9',
  dim: 'gray',
}

// A slightly deeper variant for light backgrounds, opt-in via OUTRIDER_THEME.
const light: Theme = {
  accent: '#4e9a4e',
  ok: '#4e9a4e',
  warn: '#a5812e',
  error: '#c4595e',
  info: '#4f7cb8',
  dim: 'gray',
}

export const theme: Theme = process.env.OUTRIDER_THEME === 'light' ? light : palette

export const statusColor = (status: ProcessStatus): string =>
  ({
    pending: theme.dim,
    launching: theme.warn,
    running: theme.ok,
    completed: theme.info,
    skipped: theme.dim,
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
