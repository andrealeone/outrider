import { Client, ProtocolMismatchError } from '@/shared/client'
import { plural } from '@/shared/utils/format'
import { socketPath } from '@/shared/utils/paths'
import { waitFor } from '@/shared/utils/time'
import { installUnit, startUnit } from '@/shared/service-unit'

export const description = 'start the daemon and enable it at boot'

export const run = async (): Promise<void> => {
  const client = new Client()
  try {
    if (await client.ping()) {
      console.log(`Outrider daemon already running (socket: ${socketPath})`)
      return
    }
  } catch (err) {
    if (err instanceof ProtocolMismatchError) {
      console.error(`A stale daemon is running: ${err.message}`)
      process.exit(1)
    }
    throw err
  }

  installUnit()
  startUnit()

  const up = await waitFor(() => client.ping().catch(() => false), 10_000, 200)
  if (!up) {
    console.error('Daemon did not come up within 10s; check the daemon log')
    process.exit(1)
  }
  const { services } = await client.state()
  const resumed = services.filter((s) => s.entry.desired === 'up' && s.entry.autostart).length
  console.log(
    `Outrider daemon on — ${plural(services.length, 'service')} registered, ${resumed} autostarting`,
  )
}
