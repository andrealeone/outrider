import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import type { LoggerConfig } from '../shared/types/process-compose'
import type { LogLine } from '../shared/types/protocol'

import type { EventBus } from './event-bus'

import { serviceLogDir } from '../shared/utils/paths'
import { RingBuffer } from '../shared/utils/ring-buffer'
import { nowIso } from '../shared/utils/time'

const RING_CAPACITY = 1000
const DEFAULT_MAX_SIZE_MB = 10
const DEFAULT_MAX_BACKUPS = 3

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g')

interface ServiceSink {
  ring: RingBuffer<LogLine>
  dir: string
  file: string
  config: LoggerConfig
  /** Callbacks waiting for a ready_log_line match. */
  watchers: Map<string, { pattern: RegExp; onMatch: () => void }>
}

/**
 * Two sinks per service: a rotating file honouring the upstream caps, and a
 * bounded ring buffer feeding the TUI and the logs endpoint via the bus.
 */
export class Logger {
  private readonly sinks = new Map<string, ServiceSink>()

  constructor(private readonly bus: EventBus) {}

  open(serviceId: string, config: LoggerConfig = {}): void {
    if (this.sinks.has(serviceId)) return
    const dir = serviceLogDir(serviceId)
    mkdirSync(dir, { recursive: true })
    this.sinks.set(serviceId, {
      ring: new RingBuffer<LogLine>(RING_CAPACITY),
      dir,
      file: join(dir, 'current.log'),
      config,
      watchers: new Map(),
    })
  }

  write(serviceId: string, instance: string, stream: LogLine['stream'], rawLine: string): void {
    const sink = this.sinks.get(serviceId)
    if (!sink) return
    const line = sink.config.no_color ? rawLine.replace(ANSI, '') : rawLine
    const entry: LogLine = { service: serviceId, instance, stream, ts: nowIso(), line }

    sink.ring.push(entry)
    this.writeFile(sink, entry)
    this.bus.emit({ type: 'log', log: entry })
    for (const { pattern, onMatch } of sink.watchers.values()) {
      if (pattern.test(line)) onMatch()
    }
  }

  tail(serviceId: string, n: number): LogLine[] {
    return this.sinks.get(serviceId)?.ring.tail(n) ?? []
  }

  /** Watch for a ready_log_line match on one instance; returns a cancel fn. */
  watchReadyLine(
    serviceId: string,
    instance: string,
    pattern: string,
    onMatch: () => void,
  ): () => void {
    const sink = this.sinks.get(serviceId)
    if (!sink) return () => {}
    let regex: RegExp
    try {
      regex = new RegExp(pattern)
    } catch {
      regex = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    }
    sink.watchers.set(instance, { pattern: regex, onMatch })
    return () => {
      sink.watchers.delete(instance)
    }
  }

  private writeFile(sink: ServiceSink, entry: LogLine): void {
    const prefix = sink.config.add_timestamp === false ? '' : `${entry.ts} `
    const tag = entry.stream === 'stdout' ? '' : `[${entry.stream}] `
    try {
      this.rotateIfNeeded(sink)
      appendFileSync(sink.file, `${prefix}${tag}${entry.line}\n`)
    } catch {
      // Log persistence must never take a service down with it.
    }
  }

  private rotateIfNeeded(sink: ServiceSink): void {
    const maxBytes = (sink.config.rotation?.max_size_mb ?? DEFAULT_MAX_SIZE_MB) * 1024 * 1024
    if (!existsSync(sink.file) || statSync(sink.file).size < maxBytes) return

    const backups = sink.config.rotation?.max_backups ?? DEFAULT_MAX_BACKUPS
    const compress = sink.config.rotation?.compress === true
    const ext = compress ? '.gz' : ''
    const backup = (n: number): string => join(sink.dir, `current.log.${n}${ext}`)

    if (existsSync(backup(backups))) unlinkSync(backup(backups))
    for (let i = backups - 1; i >= 1; i--) {
      if (existsSync(backup(i))) renameSync(backup(i), backup(i + 1))
    }
    if (backups > 0) {
      if (compress) {
        writeFileSync(backup(1), Bun.gzipSync(readFileSync(sink.file)))
        unlinkSync(sink.file)
      } else {
        renameSync(sink.file, backup(1))
      }
    } else {
      unlinkSync(sink.file)
    }
  }
}
