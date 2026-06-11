import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ProcessStatus, ServiceState } from '../shared/types/protocol'
import type { RouteBinding, Router, RouterStatus } from '../shared/types/router'

import { Client } from '../shared/client'
import { waitFor } from '../shared/utils/time'
import { APP_VERSION, PROTOCOL_VERSION } from '../shared/version'
import { Api } from './api'
import { EventBus } from './event-bus'
import { Logger } from './logger'
import { Prober } from './prober'
import { Reconciler } from './reconciler'
import { Registry } from './registry'
import { StateStore } from './state-store'
import { Supervisor } from './supervisor'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-test-'))
const socket = join(tmp, 'test.sock')

class FakeRouter implements Router {
  registered = new Map<string, number>()
  ensureProxy(): Promise<boolean> {
    return Promise.resolve(true)
  }
  register(route: string, port: number): Promise<RouteBinding> {
    this.registered.set(route, port)
    return Promise.resolve({
      route,
      hostname: `${route}.localhost`,
      port,
      url: `https://${route}.localhost`,
    })
  }
  unregister(route: string): Promise<void> {
    this.registered.delete(route)
    return Promise.resolve()
  }
  urlFor(route: string): string {
    return `https://${route}.localhost`
  }
  status(): Promise<RouterStatus> {
    return Promise.resolve({ available: true, proxyRunning: true, routes: [] })
  }
}

const fakeRouter = new FakeRouter()
let api: Api
let reconciler: Reconciler
const client = new Client(socket)

const stateOf = async (id: string): Promise<ServiceState | undefined> => {
  const snapshot = await client.state()
  return snapshot.services.find((s) => s.entry.id === id)
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
    await client.addService({ name: 'echoer', command: 'echo hello-from-echoer && sleep 60' })
    await client.start('echoer')
    const running = await waitForStatus('echoer', 'running')
    expect(running.instances[0]?.pid).toBeGreaterThan(0)
    expect(running.entry.desired).toBe('up')

    await waitFor(async () => (await client.logs('echoer')).length > 0, 3000)
    const logs = await client.logs('echoer')
    expect(logs.some((l) => l.line.includes('hello-from-echoer'))).toBe(true)

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
    const report = await client.importStack({ path: dir })
    expect(report.stack).toBe('crashstack')
    await client.up({ names: ['crashstack'] })

    const errored = await waitForStatus('crashstack/crasher', 'error')
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
    await client.importStack({ path: dir })
    await client.up({ names: ['depstack'] })

    await waitForStatus('depstack/prep', 'completed')
    await waitForStatus('depstack/main', 'running')
    await waitForStatus('depstack/victim', 'skipped')
    await client.down({ names: ['depstack'] })
    await waitForStatus('depstack/main', 'completed')
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

  test('routed services get PORT and the route URL injected', async () => {
    await client.addService({
      name: 'routed',
      command: 'echo "url=$OUTRIDER_URL port=$PORT" && sleep 60',
      route: 'routed',
    })
    await client.start('routed')
    const state = await waitForStatus('routed', 'running')
    expect(state.routeUrl).toBe('https://routed.localhost')
    expect(fakeRouter.registered.has('routed')).toBe(true)

    await waitFor(async () => (await client.logs('routed')).length > 0, 3000)
    const logs = await client.logs('routed')
    expect(logs.some((l) => /url=https:\/\/routed\.localhost port=\d+/.test(l.line))).toBe(true)
    await client.stop('routed')
    await waitForStatus('routed', 'completed')
    expect(fakeRouter.registered.has('routed')).toBe(false)
  })

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
    expect(registry.stacks['depstack']?.contentHash).toHaveLength(16)

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
