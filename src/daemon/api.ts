import type { Server } from 'bun'
import type { DaemonInfo, ImportReport, UpDownBody } from '../shared/types/protocol'
import type { Router } from '../shared/types/router'

import type { EventBus } from './event-bus'
import type { Logger } from './logger'
import type { Reconciler } from './reconciler'
import type { Registry } from './registry'

import { startOrder } from './config/dag'
import { ConfigLoadError, loadProject, stackNameFor } from './config/load'
import { TemplateError } from './config/template'
import { RegistryError } from './registry'
import { withDependencies } from './scheduler'

const EVENTS_TOPIC = 'events'

interface ApiDeps {
  info: DaemonInfo
  registry: Registry
  reconciler: Reconciler
  logger: Logger
  router: Router
  bus: EventBus
  /** Invoked by POST /v1/shutdown after the response is sent. */
  onShutdown: () => void
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body ?? { ok: true }, { status })

const errorResponse = (code: string, message: string, status: number): Response =>
  Response.json({ error: { code, message } }, { status })

const statusFor = (code: string): number =>
  ({ 'not-found': 404, 'conflict': 409, 'route-conflict': 409, 'invalid': 400 })[code] ?? 400

/**
 * The control plane: one Bun.serve instance on a unix domain socket. Plain
 * JSON endpoints under /v1 carry commands and queries; a WebSocket upgrade
 * carries the event stream.
 */
export class Api {
  private server?: Server<undefined>

  constructor(private readonly deps: ApiDeps) {}

  listen(socketPath: string): void {
    this.server = Bun.serve({
      unix: socketPath,
      fetch: (req, server) => this.route(req, server),
      websocket: {
        open: (ws) => {
          ws.subscribe(EVENTS_TOPIC)
          ws.send(JSON.stringify({ type: 'snapshot', services: this.deps.reconciler.snapshot() }))
        },
        message() {},
      },
    })
    this.deps.bus.on((event) => {
      this.server?.publish(EVENTS_TOPIC, JSON.stringify(event))
    })
  }

  stop(): void {
    void this.server?.stop(true)
  }

  private async route(req: Request, server: Server<undefined>): Promise<Response> {
    const url = new URL(req.url)
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments[0] !== 'v1') return errorResponse('not-found', 'unknown API version', 404)

    if (url.pathname === '/v1/events') {
      return server.upgrade(req)
        ? (undefined as unknown as Response)
        : errorResponse('invalid', 'expected a WebSocket upgrade', 400)
    }

