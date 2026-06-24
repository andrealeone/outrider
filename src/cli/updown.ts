import { Client } from '@/shared/client'
import { fail, reply } from '@/cli/output'
import { plural } from '@/shared/utils/format'

/** Shared body of the `start` and `stop` commands: resolve names and toggle. */
export const runUpDown = async (direction: 'start' | 'stop', args: string[]): Promise<void> => {
  if (args.length === 0) {
    fail(`Usage: outrider ${direction} <name|stack|namespace|tag>…`)
    return
  }
  const client = new Client()
  if (!(await client.ping().catch(() => false))) {
    fail('Outrider daemon is not running; start it with `outrider on`')
    return
  }
  try {
    const states =
      direction === 'start' ? await client.up({ names: args }) : await client.down({ names: args })
    const verb = direction === 'start' ? 'Started' : 'Stopped'
    reply(`${verb} ${plural(states.length, 'service')}`)
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err))
  }
}
