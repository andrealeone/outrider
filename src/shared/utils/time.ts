export const nowIso = (): string => new Date().toISOString()

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms)
  })

/** "3d 4h", "2h 05m", "4m 12s", "37s" — compact uptime for table cells. */
export const formatUptime = (sinceIso: string, now = Date.now()): string => {
  const seconds = Math.max(0, Math.floor((now - Date.parse(sinceIso)) / 1000))
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** Resolves when `check` returns true, polling every `intervalMs`; false on timeout. */
export const waitFor = async (
  check: () => boolean | Promise<boolean>,
  timeoutMs: number,
  intervalMs = 50,
): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return true
    await sleep(intervalMs)
  }
  return check()
}
