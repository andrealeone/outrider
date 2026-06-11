import { existsSync, readFileSync } from 'node:fs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  DaemonInfo,
  ImportReport,
  LogLine,
  ServiceDefinition,
  ServiceState,
} from '../shared/types/protocol'
import type { RegistryModel } from '../shared/types/registry'

import { ApiCallError, Client } from '../shared/client'
import { installUnit, startUnit } from '../shared/service-unit'
import { registryPath } from '../shared/utils/paths'

const RECONNECT_MS = 1200
const FLUSH_MS = 80

export type Connection = 'connecting' | 'online' | 'offline'

export interface DaemonHook {
  connection: Connection
  daemon?: DaemonInfo
  services: ServiceState[]
  shuttingDown: boolean
  notice?: string
  /** Raw log stream subscription; bypasses React state for cheap fan-out. */
  onLog: (cb: (line: LogLine) => void) => () => void
  toggle: (state: ServiceState) => void
  restart: (id: string) => void
  scale: (id: string, replicas: number) => void
  setAutostart: (id: string, autostart: boolean) => void
  daemonOn: () => void
  daemonOff: () => void
  addService: (def: ServiceDefinition) => Promise<string | undefined>
  updateService: (id: string, def: ServiceDefinition) => Promise<string | undefined>
  /** Removes a standalone service, or the whole stack for a stack member. */
  removeService: (state: ServiceState) => void
  validateService: (def: ServiceDefinition, editOf?: string) => Promise<string[]>
  importStack: (path: string, dryRun: boolean) => Promise<ImportReport>
  fetchLogs: (id: string, tail?: number) => Promise<LogLine[]>
  clearLogs: (id: string) => Promise<string | undefined>
}

/** Synthesise dashboard rows from the persisted registry (daemon off). */
const offlineSnapshot = (): ServiceState[] => {
  if (!existsSync(registryPath)) return []
  try {
    const model = JSON.parse(readFileSync(registryPath, 'utf8')) as RegistryModel
    return Object.values(model.services).map((entry) => ({
      entry,
      status: 'pending',
      health: 'unknown',
      restarts: 0,
      instances: [],
    }))
  } catch {
    return []
  }
}

