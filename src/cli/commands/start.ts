import { runUpDown } from '@/cli/updown'

export const description = 'start services by name, stack, namespace, or tag'

export const run = (args: string[]): Promise<void> => runUpDown('start', args)
