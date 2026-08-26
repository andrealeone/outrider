import { useState } from 'react'

export interface ListCursor {
  index: number
  set: (index: number) => void
  next: () => void
  prev: () => void
  first: () => void
  last: () => void
}

/** Clamped index over a list of `length` items, min 0. */
export const useListCursor = (length: number, initial = 0): ListCursor => {
  const [index, setIndex] = useState(initial)
  const clamp = (i: number): number => Math.max(0, Math.min(length - 1, i))

  return {
    index: clamp(index),
    set: (i) => {
      setIndex(clamp(i))
    },
    next: () => {
      setIndex((i) => clamp(i + 1))
    },
    prev: () => {
      setIndex((i) => clamp(i - 1))
    },
    first: () => {
      setIndex(0)
    },
    last: () => {
      setIndex(clamp(length - 1))
    },
  }
}
