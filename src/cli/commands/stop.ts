import { runUpDown } from '@/cli/updown'

export const description = 'stop services by name, namespace, or tag'

export const run = (args: string[]): Promise<void> => runUpDown('stop', args)
