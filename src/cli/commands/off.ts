import { existsSync } from 'node:fs'

import { Client } from '@/shared/client'
import { fail, reply } from '@/cli/output'
import { socketPath } from '@/shared/utils/paths'
import { waitFor } from '@/shared/utils/time'
import { uninstallUnit } from '@/shared/service-unit'

export const description = 'stop all services and the daemon, disable start at boot'

export const run = async (): Promise<void> => {
  const client = new Client()
  const running = await client.ping().catch(() => true)

  // Removing the unit first keeps launchd/systemd from resurrecting the
  // daemon; the unit teardown also delivers the SIGTERM that triggers the
  // reverse-order shutdown.
  uninstallUnit()

  if (running && (await client.ping().catch(() => false))) {
    await client.shutdown().catch(() => undefined)
  }
  const gone = await waitFor(
    async () => !existsSync(socketPath) || !(await client.ping().catch(() => false)),
    15_000,
    200,
  )
  if (gone) reply('Outrider daemon off')
  else fail('Outrider daemon is taking a while to stop; check the daemon log')
}
