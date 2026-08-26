import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type OutgoingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http'
import {
  createSecureServer,
  type Http2SecureServer,
  type Http2ServerRequest,
  type Http2ServerResponse,
} from 'node:http2'
import { connect } from 'node:net'
import type { Duplex } from 'node:stream'

import type { RouteTable } from '@/daemon/router/route-table'

/** Stamped on every forwarded request; a request arriving with it already set looped. */
const HOP_HEADER = 'x-outrider-hop'

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
])

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
  host: string,
): Promise<BindResult> =>
  new Promise((resolve, reject) => {
    const tryFallback = (err: NodeJS.ErrnoException): void => {
      if (err.code !== 'EACCES' && err.code !== 'EADDRINUSE') {
        reject(err)
        return
      }

      server.removeAllListeners('error')
      server.once('error', reject)
      server.listen(fallback, host, () => {
        resolve({ port: boundPort(server) })
      })
    }

    server.once('error', tryFallback)
    server.listen(primary, host, () => {
      server.removeListener('error', tryFallback)
      resolve({ port: boundPort(server) })
    })
  })

const listenOn = (server: AnyServer, port: number, options: object): Promise<void> =>
  new Promise((resolve, reject) => {
    const onError = (err: Error): void => {
      reject(err)
    }

    server.once('error', onError)
    server.listen({ port, ...options }, () => {
      server.removeListener('error', onError)
      resolve()
    })
  })

/**
 * The routing proxy: one listener forwarding by Host header. Plain mode is
 * node:http on 80/1354; TLS mode is node:http2 with allowHTTP1 on 443/1355,
 * serving the CA-signed leaf unconditionally (no SNI selection) and
 * hot-swapping it in place when the hostname set changes.
 *
 * Forwarding uses a raw HTTP/1.1 client to 127.0.0.1 rather than fetch:
 * fetch forbids/overrides the Host header and, when the proxy itself is on
 * port 80, will reconnect to Host: *.localhost (i.e. back to the proxy)
 * instead of the upstream, which 508s every routed request.
 */
export class ProxyEngine {
  private readonly servers: AnyServer[] = []
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

  private createListener(): AnyServer {
    const server = this.leafCert
      ? createSecureServer({ ...this.leafCert(), allowHTTP1: true }, (req, res) => {
          this.handleRequest(req, res)
        })
      : createServer((req, res) => {
          this.handleRequest(req, res)
        })

    server.on('upgrade', (req: AnyRequest, socket: Duplex, head: Buffer) => {
      this.handleUpgrade(req, socket, head)
    })

    return server
  }

  async start(): Promise<number> {
    if (this.boundPort !== undefined) return this.boundPort

    // IPv4 wildcard first: on macOS this is what earns the Mojave unprivileged
    // bind of 80/443. Loopback-only binds of those ports still need root.
    const v4 = this.createListener(),
      { port } = await listenWithFallback(v4, this.primaryPort, this.fallbackPort, '0.0.0.0')

    this.servers.push(v4)
    this.boundPort = port

    // *.localhost resolves to ::1 as well as 127.0.0.1; an IPv4-only listener
    // leaves Safari/curl Happy Eyeballs connecting at [::1] with nobody home.
    const v6 = this.createListener()

    try {
      await listenOn(v6, port, { host: '::', ipv6Only: true })

      this.servers.push(v6)
    } catch {
      v6.close()
    }

    return port
  }

  /** Hot-swap the served certificate in place; no restart, no dropped connections. */
  setCert(leaf: LeafCert): void {
    for (const server of this.servers)
      if ('setSecureContext' in server) server.setSecureContext(leaf)
  }

  stop(): void {
    for (const server of this.servers.splice(0)) server.close()

    this.boundPort = undefined
  }

  private hostnameOf(req: AnyRequest): string | undefined {
    // HTTP/2 conveys the target via the :authority pseudo-header, not Host.
    const raw = req.headers.host ?? req.headers[':authority'],
      host = Array.isArray(raw) ? raw[0] : raw

    return host?.split(':')[0]
  }

