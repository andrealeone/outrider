// Portless's run wrapper injects --port flags for frameworks that ignore the
// PORT environment variable. Outrider owns spawning, so that duty transfers
// here: the same small quirk table, applied to routed services only.

const PORT_FLAG_FRAMEWORKS = [
  'vite',
  'viteplus',
  'astro',
  'expo',
  'react-router',
  'react-native',
  'angular',
] as const

const AUTO_DETECT: Record<string, RegExp> = {
  'vite': /\bvite\b/,
  'astro': /\bastro\s+(dev|preview)\b/,
  'expo': /\bexpo\s+start\b/,
  'react-router': /\breact-router\s+dev\b/,
  'angular': /\bng\s+serve\b/,
}

const PACKAGE_MANAGER_RUN = /^\s*(npm|pnpm|yarn|bun)\s+(run\s+)?\S+/

const detect = (command: string): string | undefined =>
  Object.keys(AUTO_DETECT).find((name) => (AUTO_DETECT[name] as RegExp).test(command))

/**
 * Append the --port flag for frameworks that ignore an injected PORT.
 * `framework` comes from x-portless (default "auto" sniffs the command,
 * "none" disables injection, anything else is an explicit table hint).
 */
export const applyFrameworkQuirks = (
  command: string,
  framework: string | undefined,
  port: number | string,
): string => {
  const hint = framework ?? 'auto'
  if (hint === 'none') return command
  const name = hint === 'auto' ? detect(command) : hint
  if (name === undefined || !(PORT_FLAG_FRAMEWORKS as readonly string[]).includes(name)) {
    return command
  }
  // Package-manager script runs need the args separator to reach the tool.
  const separator = PACKAGE_MANAGER_RUN.test(command) && !command.includes(' -- ') ? ' --' : ''
  return `${command}${separator} --port ${port}`
}
