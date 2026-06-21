# Feature analysis: companion API server

**Status:** proposed, not built. Largest of the three open requests; needs the most
analysis before any line is written.

## The request

A companion HTTP API server, shipped as a standalone **Next.js** app living in a new
`/api` folder at the repository root. It is activated and deactivated through the CLI:

```bash
outrider api on    # start the companion server
outrider api off   # stop it
```

It has its **own compilation process**, entirely separate from the single-binary CLI,
and must not drag web tooling into the core build.

## Why

The daemon already speaks a clean JSON command-and-event protocol — but only over a
unix domain socket, reachable only from the local machine by a process with filesystem
access to the socket. That is exactly right for the CLI and TUI. It is the wrong shape
for three audiences this server would serve:

- **Browsers** — a web dashboard or status page that talks HTTP, not a unix socket.
- **Remote and scripted clients** — anything off-box, or anything that prefers REST to
  a raw socket protocol.
- **Richer surfaces** — a hosted control panel, webhooks, or integrations that want a
  stable, documented HTTP contract.

The companion server is a thin HTTP front for the existing socket API, not a second
source of truth. The daemon stays the only writer.

## What this reopens

Two decisions in [`specifics.md`](../../specifics.md) were made deliberately and this
feature reopens both. They must be settled here first.

- **"No TCP listener in v1."** The control plane is unix-socket only, which is what lets
  the daemon skip token auth. An HTTP server that binds a TCP port — even on loopback —
  changes the trust boundary. The server should bridge to the daemon *over the existing
  socket* and own its own auth, rather than the daemon growing a TCP listener.
- **"User-only socket permissions, so v1 needs no token auth."** Any HTTP surface needs
  an explicit auth story: at minimum a local-only bind (`127.0.0.1`) plus a token, and a
  clear answer for remote use. This is the single most important open question.

## Architecture sketch

```
browser / remote client
        │  HTTP + auth
        ▼
  Next.js app  (/api, separate build)
        │  unix socket: existing /v1 JSON + event stream
        ▼
     daemon  (unchanged trust model)
```

- The Next.js app is a **client of the daemon**, connecting to
  `$XDG_RUNTIME_DIR/outrider.sock` exactly as the CLI and TUI do. It reuses the shared
  socket client and protocol `.d.ts` files rather than reimplementing them.
- Route handlers map HTTP verbs to socket commands; an SSE or WebSocket endpoint
  re-exposes the daemon event stream to browsers.
- `outrider api on` / `off` supervise the Next.js process. Open question: is the server
  just another managed service in the registry (eating its own dog food), or a
  special-cased child of the daemon? The former is elegant and nearly free; the latter
  avoids a bootstrap loop.

## Build and packaging

- The `/api` app compiles with the Next.js toolchain, **independent** of
  `bun build --compile`. The CLI binary stays lean; no React-DOM, no Next runtime, no
  web dependencies leak into it.
- Distribution is the open question: is the API server bundled with the binary, fetched
  on first `api on`, or run from source? Each has a trade-off between binary size, the
  single-file install promise, and update cadence.
- The "any dependency beyond ink, react, and portless needs written justification" rule
  applies to the *core*; the `/api` app is a separate dependency surface and should
  carry its own, smaller, justification policy documented alongside it.

## Open questions to settle before building

1. **Auth and binding.** Loopback-only by default? Token in `~/.config/outrider`? What
   is the remote-access story, and is it in scope at all for a first cut?
2. **Server lifetime.** Managed service vs. special-cased daemon child; what happens to
   it on `outrider off`.
3. **Distribution.** Bundled, fetched, or source — and how it updates in lockstep with
   the daemon protocol version (the handshake already guards mismatches).
4. **Scope of the first cut.** Read-only status API first, or full command parity with
   the socket from day one?
5. **Why Next.js specifically.** It implies a UI, not just an API. Is a web dashboard
   part of the intent, and does that pull in a front-end design effort?

## Risks

- **Trust-model creep.** The easy path — bind a TCP port on the daemon — quietly
  undoes the security posture. The bridge-over-socket shape must be held.
- **Build complexity.** A second toolchain in the repo is real maintenance cost and
  cuts against the single-executable simplicity that is a selling point.
- **Scope.** "Next.js app" can mean anything from a 50-line status JSON to a full
  hosted control panel. The first cut must be drawn tightly.
