import type {
  ConfigWarning,
  PortlessExtension,
  ProbeConfig,
  ProcessConfig,
  ProjectConfig,
} from '../../shared/types/process-compose'

import { DependencyCycleError, startOrder } from './dag'

const PROJECT_KEYS = new Set([
  'version',
  'name',
  'log_location',
  'log_level',
  'log_length',
  'log_configuration',
  'is_strict',
  'is_tui_disabled',
  'is_dotenv_disabled',
  'disable_env_expansion',
  'shell',
  'environment',
  'env_cmds',
  'vars',
  'is_template_disabled',
  'ordered_shutdown',
  'processes',
])

const PROCESS_KEYS = new Set([
  'command',
  'entrypoint',
  'working_dir',
  'description',
  'namespace',
  'environment',
  'env_file',
  'env_cmds',
  'is_dotenv_disabled',
  'disable_env_expansion',
  'depends_on',
  'readiness_probe',
  'liveness_probe',
  'ready_log_line',
  'availability',
  'shutdown',
  'disabled',
  'is_daemon',
  'launch_timeout_seconds',
  'is_tty',
  'is_foreground',
  'is_elevated',
  'replicas',
  'log_location',
  'log_configuration',
  'loggerConfig',
  'vars',
  'is_template_disabled',
  'ordered_shutdown',
])

const CONDITIONS = new Set([
  'process_started',
  'process_completed',
  'process_completed_successfully',
  'process_healthy',
  'process_log_ready',
])

const RESTART_POLICIES = new Set(['no', 'on_failure', 'always', 'exit_on_failure'])

// Features that parse but do not execute, each with its roadmap status.
const DEFERRED_PROCESS_KEYS: Record<string, string> = {
  is_tty: 'interactive TTY processes are deferred; the process runs without a pseudo-terminal',
  is_foreground: 'foreground processes are deferred; the process is managed like any other',
  env_cmds: 'env_cmds dynamic variables are deferred; the listed variables are not populated',
}

const ROUTE_LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/
const PORTLESS_RESERVED = new Set([
  'run',
  'proxy',
  'alias',
  'list',
  'clean',
  'trust',
  'service',
  'prune',
  'status',
  'config',
])

export interface ValidationResult {
  errors: string[]
  warnings: ConfigWarning[]
  /** Resolved start levels, present when the DAG is valid. */
  startOrder?: string[][]
}

const validateProbe = (name: string, kind: string, probe: ProbeConfig, errors: string[]): void => {
  const modes = [probe.exec, probe.http_get].filter((m) => m !== undefined).length
  if (modes !== 1) {
    errors.push(`process "${name}": ${kind} must define exactly one of exec or http_get`)
  }
  if (probe.exec && !probe.exec.command) {
    errors.push(`process "${name}": ${kind}.exec.command is required`)
  }
}

const validateRoute = (
  name: string,
  route: PortlessExtension,
  claims: Map<string, string>,
  errors: string[],
): void => {
  if (!route.route) {
    errors.push(`process "${name}": x-portless.route is required`)
    return
  }
  if (!ROUTE_LABEL.test(route.route)) {
    errors.push(
      `process "${name}": x-portless.route "${route.route}" must be a lowercase DNS label (letters, digits, dashes)`,
    )
  }
  if (PORTLESS_RESERVED.has(route.route)) {
    errors.push(
      `process "${name}": x-portless.route "${route.route}" collides with a reserved portless subcommand name`,
    )
  }
  const claimant = claims.get(route.route)
  if (claimant !== undefined) {
    errors.push(
      `route "${route.route}" is claimed by both "${claimant}" and "${name}"; route names must be unique`,
    )
  } else {
    claims.set(route.route, name)
  }
  if (route.port !== undefined && (!Number.isInteger(route.port) || route.port < 1)) {
    errors.push(`process "${name}": x-portless.port must be a positive integer`)
  }
}

