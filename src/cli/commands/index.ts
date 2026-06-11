import { runTui } from '../../tui/app'

export const description = 'open the dashboard (default)'

export const run = async (): Promise<void> => {
  await runTui()
}
