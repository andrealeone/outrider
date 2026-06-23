import { homedir, userInfo } from 'node:os'
import { delimiter, join } from 'node:path'

/** The user's home directory, resilient to a missing/partial passwd entry. */
export const userHome = (): string => {
  try {
    return userInfo().homedir || process.env.HOME || homedir()
  } catch {
    return process.env.HOME || homedir()
  }
}

/**
 * Directories that hold user-installed tools but are routinely missing from
 * the minimal PATH a launchd agent / systemd user unit inherits. Portless and
 * other globally installed CLIs land here (e.g. ~/.bun/bin, ~/.local/bin), so
 * both spawned services and our own command lookups must consult them.
 */
export const commonPathEntries = (): string[] => {
  const home = userHome()
  return [
    join(home, '.local', 'bin'),
    join(home, 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.cargo', 'bin'),
    join(home, '.asdf', 'shims'),
    join(home, '.mise', 'shims'),
    join(home, '.local', 'share', 'mise', 'shims'),
    join(home, '.volta', 'bin'),
    join(home, '.pyenv', 'shims'),
    join(home, '.rbenv', 'shims'),
    '/opt/homebrew/bin',
    '/opt/homebrew/sbin',
    '/usr/local/bin',
    '/usr/local/sbin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin',
  ]
}

/** Prepend the common tool directories to the given PATH, de-duplicated. */
export const withCommonPath = (path: string | undefined): string =>
  [...new Set([...commonPathEntries(), ...(path ?? '').split(delimiter).filter(Boolean)])].join(
    delimiter,
  )
