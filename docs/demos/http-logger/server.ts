// A minimal Bun HTTP server: answers /healthz, and every 15s logs a line so
// you can watch outrider collect, ring-buffer, and tail process output.
const port = Number(process.env.PORT ?? 3000)
let ticks = 0

setInterval(() => {
  ticks += 1
  console.log(`http-logger: tick ${ticks}`)
}, 15_000)

Bun.serve({
  port,
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === '/healthz') return new Response('ok')
    return new Response(`http-logger: ${ticks} ticks so far\n`)
  },
})

console.log(`http-logger: listening on :${port}`)
