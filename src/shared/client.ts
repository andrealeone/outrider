import type {
  ApiError,
  DaemonEvent,
  DaemonInfo,
  ImportBody,
  ImportReport,
  LogLine,
  PatchServiceBody,
  ServiceDefinition,
  ServiceState,
  StateSnapshot,
  UpDownBody,
} from './types/protocol'
import type { RegistryModel } from './types/registry'

import { ApiCallError, DaemonUnreachableError, ProtocolMismatchError } from './client-errors'
import { socketPath } from './utils/paths'
import { PROTOCOL_VERSION } from './version'

export { ApiCallError, DaemonUnreachableError, ProtocolMismatchError } from './client-errors'

export class Client {
  constructor(readonly socket: string = socketPath) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response
    try {
      res = await fetch(`http://outrider${path}`, {
        method,
        unix: this.socket,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new DaemonUnreachableError(this.socket)
    }
    const payload = (await res.json().catch(() => null)) as T | ApiError | null
    if (!res.ok) {
      const err = payload as ApiError | null
      throw new ApiCallError(err?.error.code ?? 'internal', err?.error.message ?? res.statusText)
    }
    return payload as T
  }

  /** Version handshake; throws ProtocolMismatchError on a stale daemon. */
  async info(): Promise<DaemonInfo> {
    const info = await this.request<DaemonInfo>('GET', '/v1/info')
    if (info.protocol !== PROTOCOL_VERSION) throw new ProtocolMismatchError(info.protocol)
    return info
  }

  async ping(): Promise<boolean> {
    try {
      await this.info()
      return true
    } catch (err) {
      if (err instanceof ProtocolMismatchError) throw err
      return false
    }
  }

  state = (): Promise<StateSnapshot> => this.request('GET', '/v1/state')
  registry = (): Promise<RegistryModel> => this.request('GET', '/v1/registry')

  up = (body: UpDownBody = {}): Promise<ServiceState[]> => this.request('POST', '/v1/up', body)
  down = (body: UpDownBody = {}): Promise<ServiceState[]> => this.request('POST', '/v1/down', body)

  start = (id: string): Promise<ServiceState> =>
    this.request('POST', `/v1/services/${encodeURIComponent(id)}/start`)
  stop = (id: string): Promise<ServiceState> =>
    this.request('POST', `/v1/services/${encodeURIComponent(id)}/stop`)
  restart = (id: string): Promise<ServiceState> =>
    this.request('POST', `/v1/services/${encodeURIComponent(id)}/restart`)
  scale = (id: string, replicas: number): Promise<ServiceState> =>
    this.request('POST', `/v1/services/${encodeURIComponent(id)}/scale`, { replicas })

  patchService = (id: string, body: PatchServiceBody): Promise<ServiceState> =>
    this.request('PATCH', `/v1/services/${encodeURIComponent(id)}`, body)
  addService = (def: ServiceDefinition): Promise<ServiceState> =>
    this.request('POST', '/v1/services', def)
  removeService = (id: string): Promise<void> =>
    this.request('DELETE', `/v1/services/${encodeURIComponent(id)}`)
  validateService = (def: ServiceDefinition): Promise<{ ok: boolean; errors: string[] }> =>
    this.request('POST', '/v1/services/validate', def)

  importStack = (body: ImportBody): Promise<ImportReport> =>
    this.request('POST', '/v1/import', body)
  removeStack = (name: string): Promise<void> =>
    this.request('DELETE', `/v1/stacks/${encodeURIComponent(name)}`)

  logs = (id: string, tail = 200): Promise<LogLine[]> =>
    this.request('GET', `/v1/services/${encodeURIComponent(id)}/logs?tail=${tail}`)

  shutdown = (): Promise<void> => this.request('POST', '/v1/shutdown')

  /** Subscribe to the event stream; returns an unsubscribe function. */
  events(onEvent: (event: DaemonEvent) => void, onClose?: () => void): () => void {
    const ws = new WebSocket(`ws+unix://${this.socket}:/v1/events`)
    ws.onmessage = (msg) => {
      onEvent(JSON.parse(String(msg.data)) as DaemonEvent)
    }
    ws.onclose = () => onClose?.()
    ws.onerror = () => onClose?.()
    return () => {
      ws.close()
    }
  }
}
