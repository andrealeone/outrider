import { Client } from '@/shared/client'
import { plural } from '@/shared/utils/format'

/** Shared body of the `start` and `stop` commands: resolve names and toggle. */
export const runUpDown = async (direction: 'start' | 'stop', args: string[]): Promise<void> => {
  if (args.length === 0) {
    console.error(`Usage: outrider ${direction} <name|stack|namespace|tag>…`)
    process.exit(1)
  }
  const client = new Client()
  if (!(await client.ping().catch(() => false))) {
    console.error('Outrider daemon is not running; start it with "outrider on"')
    process.exit(1)
  }
  try {
    const states =
      direction === 'start' ? await client.up({ names: args }) : await client.down({ names: args })
    const verb = direction === 'start' ? 'started' : 'stopped'
    console.log(`${verb} ${plural(states.length, 'service')}`)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  }
}
