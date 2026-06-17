import { runUpDown } from '../updown'

export const description = 'stop services by name, stack, namespace, or tag'

export const run = (args: string[]): Promise<void> => runUpDown('stop', args)
