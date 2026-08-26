import { Client, ProtocolMismatchError } from '@/shared/client'
import { fail, reply } from '@/cli/output'
import { plural } from '@/shared/utils/format'
import { socketPath } from '@/shared/utils/paths'
import { waitFor } from '@/shared/utils/time'
import { CertAuthority } from '@/daemon/router/cert-authority'
import { HostsSync } from '@/daemon/router/hosts-sync'
import { installUnit, startUnit } from '@/shared/service-unit'

export const description = 'start the daemon and enable it at boot'

/**
 * Trust enrolment and the /etc/hosts block both need root and a terminal for
 * the sudo prompt; the daemon never elevates, so this foreground command is
 * the one place they run. Safe to call every time: both operations are
 * idempotent and skip cleanly when TLS is off (the current default) or
 * nothing has drifted.
 */
const repairRouting = async (client: Client): Promise<void> => {
  const { inspection, tld, hostnames } = (await client.proxyStatus().catch(() => undefined)) ?? {}

  if (!inspection) return

  if (inspection.tls && !inspection.certTrusted) {
    const result = new CertAuthority().trust()
    reply(result.message)
  }

  if (inspection.tls && !inspection.hostsSynced && tld !== undefined && hostnames !== undefined) {
    new HostsSync().sync([tld, ...hostnames])
    reply('/etc/hosts synced for the configured TLD')
  }

  for (const issue of inspection.issues) {
    if (issue.includes('not trusted') || issue.includes('/etc/hosts')) continue
    reply(`routing: ${issue}`)
  }
}

export const run = async (): Promise<void> => {
  const client = new Client()

  try {
    if (await client.ping()) {
      reply(`Outrider daemon is already running (socket: ${socketPath})`)
      await repairRouting(client)

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

  const { services } = await client.state(),
    resumed = services.filter((s) => s.entry.desired === 'up' && s.entry.autostart).length

  reply(
    `Outrider daemon on — ${plural(services.length, 'service')} registered, ${resumed} autostarting`,
  )

  await repairRouting(client)
}
