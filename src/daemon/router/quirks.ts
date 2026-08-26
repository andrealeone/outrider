// Some dev-server frameworks ignore the injected PORT environment variable
// and need an explicit --port flag instead. This table covers the common
// ones, applied to routed services only. Host flags bind IPv4 so the proxy
// (which dials 127.0.0.1) can reach them; Expo's --host is a connection
// mode, not a bind address, so it gets `localhost` rather than an IP.

const FRAMEWORKS = {
  'vite': { strictPort: true, host: '127.0.0.1' },
  'viteplus': { strictPort: true, host: '127.0.0.1' },
  'react-router': { strictPort: true, host: '127.0.0.1' },
  'astro': { strictPort: false, host: '127.0.0.1' },
  'angular': { strictPort: false, host: '127.0.0.1' },
  'react-native': { strictPort: false, host: '127.0.0.1' },
  'expo': { strictPort: false, host: 'localhost' },
} as const

type FrameworkName = keyof typeof FRAMEWORKS

const AUTO_DETECT: Record<FrameworkName, RegExp> = {
  'vite': /\bvite\b/,
  'viteplus': /\b(viteplus|vp)\b/,
  'react-router': /\breact-router\s+dev\b/,
  'astro': /\bastro\s+(dev|preview)\b/,
  'angular': /\bng\s+serve\b/,
  'react-native': /\breact-native\s+start\b/,
  'expo': /\bexpo\s+start\b/,
}

const PACKAGE_MANAGER_RUN = /^\s*(npm|pnpm|yarn|bun)\s+(run\s+)?\S+/

const detect = (command: string): FrameworkName | undefined =>
  (Object.keys(AUTO_DETECT) as FrameworkName[]).find((name) => AUTO_DETECT[name].test(command))

const hasFlag = (command: string, flag: string): boolean =>
  new RegExp(`(?:^|\\s)${flag}(?:\\s|=|$)`).test(command)

/**
 * Append --port / --host / --strictPort for frameworks that ignore an injected PORT.
 * `framework` comes from x-route (default "auto" sniffs the command,
 * "none" disables injection, anything else is an explicit table hint).
 * Flags already present in the command are left alone.
 */
export const applyFrameworkQuirks = (
  command: string,
  framework: string | undefined,
  port: number | string,
): string => {
  const hint = framework ?? 'auto'
  if (hint === 'none') return command

  const name = hint === 'auto' ? detect(command) : hint
  if (name === undefined || !(name in FRAMEWORKS)) return command

  const spec = FRAMEWORKS[name as FrameworkName],
    flags: string[] = []

  if (!hasFlag(command, '--port')) {
    flags.push(`--port ${port}`)

    if (spec.strictPort) flags.push('--strictPort')
  }

  if (!hasFlag(command, '--host')) flags.push(`--host ${spec.host}`)
  if (flags.length === 0) return command

  const separator = PACKAGE_MANAGER_RUN.test(command) && !command.includes(' -- ') ? ' --' : ''

  return `${command}${separator} ${flags.join(' ')}`
}
