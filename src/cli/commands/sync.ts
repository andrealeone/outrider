import { runSync } from '@/tui/sync'

export const description = 'reconcile ~/.config/outrider.yml into the registry'

export const run = async (args: string[]): Promise<void> => {
  await runSync({ yes: args.includes('--yes') || args.includes('-y') })
}
