import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { Readable, type Duplex } from 'node:stream'

import type { RouteTable } from '@/daemon/router/route-table'

/** Stamped on every forwarded request; a request arriving with it already set looped. */
const HOP_HEADER = 'x-outrider-hop'

interface BindResult {
  port: number
}

/** Bind primary, falling back to a well-known alternate on EACCES/EADDRINUSE. */
const listenWithFallback = (server: Server, primary: number, fallback: number): Promise<BindResult> =>
  new Promise((resolve, reject) => {
    const tryFallback = (err: NodeJS.ErrnoException): void => {
      if (err.code !== 'EACCES' && err.code !== 'EADDRINUSE') {
        reject(err)
        return
      }
      server.removeAllListeners('error')
      server.once('error', reject)
      server.listen(fallback, '0.0.0.0', () => {
        resolve({ port: fallback })
      })
    }
    server.once('error', tryFallback)
    server.listen(primary, '0.0.0.0', () => {
      server.removeListener('error', tryFallback)
      resolve({ port: primary })
    })
  })

/**
 * The routing proxy: one plain HTTP listener forwarding by Host header.
 * TLS/HTTP2 arrives in Phase R2; this is the R1 plain-mode engine.
 */
export class ProxyEngine {
  private server?: Server
  private boundPort?: number

  constructor(
    private readonly routes: RouteTable,
    private readonly primaryPort: number,
    private readonly fallbackPort: number,
  ) {}

  get port(): number | undefined {
    return this.boundPort
  }

  async start(): Promise<number> {
    if (this.server) return this.boundPort as number
    const server = createServer((req, res) => void this.handleRequest(req, res))
    server.on('upgrade', (req, socket, head) => {
      this.handleUpgrade(req, socket, head)
    })
    const { port } = await listenWithFallback(server, this.primaryPort, this.fallbackPort)
    this.server = server
    this.boundPort = port
    return port
  }

  stop(): void {
    this.server?.close()
    this.server = undefined
    this.boundPort = undefined
  }

  private hostnameOf(req: IncomingMessage): string | undefined {
    return req.headers.host?.split(':')[0]
  }

  private notFoundBody(): string {
    const routes = this.routes.list()
    const lines = routes.length
      ? routes.map((r) => `  ${r.hostname} -> 127.0.0.1:${r.port}`).join('\n')
      : '  (no routes registered)'
    return `404 Not Found\n\nNo service is routed at this hostname. Registered routes:\n${lines}\n`
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.headers[HOP_HEADER]) {
      res.writeHead(508, { 'content-type': 'text/plain' })
      res.end(
        '508 Loop Detected: this request already passed through the outrider proxy. ' +
          'A dev server proxying to a sibling route must rewrite the Host header (set changeOrigin: true).',
      )
      return
    }

    const hostname = this.hostnameOf(req)
    const route = hostname ? this.routes.get(hostname) : undefined
    if (!route) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end(this.notFoundBody())
      return
    }

    try {
      const method = req.method ?? 'GET'
      const hasBody = method !== 'GET' && method !== 'HEAD'
      const upstream = await fetch(`http://127.0.0.1:${route.port}${req.url}`, {
        method,
        headers: { ...(req.headers as Record<string, string>), [HOP_HEADER]: '1' },
        body: hasBody ? Readable.toWeb(req) : undefined,
        // Required by fetch when streaming a request body.
        duplex: hasBody ? 'half' : undefined,
        redirect: 'manual',
      } as unknown as RequestInit)

      const headers: Record<string, string> = {}
      upstream.headers.forEach((value, key) => {
        if (key === 'transfer-encoding') return
        headers[key] = value
      })
      res.writeHead(upstream.status, headers)
      if (upstream.body) Readable.fromWeb(upstream.body as never).pipe(res)
      else res.end()
    } catch (err) {
      res.writeHead(502, { 'content-type': 'text/plain' })
      res.end(`502 Bad Gateway: ${(err as Error).message}`)
    }
  }

  /** WebSocket/HMR upgrades bypass fetch: hijack the raw socket and splice it. */
  private handleUpgrade(req: IncomingMessage, clientSocket: Duplex, head: Buffer): void {
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
