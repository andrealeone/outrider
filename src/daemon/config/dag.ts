import type { ProcessConfig } from '@/shared/types/process-compose'

export class DependencyCycleError extends Error {
  constructor(readonly cycle: string[]) {
    super(`dependency cycle detected: ${cycle.join(' -> ')}`)
  }
}

/**
 * Group process names into start levels: every process in level N depends
 * only on processes in earlier levels. Throws DependencyCycleError on cycles,
 * so imports fail at validation time, never at runtime. Shutdown uses the
 * reversed levels.
 */
export const startOrder = (processes: Record<string, ProcessConfig>): string[][] => {
  const names = Object.keys(processes)
  const depsOf = (name: string): string[] =>
    Object.keys(processes[name]?.depends_on ?? {}).filter((dep) => dep in processes)

  const levelOf = new Map<string, number>()
  const visiting = new Set<string>()

  const resolve = (name: string, path: string[]): number => {
    const known = levelOf.get(name)
    if (known !== undefined) return known
    if (visiting.has(name)) {
      const start = path.indexOf(name)
      throw new DependencyCycleError([...path.slice(start), name])
    }
    visiting.add(name)
    const level = depsOf(name).reduce(
      (max, dep) => Math.max(max, resolve(dep, [...path, name]) + 1),
      0,
    )
    visiting.delete(name)
    levelOf.set(name, level)
    return level
  }

  for (const name of names) resolve(name, [])

  const levels: string[][] = []
  for (const name of names) {
    const level = levelOf.get(name) as number
    ;(levels[level] ??= []).push(name)
  }
  return levels
}
