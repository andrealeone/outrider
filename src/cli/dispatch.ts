import { APP_VERSION } from '@/shared/version'
import { fail, reply } from '@/cli/output'
import { commands } from '@/cli/manifest'

const usage = (): string => {
  const visible = Object.entries(commands).filter(([, mod]) => !mod.hidden && mod.description),
    width = Math.max(...visible.map(([name]) => name.length), 8),
    lines = visible
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, mod]) => `  outrider ${(name || '').padEnd(width)}  ${mod.description}`)

  return `outrider ${APP_VERSION} — system-wide service orchestrator\n\n${lines.join('\n')}\n`
}

/** Longest-prefix match of argv words against the command manifest. */
export const dispatch = async (argv: string[]): Promise<void> => {
  if (argv[0] === '--version' || argv[0] === '-v') {
    reply(APP_VERSION)
    return
  }

  if (argv[0] === '--help' || argv[0] === '-h' || argv[0] === 'help') {
    reply(usage())
    return
  }

  for (let take = argv.length; take >= 0; take--) {
    const name = argv.slice(0, take).join(' '),
      mod = commands[name]

    if (mod && (take > 0 || argv.length === 0)) {
      await mod.run(argv.slice(take))
      return
    }
  }

  fail(`Unknown command: ${argv.join(' ')}\n\n${usage()}`)
}
