const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Deep merge of parsed YAML trees, matching upstream multi-file semantics:
 * maps merge recursively, arrays and scalars in later files replace earlier
 * values wholesale, and an explicit null removes the key.
 */
export const deepMerge = (
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    if (value === null) {
      delete out[key]
    } else if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value)
    } else {
      out[key] = value
    }
  }
  return out
}

export const mergeAll = (trees: Record<string, unknown>[]): Record<string, unknown> =>
  trees.reduce((acc, tree) => deepMerge(acc, tree), {})
