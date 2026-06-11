// Types mirroring the process-compose YAML schema (upstream v1.110.0).
// Every recognised key is typed even when outrider does not execute it yet;
// the config validator emits named warnings for parsed-but-unsupported keys.

export type RestartPolicy = 'no' | 'on_failure' | 'always' | 'exit_on_failure'

export type DependencyCondition =
  | 'process_started'
  | 'process_completed'
  | 'process_completed_successfully'
  | 'process_healthy'
  | 'process_log_ready'

export interface DependencyConfig {
  condition?: DependencyCondition
}

export interface ExecProbeConfig {
  command?: string
  working_dir?: string
}

export interface HttpGetProbeConfig {
  host?: string
  path?: string
  scheme?: string
  port?: number | string
  headers?: Record<string, string>
  status_code?: number
}

export interface ProbeConfig {
  exec?: ExecProbeConfig
  http_get?: HttpGetProbeConfig
  initial_delay_seconds?: number
  period_seconds?: number
  timeout_seconds?: number
  success_threshold?: number
  failure_threshold?: number
}

export interface AvailabilityConfig {
  restart?: RestartPolicy
  backoff_seconds?: number
  max_restarts?: number
  exit_on_end?: boolean
  exit_on_skipped?: boolean
}

export interface ShutdownConfig {
  command?: string
  signal?: number
  timeout_seconds?: number
  parent_only?: boolean
}

export interface LoggerConfig {
  rotation?: {
    max_size_mb?: number
    max_backups?: number
    max_age_days?: number
    compress?: boolean
    directory?: string
    filename?: string
  }
  flush_each_line?: boolean
  no_color?: boolean
  add_timestamp?: boolean
  timestamp_format?: string
  disable_json?: boolean
  fields_order?: string[]
  no_metadata?: boolean
}

/** The x-portless extension block: opt-in named routing for one process. */
export interface PortlessExtension {
  route: string
  framework?: string
  port?: number
  /**
   * Register a static portless alias instead of a managed route. External
   * tools that bind a fixed port and ignore the injected PORT (e.g. kubectl
   * port-forward, tsh proxy) are routed this way: the alias points at `port`
   * directly. Aliases use pid 0 and survive portless's stale-route cleanup,
   * so the daemon clears them explicitly on shutdown and boot.
   */
  alias?: boolean
}

export interface ProcessConfig {
  'command'?: string
  'entrypoint'?: string[]
  'working_dir'?: string
  'description'?: string
  'namespace'?: string
  'environment'?: string[]
  'env_file'?: string | string[]
  'env_cmds'?: Record<string, string>
  'is_dotenv_disabled'?: boolean
  'disable_env_expansion'?: boolean
  'depends_on'?: Record<string, DependencyConfig>
  'readiness_probe'?: ProbeConfig
  'liveness_probe'?: ProbeConfig
  'ready_log_line'?: string
  'availability'?: AvailabilityConfig
  'shutdown'?: ShutdownConfig
  'disabled'?: boolean
  'is_daemon'?: boolean
  'launch_timeout_seconds'?: number
  'is_tty'?: boolean
  'is_foreground'?: boolean
  'is_elevated'?: boolean
  'replicas'?: number
  'log_location'?: string
  'log_configuration'?: LoggerConfig
  'loggerConfig'?: LoggerConfig
  'vars'?: Record<string, unknown>
  'is_template_disabled'?: boolean
  'ordered_shutdown'?: boolean
  'x-portless'?: PortlessExtension
  [extension: `x-${string}`]: unknown
}

export interface ShellConfig {
  shell_command?: string
  shell_argument?: string
}

export interface ProjectConfig {
  version?: string
  name?: string
  log_location?: string
  log_level?: string
  log_length?: number
  log_configuration?: LoggerConfig
  is_strict?: boolean
  is_tui_disabled?: boolean
  is_dotenv_disabled?: boolean
  disable_env_expansion?: boolean
  shell?: ShellConfig
  environment?: string[]
  env_cmds?: Record<string, string>
  vars?: Record<string, unknown>
  is_template_disabled?: boolean
  ordered_shutdown?: boolean
  processes: Record<string, ProcessConfig>
  [extension: `x-${string}`]: unknown
}

/** A single warning produced while loading a config file. */
export interface ConfigWarning {
  /** Stable identifier, e.g. "unsupported-feature" or "deferred-feature". */
  code: string
  message: string
  process?: string
}

export interface LoadedProject {
  config: ProjectConfig
  /** Files that contributed to the merged result, in merge order. */
  sources: string[]
  warnings: ConfigWarning[]
}
