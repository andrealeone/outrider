import { describe, expect, test } from 'bun:test'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

import { commonPathEntries, withCommonPath } from '@/shared/utils/path-env'

describe('commonPathEntries', () => {
  test('includes the global tool dirs a minimal launchd/systemd PATH omits', () => {
    const entries = commonPathEntries()
    const home = homedir()
    // ~/.bun/bin and ~/.local/bin are where `bun add -g` / `npm i -g` land
    // portless; the daemon must look here even when PATH does not list them.
    expect(entries).toContain(join(home, '.bun', 'bin'))
    expect(entries).toContain(join(home, '.local', 'bin'))
  })
})

describe('withCommonPath', () => {
  test('prepends the common dirs to an existing PATH', () => {
    const result = withCommonPath('/some/custom/dir').split(delimiter)
    expect(result).toContain('/some/custom/dir')
    expect(result).toContain(join(homedir(), '.bun', 'bin'))
  })

  test('handles an undefined PATH without producing empty segments', () => {
    const result = withCommonPath(undefined).split(delimiter)
    expect(result).not.toContain('')
  })

  test('de-duplicates entries already present in PATH', () => {
    const bun = join(homedir(), '.bun', 'bin')
    const segments = withCommonPath(bun).split(delimiter)
    expect(segments.filter((s) => s === bun)).toHaveLength(1)
  })
})
