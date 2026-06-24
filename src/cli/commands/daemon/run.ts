import { runDaemon } from '@/daemon/daemon'
import { reply } from '@/cli/output'

export const description = 'run the daemon in the foreground (internal; used by the service unit)'
export const hidden = true

export const run = async (): Promise<void> => {
  reply('Starting the Outrider daemon in the foreground (Ctrl-C to stop)…')
  await runDaemon()
}
