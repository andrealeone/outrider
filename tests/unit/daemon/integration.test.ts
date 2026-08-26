import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ProcessStatus, ServiceState } from '@/shared/types/protocol'
import type { RouteKind } from '@/shared/types/registry'
import type { RouteBinding, RouteInfo, Router, RouterInspection } from '@/shared/types/router'

import { Client } from '@/shared/client'
import { waitFor } from '@/shared/utils/time'
import { APP_VERSION, PROTOCOL_VERSION } from '@/shared/version'
import { Api } from '@/daemon/api'
import { EventBus } from '@/daemon/event-bus'
import { Logger } from '@/daemon/logger'
import { Prober } from '@/daemon/prober'
import { Reconciler } from '@/daemon/reconciler'
import { Registry } from '@/daemon/registry'
import { StateStore } from '@/daemon/state-store'
import { Supervisor } from '@/daemon/supervisor'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-test-'))
const socket = join(tmp, 'test.sock')

class FakeRouter implements Router {
  registered = new Map<string, number>()
  private routes = new Map<string, { kind: RouteKind; service?: string; port: number }>()

  ensureReady(): Promise<RouterInspection> {
    return Promise.resolve({
      listening: true,
      port: 80,
      tls: false,
      certTrusted: false,
      hostsSynced: false,
      issues: [],
    })
  }
  hostnameFor(label: string): string {
    return `${label}.localhost`
  }
  urlFor(hostname: string): string {
    return `http://${hostname}`
  }
  tld(): string {
    return 'localhost'
  }
  register(
    hostname: string,
    port: number,
    kind: RouteKind,
    service?: string,
  ): Promise<RouteBinding> {
    this.registered.set(hostname, port)
    this.routes.set(hostname, { kind, service, port })
    return Promise.resolve({ hostname, port, url: this.urlFor(hostname) })
  }
  unregister(hostname: string): Promise<void> {
    this.registered.delete(hostname)
    this.routes.delete(hostname)
    return Promise.resolve()
  }
  list(): Promise<RouteInfo[]> {
    return Promise.resolve(
      [...this.routes.entries()].map(([hostname, r]) => ({
        hostname,
        ...r,
        url: this.urlFor(hostname),
        live: true,
      })),
    )
  }
  inspect(): RouterInspection {
    return {
      listening: true,
      port: 80,
      tls: false,
      certTrusted: false,
      hostsSynced: false,
      issues: [],
    }
  }
  kindOf(hostname: string): RouteKind | undefined {
    return this.routes.get(hostname)?.kind
  }
}

const fakeRouter = new FakeRouter()
let api: Api
let reconciler: Reconciler
const client = new Client(socket)

const stateOf = async (id: string): Promise<ServiceState | undefined> => {
  const snapshot = await client.state()
  return snapshot.services.find((s: ServiceState) => s.entry.id === id)
}

const waitForStatus = async (
  id: string,
  status: ProcessStatus,
  timeout = 8000,
): Promise<ServiceState> => {
  const ok = await waitFor(async () => (await stateOf(id))?.status === status, timeout, 60)
  const state = await stateOf(id)
  if (!ok) throw new Error(`"${id}" never reached ${status}; last: ${state?.status}`)
  return state as ServiceState
}

/** Preview then apply every process in a compose file, as the import wizard would with everything approved. */
const importAll = async (path: string): Promise<{ sourceTag: string; created: string[] }> => {
  const preview = await client.previewImport(path)
  const result = await client.applyImport({
    path,
    sourceTag: preview.sourceTag,
    approved: preview.processes,
    removedProcessNames: preview.toRemove,
  })
  return { sourceTag: preview.sourceTag, created: result.created }
}

beforeAll(() => {
  const store = new StateStore(join(tmp, 'registry.json'), join(tmp, 'journal.jsonl'))
  const bus = new EventBus()
  const logger = new Logger(bus)
  const supervisor = new Supervisor(logger, new Prober(), bus, (r) => {
    store.appendJournal(r)
  })
  const registry = new Registry(store, bus)
  reconciler = new Reconciler(registry, supervisor, fakeRouter, bus, logger)
  api = new Api({
    info: { version: APP_VERSION, protocol: PROTOCOL_VERSION, pid: process.pid, startedAt: 'now' },
    registry,
    reconciler,
    logger,
    router: fakeRouter,
    bus,
    onShutdown: () => {},
  })
  api.listen(socket)
  reconciler.start()
})

afterAll(async () => {
  await reconciler.shutdownAll()
  api.stop()
  rmSync(tmp, { recursive: true, force: true })
})