  /** Strip hop-by-hop and HTTP/2 pseudo-headers; restate Host for the upstream. */
  private forwardHeaders(req: AnyRequest, hostname: string): OutgoingHttpHeaders {
    const headers: OutgoingHttpHeaders = {}

    for (const [key, value] of Object.entries(req.headers)) {
      if (key.startsWith(':') || value === undefined || HOP_BY_HOP.has(key)) continue
      headers[key] = value
    }

    headers.host = hostname
    headers[HOP_HEADER] = '1'

    return headers
  }

  // ServerResponse and Http2ServerResponse overload writeHead differently
  // enough that a union call site cannot resolve; this isolates the cast.
  private respondHead(res: AnyResponse, status: number, headers: OutgoingHttpHeaders): void {
    ;(res.writeHead as (status: number, headers: OutgoingHttpHeaders) => void)(status, headers)
  }

  private notFoundBody(): string {
    const routes = this.routes.list(),
      lines = routes.length
        ? routes.map((r) => `  ${r.hostname} -> 127.0.0.1:${r.port}`).join('\n')
        : '  (no routes registered)'

    return `404 Not Found\n\nNo service is routed at this hostname. Registered routes:\n${lines}\n`
  }

  private handleRequest(req: AnyRequest, res: AnyResponse): void {
    if (req.headers[HOP_HEADER]) {
      this.respondHead(res, 508, { 'content-type': 'text/plain' })

      res.end(
        '508 Loop Detected: this request already passed through the outrider proxy. ' +
          'A dev server proxying to a sibling route must rewrite the Host header (set changeOrigin: true).',
      )

      return
    }

    const hostname = this.hostnameOf(req),
      route = hostname ? this.routes.get(hostname) : undefined

    if (!route) {
      this.respondHead(res, 404, { 'content-type': 'text/plain' })
      res.end(this.notFoundBody())
      return
    }

    if (this.boundPort !== undefined && route.port === this.boundPort) {
      this.respondHead(res, 508, { 'content-type': 'text/plain' })
      res.end('508 Loop Detected: this route points at the proxy listener itself.')
      return
    }

    const method = req.method ?? 'GET',
      hasBody = method !== 'GET' && method !== 'HEAD'

    const upstream = httpRequest(
      {
        hostname: '127.0.0.1',
        port: route.port,
        method,
        path: req.url ?? '/',
        headers: this.forwardHeaders(req, hostname as string),
      },
      (upRes) => {
        const headers: OutgoingHttpHeaders = {}
        for (const [key, value] of Object.entries(upRes.headers)) {
          if (value === undefined || HOP_BY_HOP.has(key)) continue
          headers[key] = value
        }
        this.respondHead(res, upRes.statusCode ?? 502, headers)
        upRes.pipe(res)
      },
    )

    upstream.on('error', (err: Error) => {
      if (res.headersSent) {
        res.destroy()
        return
      }

      this.respondHead(res, 502, { 'content-type': 'text/plain' })

      res.end(`502 Bad Gateway: ${err.message}`)
    })

    req.on('aborted', () => {
      upstream.destroy()
    })

    if (hasBody) req.pipe(upstream)
    else upstream.end()
  }

  /** WebSocket/HMR upgrades bypass HTTP forwarding: hijack the raw socket and splice it. */
  private handleUpgrade(req: AnyRequest, clientSocket: Duplex, head: Buffer): void {
    const hostname = this.hostnameOf(req),
      route = hostname ? this.routes.get(hostname) : undefined

    if (!route) {
      clientSocket.destroy()
      return
    }

    const target = connect(route.port, '127.0.0.1', () => {
      let headerLines = `${req.method} ${req.url} HTTP/1.1\r\n`

      for (let i = 0; i < req.rawHeaders.length; i += 2)
        headerLines += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`

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