export const useDaemon = (): DaemonHook => {
  const client = useMemo(() => new Client(), [])
  const [connection, setConnection] = useState<Connection>('connecting')
  const [daemon, setDaemon] = useState<DaemonInfo>()
  const [services, setServices] = useState<ServiceState[]>([])
  const [shuttingDown, setShuttingDown] = useState(false)
  const [notice, setNotice] = useState<string>()

  const byId = useRef(new Map<string, ServiceState>())
  const dirty = useRef(false)
  const optimistic = useRef(new Map<string, 'up' | 'down'>())
  const logSubscribers = useRef(new Set<(line: LogLine) => void>())
  const unsubscribe = useRef<() => void>(() => {})
  const alive = useRef(true)

  const flush = useCallback(() => {
    if (!dirty.current) return
    dirty.current = false
    const rows = [...byId.current.values()].map((state) => {
      const want = optimistic.current.get(state.entry.id)
      return want === undefined || want === state.entry.desired
        ? state
        : { ...state, entry: { ...state.entry, desired: want } }
    })
    setServices(rows)
  }, [])

  useEffect(() => {
    const connect = async (): Promise<void> => {
      if (!alive.current) return
      const goOffline = (): void => {
        setConnection('offline')
        byId.current = new Map(offlineSnapshot().map((s) => [s.entry.id, s]))
        dirty.current = true
        flush()
        setTimeout(() => void connect(), RECONNECT_MS)
      }
      try {
        const info = await client.info()
        setDaemon(info)
        setShuttingDown(false)
        unsubscribe.current = client.events(
          (event) => {
            switch (event.type) {
              case 'snapshot':
                byId.current = new Map(event.services.map((s) => [s.entry.id, s]))
                optimistic.current.clear()
                dirty.current = true
                break
              case 'state': {
                const id = event.service.entry.id
                byId.current.set(id, event.service)
                if (optimistic.current.get(id) === event.service.entry.desired) {
                  optimistic.current.delete(id)
                }
                dirty.current = true
                break
              }
              case 'registry':
                for (const entry of Object.values(event.registry.services)) {
                  const existing = byId.current.get(entry.id)
                  byId.current.set(
                    entry.id,
                    existing
                      ? { ...existing, entry }
                      : { entry, status: 'pending', health: 'unknown', restarts: 0, instances: [] },
                  )
                }
                for (const id of [...byId.current.keys()]) {
                  if (!(id in event.registry.services)) byId.current.delete(id)
                }
                dirty.current = true
                break
              case 'log':
                for (const cb of logSubscribers.current) cb(event.log)
                break
              case 'daemon':
                if (event.status === 'shutting-down') setShuttingDown(true)
                break
              case 'probe':
                break
              default:
                break
            }
          },
          () => {
            if (alive.current) goOffline()
          },
        )
        setConnection('online')
      } catch (err) {
        if (!alive.current) return
        setNotice(
          err instanceof Error && !err.message.includes('not running') ? err.message : undefined,
        )
        goOffline()
      }
    }

    void connect()
    const flusher = setInterval(flush, FLUSH_MS)
    return () => {
      alive.current = false
      clearInterval(flusher)
      unsubscribe.current()
    }
  }, [client, flush])

  const guard = useCallback((action: () => Promise<unknown>): void => {
    void action().catch((err: unknown) => {
      setNotice(err instanceof ApiCallError ? err.message : String(err))
    })
  }, [])

  return {
    connection,
    daemon,
    services,
    shuttingDown,
    notice,
    onLog: useCallback((cb) => {
      logSubscribers.current.add(cb)
      return () => logSubscribers.current.delete(cb)
    }, []),
    toggle: useCallback(
      (state: ServiceState) => {
        const id = state.entry.id
        const next = (optimistic.current.get(id) ?? state.entry.desired) === 'up' ? 'down' : 'up'
        optimistic.current.set(id, next)
        dirty.current = true
        guard(() => client.patchService(id, { desired: next }))
      },
      [client, guard],
    ),
    restart: useCallback(
      (id: string) => {
        guard(() => client.restart(id))
      },
      [client, guard],
    ),
    scale: useCallback(
      (id: string, replicas: number) => {
        guard(() => client.scale(id, replicas))
      },
      [client, guard],
    ),
    setAutostart: useCallback(
      (id: string, autostart: boolean) => {
        guard(() => client.patchService(id, { autostart }))
      },
      [client, guard],
    ),
    daemonOn: useCallback(() => {
      installUnit()
      startUnit()
      setConnection('connecting')
    }, []),
    daemonOff: useCallback(() => {
      guard(() => client.shutdown())
    }, [client, guard]),
    addService: useCallback(
      async (def: ServiceDefinition) => {
        try {
          await client.addService(def)
          return undefined
        } catch (err) {
          return err instanceof Error ? err.message : String(err)
        }
      },
      [client],
    ),
    updateService: useCallback(
      async (id: string, def: ServiceDefinition) => {
        try {
          await client.updateService(id, def)
          return undefined
        } catch (err) {
          return err instanceof Error ? err.message : String(err)
        }
      },
      [client],
    ),
    removeService: useCallback(
      (state: ServiceState) => {
        const { entry } = state
        guard(() =>
          entry.stack === undefined
            ? client.removeService(entry.id)
            : client.removeStack(entry.stack),
        )
      },
      [client, guard],
    ),
    validateService: useCallback(
      async (def: ServiceDefinition, editOf?: string) => {
        try {
          const result = await client.validateService(def, editOf)
          return result.errors
        } catch (err) {
          return [err instanceof Error ? err.message : String(err)]
        }
      },
      [client],
    ),
    importStack: useCallback(
      (path: string, dryRun: boolean) => client.importStack({ path, dryRun }),
      [client],
    ),
    fetchLogs: useCallback((id: string, tail = 300) => client.logs(id, tail), [client]),
    clearLogs: useCallback(
      async (id: string) => {
        try {
          await client.clearLogs(id)
          return undefined
        } catch (err) {
          return err instanceof Error ? err.message : String(err)
        }
      },
      [client],
    ),
  }
}
