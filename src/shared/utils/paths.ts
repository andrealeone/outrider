import { homedir } from 'node:os'
import { join } from 'node:path'

// XDG conventions everywhere, macOS included, for predictability.
const home = homedir()
const env = process.env

export const dataDir = join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'outrider')
/** Plaintext mirror of the registry, edited at scale and applied by `outrider sync`. */
export const configYmlPath = join(env.XDG_CONFIG_HOME ?? join(home, '.config'), 'outrider.yml')
/** Persisted user preferences (feature switches), managed by `outrider preferences`. */
export const preferencesPath = join(
  env.XDG_CONFIG_HOME ?? join(home, '.config'),
  'outrider-preferences.json',
)
const cacheDir = join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'outrider')
export const runtimeDir = env.XDG_RUNTIME_DIR ?? cacheDir

export const registryPath = join(dataDir, 'registry.json')
export const journalPath = join(dataDir, 'journal.jsonl')
const logsDir = join(dataDir, 'logs')
export const socketPath = join(runtimeDir, 'outrider.sock')
export const lockPath = join(runtimeDir, 'outrider.lock')
export const daemonLogPath = join(dataDir, 'daemon.log')

const certsDir = join(dataDir, 'certs')
export const caPath = join(certsDir, 'ca.pem')
export const caKeyPath = join(certsDir, 'ca-key.pem')
export const leafPath = join(certsDir, 'leaf.pem')
export const leafKeyPath = join(certsDir, 'leaf-key.pem')
export const trustMarkerPath = join(certsDir, 'trusted.flag')
/** Real system file; never XDG-relative. */
export const hostsFilePath = '/etc/hosts'

export const serviceLogDir = (serviceId: string): string =>
  join(logsDir, serviceId.replaceAll('/', '__'))