    try {
      return await this.dispatch(req, url, segments.slice(1))
    } catch (err) {
      if (err instanceof RegistryError) {
        return errorResponse(err.code, err.message, statusFor(err.code))
      }
      if (err instanceof ConfigLoadError || err instanceof TemplateError) {
        return errorResponse('invalid-config', err.message, 422)
      }
      return errorResponse('internal', (err as Error).message, 500)
    }
  }

  private async dispatch(req: Request, url: URL, path: string[]): Promise<Response> {
    const { registry, reconciler, router, info } = this.deps
    const method = req.method
    const body = async <T>(): Promise<T> => (await req.json().catch(() => ({}))) as T
    const [head, rawId, action] = path
    const id = rawId === undefined ? undefined : decodeURIComponent(rawId)

    if (method === 'GET' && head === 'info') return json(info)
    if (method === 'GET' && head === 'state') {
      return json({ daemon: info, services: reconciler.snapshot() })
    }
    if (method === 'GET' && head === 'registry') return json(registry.snapshot())
    if (method === 'GET' && head === 'routes') return json(await router.status())

    if (method === 'POST' && head === 'up') {
      const { names, noDeps } = await body<UpDownBody>()
      const ids = this.bringUp(registry.resolveIds(names), noDeps)
      await reconciler.requestUp(ids, true)
      return json(ids.map((i) => reconciler.stateOf(i)))
    }
    if (method === 'POST' && head === 'down') {
      const { names } = await body<UpDownBody>()
      const ids = registry.resolveIds(names)
      registry.setDesired(ids, 'down')
      await reconciler.requestDown(ids)
      return json(ids.map((i) => reconciler.stateOf(i)))
    }

    if (method === 'POST' && head === 'import') {
      const { path: file, dryRun } = await body<{ path?: string; dryRun?: boolean }>()
      if (!file) throw new RegistryError('invalid', 'path is required')
      const project = loadProject(file, { preview: dryRun })
      const report: ImportReport = {
        stack: stackNameFor(project),
        sources: project.sources,
        services: Object.keys(project.config.processes),
        startOrder: startOrder(project.config.processes),
        warnings: project.warnings,
        dryRun: dryRun === true,
      }
      if (!dryRun) {
        const { removed } = registry.importProject(project)
        await reconciler.requestDown(removed)
      }
      return json(report)
    }

    if (head === 'stacks' && method === 'DELETE' && id !== undefined) {
      const memberIds = registry.snapshot().stacks[id]
        ? registry.resolveIds([id])
        : (() => {
            throw new RegistryError('not-found', `no stack named "${id}"`)
          })()
      await reconciler.requestDown(memberIds)
      registry.removeStack(id)
      return json({ removed: memberIds })
    }

    if (head === 'shutdown' && method === 'POST') {
      setTimeout(this.deps.onShutdown, 20)
      return json({ ok: true })
    }

    if (head === 'services') return this.serviceRoutes(method, id, action, url, body)

    return errorResponse('not-found', `no route for ${method} ${url.pathname}`, 404)
  }

  /**
   * Bringing a service up brings its dependencies up: desired state is set
   * on the whole transitive closure so the reconciler can gate-start it.
   */
  private bringUp(ids: string[], noDeps = false): string[] {
    const { registry } = this.deps
    const expanded = noDeps ? ids : withDependencies(ids, (id) => registry.get(id))
    registry.setDesired(expanded, 'up')
    return expanded
  }

  private async serviceRoutes(
    method: string,
    id: string | undefined,
    action: string | undefined,
    url: URL,
    body: <T>() => Promise<T>,
  ): Promise<Response> {
    const { registry, reconciler, logger } = this.deps

    if (id === undefined && method === 'POST') {
      const entry = registry.addStandalone(await body())
      return json(reconciler.stateOf(entry.id), 201)
    }
    if (id === 'validate' && method === 'POST') {
      try {
        registry.validateDefinition(await body())
        return json({ ok: true, errors: [] })
      } catch (err) {
        if (err instanceof RegistryError) return json({ ok: false, errors: [err.message] })
        throw err
      }
    }
    if (id === undefined) return errorResponse('invalid', 'service id required', 400)

    if (action === undefined) {
      if (method === 'DELETE') {
        await reconciler.requestDown([id])
        registry.remove(id)
        return json({ ok: true })
      }
      if (method === 'PATCH') {
        const patch = await body<{ desired?: 'up' | 'down'; autostart?: boolean }>()
        if (patch.autostart !== undefined) registry.setAutostart(id, patch.autostart)
        if (patch.desired !== undefined) {
          if (patch.desired === 'up') await reconciler.requestUp(this.bringUp([id]), true)
          else {
            registry.setDesired([id], 'down')
            await reconciler.requestDown([id])
          }
        }
        return json(reconciler.stateOf(id))
      }
    }

    if (method === 'GET' && action === 'logs') {
      const tail = Number(url.searchParams.get('tail') ?? 200)
      return json(logger.tail(id, Number.isFinite(tail) ? tail : 200))
    }
    if (method === 'POST' && action !== undefined) {
      if (!registry.get(id)) throw new RegistryError('not-found', `no service "${id}"`)
      switch (action) {
        case 'start':
          await reconciler.requestUp(this.bringUp([id]), true)
          return json(reconciler.stateOf(id))
        case 'stop':
          registry.setDesired([id], 'down')
          await reconciler.requestDown([id])
          return json(reconciler.stateOf(id))
        case 'restart':
          await reconciler.restart(id)
          return json(reconciler.stateOf(id))
        case 'scale': {
          const { replicas } = await body<{ replicas?: number }>()
          registry.setReplicas(id, replicas ?? 1)
          await reconciler.applyScale(id)
          return json(reconciler.stateOf(id))
        }
        default:
          break
      }
    }
    return errorResponse('not-found', `no route for ${method} on services/${id}`, 404)
  }
}