describe('daemon over the socket', () => {
  test('handshake reports matching protocol', async () => {
    const info = await client.info()
    expect(info.protocol).toBe(PROTOCOL_VERSION)
  })

  test('standalone service lifecycle: add, start, observe logs, stop', async () => {
    await client.addService({
      name: 'echoer',
      command: 'echo hello-from-echoer crs=$CURSOR_RECORD_SESSION && sleep 60',
    })
    await client.start('echoer')
    const running = await waitForStatus('echoer', 'running')
    expect(running.instances[0]?.pid).toBeGreaterThan(0)
    expect(running.entry.desired).toBe('up')

    await waitFor(async () => (await client.logs('echoer')).length > 0, 3000)
    const logs = await client.logs('echoer')
    expect(logs.some((l) => l.line.includes('hello-from-echoer'))).toBe(true)
    expect(logs.some((l) => l.line.includes('crs=1'))).toBe(true)

    await client.stop('echoer')
    const stopped = await waitForStatus('echoer', 'completed')
    expect(stopped.entry.desired).toBe('down')
  })

  test('restart policy: on_failure restarts up to max_restarts then errors', async () => {
    const dir = join(tmp, 'crash')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'process-compose.yaml'),
      [
        'name: crashstack',
        'processes:',
        '  crasher:',
        '    command: "exit 7"',
        '    availability:',
        '      restart: on_failure',
        '      backoff_seconds: 0',
        '      max_restarts: 2',
      ].join('\n'),
    )
    const { sourceTag } = await importAll(dir)
    expect(sourceTag).toBe('crashstack')
    await client.up({ names: ['crashstack'] })

    const errored = await waitForStatus('crasher', 'error')
    expect(errored.restarts).toBe(2)
    expect(errored.exitCode).toBe(7)
  })

  test('dependency conditions gate starts and cascade skips', async () => {
    const dir = join(tmp, 'deps')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'process-compose.yaml'),
      [
        'name: depstack',
        'processes:',
        '  prep:',
        '    command: "echo prepared"',
        '  main:',
        '    command: "sleep 60"',
        '    ready_log_line: never-logged',
        '    depends_on:',
        '      prep: { condition: process_completed_successfully }',
        '  failing:',
        '    command: "exit 1"',
        '  victim:',
        '    command: "sleep 60"',
        '    depends_on:',
        '      failing: { condition: process_completed_successfully }',
      ].join('\n'),
    )
    await importAll(dir)
    await client.up({ names: ['depstack'] })

    await waitForStatus('prep', 'completed')
    await waitForStatus('main', 'running')
    await waitForStatus('victim', 'skipped')
    await client.down({ names: ['depstack'] })
    await waitForStatus('main', 'completed')
  })

  test('replicas fan out and scale down at runtime', async () => {
    await client.addService({ name: 'fleet', command: 'sleep 60' })
    await client.start('fleet')
    await waitForStatus('fleet', 'running')

    await client.scale('fleet', 3)
    await waitFor(async () => {
      const s = await stateOf('fleet')
      return s?.instances.filter((i) => i.status === 'running').length === 3
    }, 5000)
    const scaled = await stateOf('fleet')
    expect(scaled?.instances.map((i) => i.name).sort()).toEqual(['fleet', 'fleet-1', 'fleet-2'])

    await client.scale('fleet', 1)
    await waitFor(async () => (await stateOf('fleet'))?.instances.length === 1, 5000)
    await client.stop('fleet')
  })

  test('routed services get PORT, HOST, and the route URL injected', async () => {
    await client.addService({
      name: 'routed',
      command: 'echo "url=$OUTRIDER_URL portless=$PORTLESS_URL port=$PORT host=$HOST" && sleep 60',
      route: 'routed',
    })
    await client.start('routed')
    const state = await waitForStatus('routed', 'running')
    expect(state.routeUrl).toBe('http://routed.localhost')
    expect(fakeRouter.registered.has('routed.localhost')).toBe(true)
    expect(fakeRouter.kindOf('routed.localhost')).toBe('managed')

    await waitFor(async () => (await client.logs('routed')).length > 0, 3000)
    const logs = await client.logs('routed')
    expect(
      logs.some((l) =>
        /url=http:\/\/routed\.localhost portless=http:\/\/routed\.localhost port=\d+ host=127\.0\.0\.1/.test(
          l.line,
        ),
      ),
    ).toBe(true)
    await client.stop('routed')
    await waitForStatus('routed', 'completed')
    expect(fakeRouter.registered.has('routed.localhost')).toBe(false)
  })

  test('alias-port services register at the pinned port', async () => {
    await client.addService({
      name: 'external',
      command: 'sleep 60',
      route: 'external',
      aliasPort: 10020,
    })
    await client.start('external')
    await waitForStatus('external', 'running')
    expect(fakeRouter.registered.get('external.localhost')).toBe(10020)
    expect(fakeRouter.kindOf('external.localhost')).toBe('static')

    await client.stop('external')
    await waitForStatus('external', 'completed')
  })

  test('route names must be unique system-wide', async () => {
    await client.addService({ name: 'dup-route-1', command: 'sleep 60', route: 'dup' })

    let rejection: Error | undefined
    try {
      await client.addService({ name: 'dup-route-2', command: 'sleep 60', route: 'dup' })
    } catch (err) {
      rejection = err as Error
    }
    expect(rejection?.message).toMatch(/unique/i)

    await client.removeService('dup-route-1')
  })

  test('service lifecycle: edit restarts a live service, delete removes it', async () => {
    await client.addService({ name: 'editable', command: 'echo before && sleep 60' })
    await client.start('editable')
    await waitForStatus('editable', 'running')

    // Live validation: a name collision is rejected unless it is the edited id.
    expect((await client.validateService({ name: 'editable', command: 'x' })).ok).toBe(false)
    expect((await client.validateService({ name: 'editable', command: 'x' }, 'editable')).ok).toBe(
      true,
    )

    await client.updateService('editable', {
      name: 'editable',
      command: 'echo after && sleep 60',
      autostart: true,
    })
    const updated = await waitForStatus('editable', 'running')
    expect(updated.entry.autostart).toBe(true)
    expect(updated.entry.config.command).toBe('echo after && sleep 60')
    await waitFor(async () => (await client.logs('editable')).some((l) => l.line === 'after'), 4000)

    // Renaming is allowed and moves the entry to the new id.
    const errorOf = (work: Promise<unknown>): Promise<string> =>
      work.then(
        () => '',
        (err: Error) => err.message,
      )
    await client.updateService('editable', { name: 'renamed', command: 'echo renamed && sleep 60' })
    const renamed = await waitForStatus('renamed', 'running')
    expect(renamed.entry.id).toBe('renamed')
    const gone = await client.state()
    expect(gone.services.some((s) => s.entry.id === 'editable')).toBe(false)

    expect((await client.validateService({ name: 'main', command: 'x' }, 'main')).ok).toBe(true)
    await client.updateService('main', { name: 'main', command: 'echo import-edited' })
    const importEdited = await stateOf('main')
    expect(importEdited?.entry.sourceTag).toBe('depstack')
    expect(importEdited?.entry.config.command).toBe('echo import-edited')

    await client.removeService('renamed')
    const snapshot = await client.state()
    expect(snapshot.services.some((s) => s.entry.id === 'renamed')).toBe(false)

    // An imported service deletes directly too, no separate "remove the whole batch" step.
    await client.removeService('main')
    const after = await client.state()
    expect(after.services.some((s) => s.entry.id === 'main')).toBe(false)
    expect(await errorOf(client.removeService('main'))).toContain('no service')
  }, 20_000)

  test('events stream over the websocket', async () => {
    const received: string[] = []
    const unsubscribe = client.events((event) => {
      received.push(event.type)
    })
    await waitFor(() => received.includes('snapshot'), 3000)
    await client.addService({ name: 'pinger', command: 'echo ping' })
    await client.start('pinger')
    await waitFor(() => received.includes('state') && received.includes('log'), 5000)
    unsubscribe()
    expect(received).toContain('snapshot')
    expect(received).toContain('state')
    expect(received).toContain('log')
  })

  test('registry persists desired state and survives a reload', async () => {
    const registry = await client.registry()
    expect(registry.services['fleet']?.config.replicas).toBe(1)
    expect(registry.services['crasher']?.sourceTag).toBe('crashstack')

    const reloaded = new StateStore(
      join(tmp, 'registry.json'),
      join(tmp, 'journal.jsonl'),
    ).loadRegistry()
    expect(Object.keys(reloaded.services).length).toBe(Object.keys(registry.services).length)
  })

  test('api errors share the single error shape', async () => {
    const res = await fetch('http://o/v1/services/ghost/start', { method: 'POST', unix: socket })
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: { code: string; message: string } }
    expect(body.error.code).toBe('not-found')
    expect(body.error.message).toContain('ghost')
  })
})
