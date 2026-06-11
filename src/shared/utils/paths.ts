import { homedir } from 'node:os'
import { join } from 'node:path'

// XDG conventions everywhere, macOS included, for predictability.
const home = homedir()
const env = process.env

export const configDir = join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'outrider')
export const dataDir = join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'outrider')
export const cacheDir = join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'outrider')
export const runtimeDir = env.XDG_RUNTIME_DIR ?? cacheDir

export const configPath = join(configDir, 'config.yaml')
export const registryPath = join(dataDir, 'registry.json')
export const journalPath = join(dataDir, 'journal.jsonl')
export const logsDir = join(dataDir, 'logs')
export const socketPath = join(runtimeDir, 'outrider.sock')
export const lockPath = join(runtimeDir, 'outrider.lock')
export const daemonLogPath = join(dataDir, 'daemon.log')

export const serviceLogDir = (serviceId: string): string =>
  join(logsDir, serviceId.replaceAll('/', '__'))
