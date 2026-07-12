import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EventBus } from '@/daemon/event-bus'
import { Registry } from '@/daemon/registry'
import { createRouter } from '@/daemon/router'
import { CertAuthority } from '@/daemon/router/cert-authority'
import { HostsSync } from '@/daemon/router/hosts-sync'
import { StateStore } from '@/daemon/state-store'

const tmp = mkdtempSync(join(tmpdir(), 'outrider-router-'))
const store = new StateStore(join(tmp, 'registry.json'), join(tmp, 'journal.jsonl'))
const registry = new Registry(store, new EventBus())

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('NativeRouter (default: plain HTTP)', () => {
  const router = createRouter(registry, () => {})

  test('hostnameFor appends the default tld', () => {
    expect(router.hostnameFor('api')).toBe('api.localhost')
  })

  test('urlFor builds a plain http URL for a hostname', () => {
    const url = router.urlFor('myroute.localhost')
    expect(url).toContain('myroute.localhost')
    expect(url.startsWith('http://')).toBe(true)
  })

  test('register starts the proxy and returns a binding', async () => {
    const binding = await router.register('api.localhost', 8080, 'managed', 'api')
    expect(binding.hostname).toBe('api.localhost')
    expect(binding.port).toBe(8080)
    expect(binding.url).toContain('api.localhost')
  })

  test('ensureReady reports the proxy listening, no TLS, no issues', async () => {
    const inspection = await router.ensureReady()
    expect(inspection.listening).toBe(true)
    expect(inspection.tls).toBe(false)
    expect(inspection.issues).toEqual([])
  })

  test('list reflects registered routes and their liveness', async () => {
    const routes = await router.list()
    const route = routes.find((r) => r.hostname === 'api.localhost')
    expect(route?.service).toBe('api')
    // Nothing is actually listening on 9090 in this test, so it dials false.
    expect(route?.live).toBe(false)
  })

  test('re-registering the same service is idempotent', async () => {
    const binding = await router.register('api.localhost', 9090, 'managed', 'api')
    expect(binding.port).toBe(9090)
  })

  test('registering a hostname claimed by a different service conflicts', async () => {
    let error: Error | undefined
    try {
      await router.register('api.localhost', 8081, 'managed', 'other')
    } catch (err) {
      error = err as Error
    }
    expect(error?.message).toMatch(/claimed/)
  })

  test('unregister removes the route', async () => {
    await router.unregister('api.localhost')
    const routes = await router.list()
    expect(routes.some((r) => r.hostname === 'api.localhost')).toBe(false)
  })
})

describe('NativeRouter (TLS explicitly enabled)', () => {
  // TLS is opt-in, not the default (see state-store.ts): Bun's node:http2
  // shim currently rejects ALPN offers that omit h2, which breaks browser
  // WebSockets. The CA/leaf/hot-swap machinery is still fully exercised here.
  const tlsTmp = mkdtempSync(join(tmpdir(), 'outrider-router-tls-'))
  const tlsStore = new StateStore(join(tlsTmp, 'registry.json'), join(tlsTmp, 'journal.jsonl'))
  tlsStore.saveRegistry({
    version: 1,
    stacks: {},
    services: {},
    routes: {},
    proxy: { port: 443, tls: true, tld: 'localhost' },
  })
  const tlsRegistry = new Registry(tlsStore, new EventBus())

  const certAuthority = new CertAuthority({
    ca: join(tlsTmp, 'ca.pem'),
    caKey: join(tlsTmp, 'ca-key.pem'),
    leaf: join(tlsTmp, 'leaf.pem'),
    leafKey: join(tlsTmp, 'leaf-key.pem'),
    trustMarker: join(tlsTmp, 'trusted.flag'),
  })
  const hostsSync = new HostsSync(join(tlsTmp, 'hosts'))
  const router = createRouter(tlsRegistry, () => {}, { certAuthority, hostsSync })

  afterAll(() => {
    rmSync(tlsTmp, { recursive: true, force: true })
  })

  test('urlFor builds an https URL for a hostname', () => {
    const url = router.urlFor('myroute.localhost')
    expect(url.startsWith('https://')).toBe(true)
  })

  test('register mints a CA-signed leaf and starts the TLS listener', async () => {
    const binding = await router.register('api.localhost', 8080, 'managed', 'api')
    expect(binding.url.startsWith('https://')).toBe(true)

    const leaf = certAuthority.leafCert().toString()
    const ca = certAuthority.caCert().toString()
    expect(leaf).toContain('BEGIN CERTIFICATE')
    expect(ca).toContain('BEGIN CERTIFICATE')
  })

  test('ensureReady reports TLS on with an untrusted CA (needs a foreground sudo prompt)', async () => {
    const inspection = await router.ensureReady()
    expect(inspection.listening).toBe(true)
    expect(inspection.tls).toBe(true)
    expect(inspection.certTrusted).toBe(false)
    expect(inspection.issues.some((i) => i.includes('not trusted'))).toBe(true)
  })

  test('a new hostname re-mints the leaf; the same set does not', async () => {
    const sansBefore = certAuthority.leafCert()
    // Same hostname set as before: no re-mint.
    await router.register('api.localhost', 9090, 'managed', 'api')
    expect(certAuthority.leafCert().equals(sansBefore)).toBe(true)

    await router.register('second.localhost', 7070, 'managed', 'second')
    expect(certAuthority.leafCert().equals(sansBefore)).toBe(false)
    await router.unregister('second.localhost')
  })
})
