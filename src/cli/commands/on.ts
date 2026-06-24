import { Client, ProtocolMismatchError } from '@/shared/client'
import { fail, reply } from '@/cli/output'
import { plural } from '@/shared/utils/format'
import { socketPath } from '@/shared/utils/paths'
import { waitFor } from '@/shared/utils/time'
import { installUnit, startUnit } from '@/shared/service-unit'

export const description = 'start the daemon and enable it at boot'

export const run = async (): Promise<void> => {
  const client = new Client()
  try {
    if (await client.ping()) {
      reply(`Outrider daemon is already running (socket: ${socketPath})`)
      return
    }
  } catch (err) {
    if (err instanceof ProtocolMismatchError) {
      fail(`A stale daemon is running: ${err.message}`)
      return
    }
    throw err
  }

  installUnit()
  startUnit()

  const up = await waitFor(() => client.ping().catch(() => false), 10_000, 200)
  if (!up) {
    fail('Outrider daemon did not start within 10s; check the daemon log')
    return
  }
  const { services } = await client.state()
  const resumed = services.filter((s) => s.entry.desired === 'up' && s.entry.autostart).length
  reply(
    `Outrider daemon on — ${plural(services.length, 'service')} registered, ${resumed} autostarting`,
  )
}
