import { runDaemon } from '../../../daemon/daemon'

export const description = 'run the daemon in the foreground (internal; used by the service unit)'
export const hidden = true

export const run = async (): Promise<void> => {
  await runDaemon()
}
