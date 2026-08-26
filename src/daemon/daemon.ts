import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'

import type { DaemonInfo } from '@/shared/types/protocol'

import { Client } from '@/shared/client'
import { nowIso } from '@/shared/utils/time'
import { writeSyncFile } from '@/shared/sync/sync-file'
import { APP_VERSION, PROTOCOL_VERSION } from '@/shared/version'
import { lockPath, runtimeDir, socketPath } from '@/shared/utils/paths'

import { Api } from '@/daemon/api'
import { Logger } from '@/daemon/logger'
import { Prober } from '@/daemon/prober'
import { Registry } from '@/daemon/registry'
import { EventBus } from '@/daemon/event-bus'
import { Reconciler } from '@/daemon/reconciler'
import { Supervisor } from '@/daemon/supervisor'
import { StateStore } from '@/daemon/state-store'
import { createRouter } from '@/daemon/router'

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
    console.error('Another Outrider daemon is already running (or speaks a newer protocol)')
    process.exit(1)
  }

  mkdirSync(runtimeDir, { recursive: true })
  removeIfExists(socketPath)

  const info: DaemonInfo = {
    version: APP_VERSION,
    protocol: PROTOCOL_VERSION,
    pid: process.pid,
    startedAt: nowIso(),
  }

  const store = new StateStore(),
    bus = new EventBus(),
    registry = new Registry(store, bus),
    router = createRouter(registry, log),
    logger = new Logger(bus),
    prober = new Prober(),
    supervisor = new Supervisor(
      logger,
      prober,
      bus,
      (record) => {
        store.appendJournal(record)
      },
      store.loadRestartCounters(),
    ),
    reconciler = new Reconciler(registry, supervisor, router, bus, logger),
    api = new Api({
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

  await router.ensureReady().catch((err: Error) => {
    log(`routing proxy not ready: ${err.message}`)
  })

  reconciler.start()
  bus.emit({ type: 'daemon', status: 'ready' })

  log(`outrider daemon ${APP_VERSION} listening on ${socketPath}`)
}
