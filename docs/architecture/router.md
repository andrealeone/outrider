# Router

`src/daemon/router.ts` and `src/daemon/router/` implement routing natively:
an in-process reverse proxy backed by the registry's own route table. There
is no external CLI, no state-directory handshake, and no "unavailable" mode —
the proxy is part of the daemon and is always there. Everything reaches it
through the `Router` interface (`src/shared/types/router.d.ts`), so the
engine underneath can change without callers noticing.

**Five parts, one owner.**

- `router/route-table.ts` — registry-backed route CRUD, hostname computation
  (label + TLD), and conflict checks. Global uniqueness is enforced per
  hostname.
- `router/proxy-engine.ts` — the listener. Plain mode is `node:http` on
  80 (falling back to 1354); TLS mode is `node:http2` with `allowHTTP1` on
  443 (falling back to 1355). The IPv4 wildcard (`0.0.0.0`) is bound first
  (required on macOS for unprivileged 80/443); a second listener on `::`
  with `ipv6Only` covers `*.localhost` resolving to `::1`. Forwarding is a
  raw HTTP/1.1 client to `127.0.0.1:<port>` (not `fetch` — fetch forbids or
  overrides the Host header, and when the proxy itself is on port 80 that
  reconnects to `*.localhost` and 508s). Bodies stream both ways, Host is
  restated (HTTP/2's `:authority` is stripped and reissued as `host`), and
  every forward is stamped with `x-outrider-hop` — a second pass through the
  proxy answers 508 Loop Detected. WebSocket/HMR upgrades hijack the raw
  socket on `'upgrade'` and splice it to a plain `net.connect` against the
  target.
- `router/cert-authority.ts` — mints a local CA and one leaf certificate
  covering every registered hostname (openssl subprocesses only, no bundled
  crypto library), re-minted and hot-swapped in place (`setSecureContext`)
  whenever the hostname set changes. Trust-store enrolment needs root and a
  terminal, so it's exported for a foreground command to call — the daemon
  itself never elevates.
- `router/hosts-sync.ts` — the `/etc/hosts` marked block, needed only for
  TLDs other than `.localhost` (Chromium/Firefox resolve `.localhost`
  natively). Also foreground-only.
- `router/quirks.ts` — the framework `--port`/`--host` flag table for dev
  servers that ignore the injected `PORT` (Vite, Astro, Expo, React Router,
  Angular), applied by the supervisor at spawn time.

**Registration.** `register(hostname, port, kind, service)` is an idempotent
upsert: re-registering the same owner just refreshes the port; a hostname
claimed by a different service is a conflict, not a silent takeover. `kind`
is `managed` (the daemon owns the port, tied to a supervised service) or
`static` (a pinned port the command already owns — see below). Terminal
service states unregister their route; `list()` reports each route's
liveness via a short-cached TCP dial to its port.

**Static aliases.** Some processes manage their own fixed port and ignore the
injected `PORT` (`kubectl port-forward`, `tsh proxy`, `docker run -p`). These
are still spawned commands — `routeKind` on the `ServiceEntry` is set to
`'static'` whenever a service pins its port via `aliasPort` (the CLI/TUI
"alias port" field), and the reconciler passes that `kind` straight through
to `register()`. No separate registration path exists; a static alias is a
managed service with a pinned port.

**Proxy lifecycle.** `ensureReady()` mints the CA/leaf (TLS mode only) and
starts the listener; it's called once at daemon boot and again, idempotently,
before the first `register()`. **TLS defaults to off.** Bun's `node:http2`
shim currently rejects TLS connections whose ALPN offer omits `h2` — exactly
what browsers send when opening a WebSocket connection — so enabling TLS by
default would silently break WebSockets/HMR. The CA, leaf minting, hot-swap,
and hosts-sync machinery are fully built and tested; they're simply not
switched on until that upstream bug is fixed. `inspect()` reports listener,
TLS, cert-trust, and hosts-sync status plus actionable issues; `outrider on`
calls it and runs the foreground repair (trust enrolment, hosts sync) when
TLS is on and something has drifted.

**Hostname policy.** `.localhost` by default (browsers resolve it natively),
`.test` as the alternative; `.local` (mDNS collision) and `.dev`
(Google-owned, HSTS-forced) are refused. Route labels are validated at
import: lowercase DNS labels, unique system-wide. There is no reserved-name
list — that was a portless-CLI-subcommand constraint that no longer applies.

**Probing.** Health checks never go through the proxy: they dial the
service's port directly. Bun's `fetch` cannot self-connect to the daemon's
own `node:http2` TLS listener from within the same process (confirmed
independently of this codebase, unrelated to the ALPN issue above), and a
health check shouldn't depend on the proxy being up anyway.
