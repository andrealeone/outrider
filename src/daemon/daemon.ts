import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

import type { DaemonInfo } from '../shared/types/protocol'

import { Client } from '../shared/client'
import { writeSyncFile } from '../shared/sync/sync-file'
import { hasPortless } from '../shared/utils/portless'
import { lockPath, runtimeDir, socketPath } from '../shared/utils/paths'
import { nowIso } from '../shared/utils/time'
import { APP_VERSION, PROTOCOL_VERSION } from '../shared/version'
import { Api } from './api'
import { EventBus } from './event-bus'
import { Logger } from './logger'
import { Prober } from './prober'
import { Reconciler } from './reconciler'
import { Registry } from './registry'
import { createRouter } from './router'
import { StateStore } from './state-store'
import { Supervisor } from './supervisor'

const log = (message: string): void => {
  console.log(`${nowIso()} ${message}`)
}

const removeIfExists = (path: string): void => {
  if (existsSync(path)) unlinkSync(path)
}

/**
 * The foreground daemon entrypoint, invoked by the launchd/systemd unit (or
 * directly via the hidden `outrider daemon run`). One instance per user,
 * guarded by the socket liveness check.
 */
export const runDaemon = async (): Promise<void> => {
  if (await new Client().ping().catch(() => true)) {
    console.error('Another outrider daemon is already running (or speaks a newer protocol)')
    process.exit(1)
  }
  mkdirSync(runtimeDir, { recursive: true })
  removeIfExists(socketPath)

  const info: DaemonInfo = {
    version: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    pid: process.pid,
    startedAt: nowIso(),
    portless: hasPortless(),
  }

  const store = new StateStore()
  const bus = new EventBus()
  const logger = new Logger(bus)
  const prober = new Prober()
  const supervisor = new Supervisor(
    logger,
    prober,
    bus,
    (record) => {
      store.appendJournal(record)
    },
    store.loadRestartCounters(),
  )
  const registry = new Registry(store, bus)
  const router = createRouter(log)
  const reconciler = new Reconciler(registry, supervisor, router, bus, logger)
  const api = new Api({
    info,
    registry,
    reconciler,
    logger,
    router,
    bus,
    onShutdown: () => void shutdown('shutdown requested over the socket'),
  })

  let shuttingDown = false
  const shutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return
    shuttingDown = true
    log(`shutting down: ${reason}`)
    bus.emit({ type: 'daemon', status: 'shutting-down' })
    store.appendJournal({ ts: nowIso(), type: 'daemon', data: { event: 'stop', reason } })
    await reconciler.shutdownAll()
    api.stop()
    removeIfExists(socketPath)
    removeIfExists(lockPath)
    process.exit(0)
  }

  // Mirror every registry change to the plaintext config so `outrider sync`
  // always diffs against an up-to-date file. Best-effort: a failed write must
  // never take the daemon down.
  bus.on((event) => {
    if (event.type !== 'registry') return
    try {
      writeSyncFile(event.registry)
    } catch (err) {
      log(`failed to write sync file: ${(err as Error).message}`)
    }
  })

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  api.listen(socketPath)
  writeFileSync(lockPath, String(process.pid))
  store.appendJournal({ ts: nowIso(), type: 'daemon', data: { event: 'start', pid: process.pid } })
  reconciler.start()
  bus.emit({ type: 'daemon', status: 'ready' })
  log(`outrider daemon ${APP_VERSION} listening on ${socketPath}`)
}
