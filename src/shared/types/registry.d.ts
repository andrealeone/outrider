// The desired-state model persisted in registry.json. The daemon is the only
// writer; the TUI reads it directly only in offline mode.

import type { PortlessExtension, ProcessConfig, ShellConfig } from './process-compose'

export type DesiredState = 'up' | 'down'

export interface StackEntry {
  name: string
  /** Absolute path of the primary compose file the stack was imported from. */
  sourcePath: string
  /** Hash of the merged config content, for drift detection. */
  contentHash: string
  /** All files merged into the import, in merge order. */
  sources: string[]
  importedAt: string
}

export interface ServiceEntry {
  /** Unique id: "stack/process" for stack members, plain name for standalone. */
  id: string
  /** Process name without the stack prefix. */
  name: string
  stack?: string
  namespace?: string
  desired: DesiredState
  /** Start at daemon boot. */
  autostart: boolean
  /** Free-form labels for grouping; `outrider start/stop <tag>` acts on all members. */
  tags?: string[]
  /** Fully merged and templated process configuration. */
  config: ProcessConfig
  /** Directory .env, env_file, and working_dir resolve against. */
  dir: string
  shell?: ShellConfig
  route?: PortlessExtension
}

export interface RegistryModel {
  version: 1
  stacks: Record<string, StackEntry>
  services: Record<string, ServiceEntry>
}

/** One line of journal.jsonl: an append-only daemon event record. */
export interface JournalRecord {
  ts: string
  type: 'status' | 'restart' | 'probe' | 'daemon' | 'exit'
  service?: string
  data?: Record<string, unknown>
}
