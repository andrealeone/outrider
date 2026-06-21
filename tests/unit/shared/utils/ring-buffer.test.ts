import { describe, expect, test } from 'bun:test'
import { RingBuffer } from '../../../../src/shared/utils/ring-buffer'

describe('RingBuffer', () => {
  test('keeps insertion order below capacity', () => {
    const buf = new RingBuffer<number>(4)
    buf.push(1)
    buf.push(2)
    expect(buf.tail()).toEqual([1, 2])
  })

  test('drops oldest entries past capacity', () => {
    const buf = new RingBuffer<number>(3)
    for (const n of [1, 2, 3, 4, 5]) buf.push(n)
    expect(buf.tail()).toEqual([3, 4, 5])
    expect(buf.size).toBe(3)
  })

  test('tail(n) returns the last n items', () => {
    const buf = new RingBuffer<number>(5)
    for (const n of [1, 2, 3, 4]) buf.push(n)
    expect(buf.tail(2)).toEqual([3, 4])
    expect(buf.tail(10)).toEqual([1, 2, 3, 4])
  })
})
