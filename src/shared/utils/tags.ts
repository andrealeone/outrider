const TAG_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i

/** Whether a single tag is well-formed: letters, digits, and inner dashes. */
export const isValidTag = (tag: string): boolean => TAG_PATTERN.test(tag)

/** Trim, lowercase, drop blanks, and dedupe; `undefined` means "leave as is". */
export const normalizeTags = (tags?: string[]): string[] | undefined => {
  if (tags === undefined) return undefined
  const cleaned = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))]
  return cleaned.length > 0 ? cleaned : undefined
}

/** Coerce an `x-tags` value (a list or a comma-separated string) to a tag list. */
export const toTagList = (value: unknown): string[] | undefined => {
  if (Array.isArray(value)) return value.map(String)
  if (typeof value === 'string') return value.split(',')
  return undefined
}
