import { describe, expect, test } from 'bun:test'
import { parseDotenv, parseEnvList } from './env'

describe('parseEnvList', () => {
  test('splits on the first equals sign only', () => {
    expect(parseEnvList(['A=1', 'B=x=y', 'EMPTY='])).toEqual({ A: '1', B: 'x=y', EMPTY: '' })
  })

  test('treats a bare key as empty', () => {
    expect(parseEnvList(['FLAG'])).toEqual({ FLAG: '' })
  })
})

describe('parseDotenv', () => {
  test('parses plain, quoted, and exported lines', () => {
    const env = parseDotenv('A=1\nexport B="two words"\nC=\'sin#gle\'\n# comment\n\nD=val # note')
    expect(env).toEqual({ A: '1', B: 'two words', C: 'sin#gle', D: 'val' })
  })

  test('ignores malformed lines', () => {
    expect(parseDotenv('not a var\n2BAD=1')).toEqual({})
  })
})
