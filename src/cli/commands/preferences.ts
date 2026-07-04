import { fail, reply } from '@/cli/output'
import {
  describePreferences,
  getPreference,
  PREFERENCE_KEYS,
  resetPreference,
  setPreference,
} from '@/shared/utils/preferences'

export const description = 'view or change persisted user preferences (feature switches)'

const usage = `usage: outrider preferences [list]
       outrider preferences get <key>
       outrider preferences set <key> <value>
       outrider preferences reset [<key>]

keys:
${PREFERENCE_KEYS.map((k) => `  ${k.key.padEnd(14)} ${k.description}`).join('\n')}`

const runSync = (args: string[]): void => {
  const [sub, ...rest] = args

  switch (sub) {
    case undefined:
    case 'list':
      reply(describePreferences())
      return

    case 'get': {
      const [key] = rest
      if (key === undefined) {
        fail(usage)
        return
      }
      try {
        reply(`${key} = ${getPreference(key)}`)
      } catch (err) {
        fail((err as Error).message)
      }
      return
    }

    case 'set': {
      const [key, value] = rest
      if (key === undefined || value === undefined) {
        fail(usage)
        return
      }
      try {
        setPreference(key, value)
        reply(`${key} = ${getPreference(key)}`)
      } catch (err) {
        fail((err as Error).message)
      }
      return
    }

    case 'reset': {
      const [key] = rest
      try {
        resetPreference(key)
        reply(key === undefined ? 'preferences reset to defaults' : `${key} reset to default`)
      } catch (err) {
        fail((err as Error).message)
      }
      return
    }

    default:
      fail(usage)
  }
}

export const run = (args: string[]): Promise<void> => {
  runSync(args)
  return Promise.resolve()
}