const validateProcess = (
  name: string,
  proc: ProcessConfig,
  config: ProjectConfig,
  strict: boolean,
  result: ValidationResult,
  routeClaims: Map<string, string>,
): void => {
  const { errors, warnings } = result
  const warn = (code: string, message: string): void => {
    warnings.push({ code, message, process: name })
  }

  for (const key of Object.keys(proc)) {
    if (PROCESS_KEYS.has(key) || key.startsWith('x-')) continue
    if (strict) errors.push(`process "${name}": unknown key "${key}" (strict mode)`)
    else warn('unknown-key', `process "${name}": unknown key "${key}" was ignored`)
  }

  if (!proc.command && !proc.entrypoint?.length && !proc.disabled) {
    errors.push(`process "${name}": command or entrypoint is required`)
  }

  for (const [dep, depConfig] of Object.entries(proc.depends_on ?? {})) {
    const condition = depConfig?.condition ?? 'process_started'
    if (!CONDITIONS.has(condition)) {
      errors.push(`process "${name}": depends_on.${dep} has unknown condition "${condition}"`)
    }
    if (!(dep in config.processes)) {
      const replicaInstance = /^(.+)-\d+$/.exec(dep)
      if (replicaInstance && (replicaInstance[1] as string) in config.processes) {
        warn(
          'deferred-feature',
          `process "${name}": per-instance replica dependency "${dep}" is deferred; depend on "${replicaInstance[1]}" to wait for the whole group`,
        )
      } else {
        errors.push(`process "${name}": depends_on references unknown process "${dep}"`)
      }
    }
  }

  if (proc.readiness_probe && proc.ready_log_line) {
    errors.push(
      `process "${name}": ready_log_line and readiness_probe are mutually exclusive upstream; keep one`,
    )
  }
  if (proc.readiness_probe) validateProbe(name, 'readiness_probe', proc.readiness_probe, errors)
  if (proc.liveness_probe) validateProbe(name, 'liveness_probe', proc.liveness_probe, errors)

  const availability = proc.availability
  if (availability?.restart !== undefined && !RESTART_POLICIES.has(availability.restart)) {
    errors.push(
      `process "${name}": availability.restart must be one of ${[...RESTART_POLICIES].join(', ')}`,
    )
  }
  if (availability?.exit_on_end || availability?.exit_on_skipped) {
    warn(
      'persistent-mode',
      `process "${name}": exit_on_end/exit_on_skipped apply to ephemeral runs only; the system-wide daemon never exits with a process, so they are ignored in persistent mode`,
    )
  }
  if (availability?.restart === 'exit_on_failure') {
    warn(
      'persistent-mode',
      `process "${name}": restart policy exit_on_failure terminates ephemeral runs only; in persistent mode the process is treated as restart "no"`,
    )
  }

  if (proc.replicas !== undefined && (!Number.isInteger(proc.replicas) || proc.replicas < 0)) {
    errors.push(`process "${name}": replicas must be a non-negative integer`)
  }

  if (proc.is_elevated) {
    warn(
      'cut-feature',
      `process "${name}": is_elevated was cut; write sudo into the command instead`,
    )
  }
  for (const [key, note] of Object.entries(DEFERRED_PROCESS_KEYS)) {
    if (proc[key as keyof ProcessConfig] !== undefined) {
      warn('deferred-feature', `process "${name}": ${note}`)
    }
  }
  if (proc.readiness_probe?.success_threshold !== undefined) {
    warn(
      'upstream-placeholder',
      `process "${name}": success_threshold is a placeholder upstream and is not evaluated; documented for honesty`,
    )
  }

  const route = proc['x-portless']
  if (route !== undefined) validateRoute(name, route, routeClaims, errors)
}

/** Validate a merged project config; called at import time, never at runtime. */
export const validateProject = (config: ProjectConfig): ValidationResult => {
  const result: ValidationResult = { errors: [], warnings: [] }
  const strict = config.is_strict === true

  if (typeof config.processes !== 'object' || config.processes === null) {
    result.errors.push('config has no processes map')
    return result
  }

  for (const key of Object.keys(config)) {
    if (PROJECT_KEYS.has(key) || key.startsWith('x-')) continue
    if (strict) result.errors.push(`unknown project key "${key}" (strict mode)`)
    else
      result.warnings.push({
        code: 'unknown-key',
        message: `unknown project key "${key}" was ignored`,
      })
  }

  const routeClaims = new Map<string, string>()
  for (const [name, proc] of Object.entries(config.processes)) {
    validateProcess(name, proc ?? {}, config, strict, result, routeClaims)
  }

  try {
    result.startOrder = startOrder(config.processes)
  } catch (err) {
    if (err instanceof DependencyCycleError) result.errors.push(err.message)
    else throw err
  }

  return result
}
