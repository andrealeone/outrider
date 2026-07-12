import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  createSecureServer,
  type Http2SecureServer,
  type Http2ServerRequest,
  type Http2ServerResponse,
} from 'node:http2'
import { connect } from 'node:net'
import { Readable, type Duplex } from 'node:stream'

import type { RouteTable } from '@/daemon/router/route-table'

/** Stamped on every forwarded request; a request arriving with it already set looped. */
const HOP_HEADER = 'x-outrider-hop'

export interface LeafCert {
  key: Buffer
  cert: Buffer
}

type AnyServer = Server | Http2SecureServer
type AnyRequest = IncomingMessage | Http2ServerRequest
type AnyResponse = ServerResponse | Http2ServerResponse

interface BindResult {
  port: number
}

/** The real bound port, which differs from the requested one when it was 0 (ephemeral). */
const boundPort = (server: AnyServer): number => {
  const address = server.address()
  return typeof address === 'object' && address !== null ? address.port : 0
}

/** Bind primary, falling back to a well-known alternate on EACCES/EADDRINUSE. */
const listenWithFallback = (
  server: AnyServer,
  primary: number,
  fallback: number,
): Promise<BindResult> =>
  new Promise((resolve, reject) => {
    const tryFallback = (err: NodeJS.ErrnoException): void => {
      if (err.code !== 'EACCES' && err.code !== 'EADDRINUSE') {
        reject(err)
        return
      }
      server.removeAllListeners('error')
      server.once('error', reject)
      server.listen(fallback, '0.0.0.0', () => {
        resolve({ port: boundPort(server) })
      })
    }
    server.once('error', tryFallback)
    server.listen(primary, '0.0.0.0', () => {
      server.removeListener('error', tryFallback)
      resolve({ port: boundPort(server) })
    })
  })

/**
 * The routing proxy: one listener forwarding by Host header. Plain mode is
 * node:http on 80/1354; TLS mode is node:http2 with allowHTTP1 on 443/1355,
 * serving the CA-signed leaf unconditionally (no SNI selection) and
 * hot-swapping it in place when the hostname set changes.
 */
export class ProxyEngine {
  private server?: AnyServer
  private boundPort?: number

  constructor(
    private readonly routes: RouteTable,
    private readonly primaryPort: number,
    private readonly fallbackPort: number,
    private readonly leafCert?: () => LeafCert,
  ) {}

  get port(): number | undefined {
    return this.boundPort
  }

  get tls(): boolean {
    return this.leafCert !== undefined
  }

  async start(): Promise<number> {
    if (this.server) return this.boundPort as number
    const server = this.leafCert
      ? createSecureServer(
          { ...this.leafCert(), allowHTTP1: true },
          (req, res) => void this.handleRequest(req, res),
        )
      : createServer((req, res) => void this.handleRequest(req, res))
    server.on('upgrade', (req: AnyRequest, socket: Duplex, head: Buffer) => {
      this.handleUpgrade(req, socket, head)
    })
    const { port } = await listenWithFallback(server, this.primaryPort, this.fallbackPort)
    this.server = server
    this.boundPort = port
    return port
  }

  /** Hot-swap the served certificate in place; no restart, no dropped connections. */
  setCert(leaf: LeafCert): void {
    if (this.server && 'setSecureContext' in this.server) {
      this.server.setSecureContext(leaf)
    }
  }

  stop(): void {
    this.server?.close()
    this.server = undefined
    this.boundPort = undefined
  }

  private hostnameOf(req: AnyRequest): string | undefined {
    // HTTP/2 conveys the target via the :authority pseudo-header, not Host.
    const raw = req.headers.host ?? req.headers[':authority']
    const host = Array.isArray(raw) ? raw[0] : raw
    return host?.split(':')[0]
  }

  /** Strip HTTP/2 pseudo-headers (:authority, :method, ...) and restate Host explicitly. */
  private forwardHeaders(req: AnyRequest, hostname: string): Record<string, string> {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.startsWith(':') || value === undefined) continue
      headers[key] = Array.isArray(value) ? value.join(', ') : value
    }
    headers.host = hostname
    return headers
  }

  // ServerResponse and Http2ServerResponse overload writeHead differently
  // enough that a union call site cannot resolve; this isolates the cast.
  private respondHead(res: AnyResponse, status: number, headers: Record<string, string>): void {
    ;(res.writeHead as (status: number, headers: Record<string, string>) => void)(status, headers)
  }

  private notFoundBody(): string {
    const routes = this.routes.list()
    const lines = routes.length
      ? routes.map((r) => `  ${r.hostname} -> 127.0.0.1:${r.port}`).join('\n')
      : '  (no routes registered)'
    return `404 Not Found\n\nNo service is routed at this hostname. Registered routes:\n${lines}\n`
  }

  private async handleRequest(req: AnyRequest, res: AnyResponse): Promise<void> {
    if (req.headers[HOP_HEADER]) {
      this.respondHead(res, 508, { 'content-type': 'text/plain' })
      res.end(
        '508 Loop Detected: this request already passed through the outrider proxy. ' +
          'A dev server proxying to a sibling route must rewrite the Host header (set changeOrigin: true).',
      )
      return
    }

    const hostname = this.hostnameOf(req)
    const route = hostname ? this.routes.get(hostname) : undefined
    if (!route) {
      this.respondHead(res, 404, { 'content-type': 'text/plain' })
      res.end(this.notFoundBody())
      return
    }

    try {
      const method = req.method ?? 'GET'
      const hasBody = method !== 'GET' && method !== 'HEAD'
      const upstream = await fetch(`http://127.0.0.1:${route.port}${req.url}`, {
        method,
        headers: { ...this.forwardHeaders(req, hostname as string), [HOP_HEADER]: '1' },
        body: hasBody ? Readable.toWeb(req as IncomingMessage) : undefined,
        // Required by fetch when streaming a request body.
        duplex: hasBody ? 'half' : undefined,
        redirect: 'manual',
      } as unknown as RequestInit)

      const headers: Record<string, string> = {}
      upstream.headers.forEach((value, key) => {
        if (key === 'transfer-encoding') return
        headers[key] = value
      })
      this.respondHead(res, upstream.status, headers)
      if (upstream.body) Readable.fromWeb(upstream.body as never).pipe(res)
      else res.end()
    } catch (err) {
      this.respondHead(res, 502, { 'content-type': 'text/plain' })
      res.end(`502 Bad Gateway: ${(err as Error).message}`)
    }
  }

  /** WebSocket/HMR upgrades bypass fetch: hijack the raw socket and splice it. */
  private handleUpgrade(req: AnyRequest, clientSocket: Duplex, head: Buffer): void {
    const hostname = this.hostnameOf(req)
    const route = hostname ? this.routes.get(hostname) : undefined
    if (!route) {
      clientSocket.destroy()
      return
    }

    const target = connect(route.port, '127.0.0.1', () => {
      let headerLines = `${req.method} ${req.url} HTTP/1.1\r\n`
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        headerLines += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`
      }
      headerLines += '\r\n'
      target.write(headerLines)
      if (head.length > 0) target.write(head)
      clientSocket.pipe(target)
      target.pipe(clientSocket)
    })
    target.on('error', () => {
      clientSocket.destroy()
    })
    clientSocket.on('error', () => {
      target.destroy()
    })
  }
}
