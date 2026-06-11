/** Truncate to `width` with an ellipsis, padding to exactly `width`. */
export const fit = (text: string, width: number): string => {
  if (text.length > width) return width <= 1 ? text.slice(0, width) : `${text.slice(0, width - 1)}…`
  return text.padEnd(width)
}

export const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`

const SECRET_KEY_PATTERN = /token|secret|password|passwd|key|credential/i

/** Heuristic masking for environment display; documented as best-effort. */
export const maskSecret = (key: string, value: string): string =>
  SECRET_KEY_PATTERN.test(key) && value.length > 0 ? '••••••' : value
