import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EventBus } from '@/daemon/event-bus'
import { ProxyEngine } from '@/daemon/router/proxy-engine'
import { RouteTable } from '@/daemon/router/route-table'
import { Registry } from '@/daemon/registry'
import { StateStore } from '@/daemon/state-store'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-proxy-engine-'))
const store = new StateStore(join(tmp, 'registry.json'), join(tmp, 'journal.jsonl'))
const registry = new Registry(store, new EventBus())
const routes = new RouteTable(registry)

const engines: ProxyEngine[] = []
const upstreams: ReturnType<typeof Bun.serve>[] = []

afterEach(() => {
  for (const engine of engines.splice(0)) engine.stop()
  for (const upstream of upstreams.splice(0)) void upstream.stop()
})

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

const startEngine = async (): Promise<{ port: number; engine: ProxyEngine }> => {
  const engine = new ProxyEngine(routes, 0, 0)
  engines.push(engine)
  const port = await engine.start()
  return { port, engine }
}

const startUpstream = (handler: (req: Request) => Response | Promise<Response>): number => {
  const upstream = Bun.serve({ port: 0, fetch: handler })
  upstreams.push(upstream)
  return upstream.port as number
}

describe('ProxyEngine (plain HTTP)', () => {
  test('forwards a request by Host header, restating it for the upstream', async () => {
    const upstreamPort = startUpstream((req) => new Response(`host=${req.headers.get('host')}`))
    routes.upsert('engine-a.localhost', upstreamPort, 'managed', 'a')
    const { port } = await startEngine()

    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { Host: 'engine-a.localhost' },
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('host=engine-a.localhost')
  })

  test('returns 404 with the route listing for an unknown hostname', async () => {
    const { port } = await startEngine()
    const res = await fetch(`http://127.0.0.1:${port}/`, { headers: { Host: 'nope.localhost' } })
    expect(res.status).toBe(404)
    expect(await res.text()).toContain('No service is routed at this hostname')
  })

  test('answers 508 when a request already carries the hop header (loop guard)', async () => {
    const { port } = await startEngine()
    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { 'Host': 'anything.localhost', 'x-outrider-hop': '1' },
    })
    expect(res.status).toBe(508)
    expect(await res.text()).toContain('508 Loop Detected')
  })

  test('propagates the upstream status and body', async () => {
    const upstreamPort = startUpstream(() => new Response('created', { status: 201 }))
    routes.upsert('engine-b.localhost', upstreamPort, 'managed', 'b')
    const { port } = await startEngine()

    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { Host: 'engine-b.localhost' },
    })
    expect(res.status).toBe(201)
    expect(await res.text()).toBe('created')
  })

  test('502s when the upstream is unreachable', async () => {
    routes.upsert('engine-c.localhost', 1, 'managed', 'c')
    const { port } = await startEngine()

    const res = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { Host: 'engine-c.localhost' },
    })
    expect(res.status).toBe(502)
  })

  test('forwards a POST body to the upstream', async () => {
    const upstreamPort = startUpstream(async (req) => new Response(`body=${await req.text()}`))
    routes.upsert('engine-d.localhost', upstreamPort, 'managed', 'd')
    const { port } = await startEngine()

    const res = await fetch(`http://127.0.0.1:${port}/submit`, {
      method: 'POST',
      headers: { 'Host': 'engine-d.localhost', 'content-type': 'text/plain' },
      body: 'hello',
    })
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('body=hello')
  })
})
