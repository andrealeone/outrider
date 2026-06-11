/** Parse upstream-style environment lists ("KEY=VAL") into a record. */
export const parseEnvList = (list: string[] | undefined): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const entry of list ?? []) {
    const eq = entry.indexOf('=')
    if (eq === -1) out[entry] = ''
    else out[entry.slice(0, eq)] = entry.slice(eq + 1)
  }
  return out
}

/** Minimal dotenv parser: KEY=VALUE lines, #-comments, single/double quotes. */
export const parseDotenv = (content: string): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const raw of content.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    const [, key, rest] = match
    let value = rest ?? ''
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    } else {
      const hash = value.indexOf(' #')
      if (hash !== -1) value = value.slice(0, hash).trimEnd()
    }
    out[key as string] = value
  }
  return out
}
