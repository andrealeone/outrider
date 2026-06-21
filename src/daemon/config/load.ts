import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, resolve } from 'node:path'

import type {
  ConfigWarning,
  LoadedProject,
  ProcessConfig,
  ProjectConfig,
} from '@/shared/types/process-compose'

import { parseDotenv, parseEnvList } from '@/shared/utils/env'
import { discoverComposeFile, discoverOverrideFile } from './discover'
import { expandEnv } from './expand'
import { mergeAll } from './merge'
import { renderTemplate } from './template'
import { validateProject } from './validate'

export class ConfigLoadError extends Error {
  constructor(
    readonly file: string,
    readonly errors: string[],
  ) {
    super(`invalid config ${file}:\n  - ${errors.join('\n  - ')}`)
  }
}

/** Apply `fn` to every string value in a config subtree, tracking the path. */
const mapStrings = (
  node: unknown,
  fn: (value: string, path: string) => string,
  path = '',
): unknown => {
  if (typeof node === 'string') return fn(node, path)
  if (Array.isArray(node)) return node.map((item, i) => mapStrings(item, fn, `${path}[${i}]`))
  if (typeof node === 'object' && node !== null) {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        mapStrings(value, fn, path === '' ? key : `${path}.${key}`),
      ]),
    )
  }
  return node
}

const parseYamlFile = (file: string): Record<string, unknown> => {
  let tree: unknown
  try {
    tree = Bun.YAML.parse(readFileSync(file, 'utf8'))
  } catch (err) {
    throw new ConfigLoadError(file, [`YAML parse error: ${(err as Error).message}`])
  }
  if (typeof tree !== 'object' || tree === null || Array.isArray(tree)) {
    throw new ConfigLoadError(file, ['top level must be a YAML mapping'])
  }
  return tree as Record<string, unknown>
}

const applyTemplating = (config: ProjectConfig, file: string): void => {
  if (config.is_template_disabled) return
  for (const [name, proc] of Object.entries(config.processes ?? {})) {
    if (!proc || proc.is_template_disabled) continue
    const vars = { ...config.vars, ...proc.vars }
    config.processes[name] = mapStrings(proc, (value, path) =>
      renderTemplate(value, vars, `${file} (${name}.${path})`),
    ) as ProcessConfig
  }
}

const applyEnvExpansion = (
  config: ProjectConfig,
  composeDir: string,
  warnings: ConfigWarning[],
): void => {
  const dotenvPath = join(composeDir, '.env')
  const dotenv =
    !config.is_dotenv_disabled && existsSync(dotenvPath)
      ? parseDotenv(readFileSync(dotenvPath, 'utf8'))
      : {}
  const context = { ...process.env, ...dotenv, ...parseEnvList(config.environment) }

  for (const [name, proc] of Object.entries(config.processes ?? {})) {
    if (!proc || config.disable_env_expansion || proc.disable_env_expansion) continue
    config.processes[name] = mapStrings(proc, (value) => {
      const { value: expanded, warnings: expandWarnings } = expandEnv(value, context)
      for (const w of expandWarnings) warnings.push({ ...w, process: name })
      return expanded
    }) as ProcessConfig
  }
}

export interface LoadOptions {
  /** Skip env expansion and .env reads; used for dry-run previews. */
  preview?: boolean
}

/**
 * Load, merge, template, expand, and validate a process-compose project.
 * `entry` is a compose file or a directory to discover one in. Throws
 * ConfigLoadError when parsing or validation fails; warnings never throw.
 */
export const loadProject = (entry: string, options: LoadOptions = {}): LoadedProject => {
  const entryPath = resolve(entry)
  if (!existsSync(entryPath)) throw new ConfigLoadError(entryPath, ['file not found'])

  const mainFile = statSync(entryPath).isDirectory() ? discoverComposeFile(entryPath) : entryPath
  if (mainFile === undefined) {
    throw new ConfigLoadError(entryPath, [
      'no compose file found (looked for compose.yml, compose.yaml, process-compose.yml, process-compose.yaml)',
    ])
  }

  const sources = [mainFile]
  const override = discoverOverrideFile(mainFile)
  if (override !== undefined) sources.push(override)

  const config = mergeAll(sources.map(parseYamlFile)) as unknown as ProjectConfig
  if (typeof config.processes !== 'object' || config.processes === null) {
    throw new ConfigLoadError(mainFile, ['config has no processes map'])
  }

  const warnings: ConfigWarning[] = []
  applyTemplating(config, mainFile)
  if (!options.preview) applyEnvExpansion(config, dirname(mainFile), warnings)

  const result = validateProject(config)
  if (result.errors.length > 0) throw new ConfigLoadError(mainFile, result.errors)
  warnings.push(...result.warnings)

  return { config, sources, warnings }
}

/** Stable content hash of a merged project, for stack drift detection. */
export const hashProject = (project: LoadedProject): string =>
  new Bun.CryptoHasher('sha256').update(JSON.stringify(project.config)).digest('hex').slice(0, 16)

/** Default stack name: config name, else the compose file's directory name. */
export const stackNameFor = (project: LoadedProject): string => {
  const main = project.sources[0] as string
  return project.config.name ?? basename(dirname(isAbsolute(main) ? main : resolve(main)))
}
