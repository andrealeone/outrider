# Router

`src/daemon/router.ts` is the only file that imports portless. Portless is
explicitly pre-1.0 and warns that its state format may change between
releases, so the `Router` interface (`src/shared/types/router.d.ts`) is the
contract, not just hygiene: a portless break stays local to one
implementation.

**Registration.** Portless's alias mechanism maps a hostname to a port
without wrapping the child command, which fits a daemon that already owns
spawning. Managed routes register through
`RouteStore.addRoute(hostname, port, pid)` under the daemon's pid: portless
prunes routes whose owner died, so a crashed daemon leaves no stale claims.
Force-claiming is off: a route held by a live foreign process is an error,
not a kill.

**Static aliases.** A route with `x-portless.alias: true` is registered under
pid 0 (the same static-route mechanism as `portless alias`) for external
tools that own their fixed port and ignore the injected `PORT`. portless never
prunes pid-0 routes, so the daemon takes over their lifecycle: the reconciler
clears every known alias on boot (the resume pass re-registers the ones that
come back up) and unregisters them when their service stops.

**Proxy lifecycle.** Exactly one component owns proxy startup, and it is this
daemon: `ensureProxy` health-checks the proxy (the `X-Portless` header on
127.0.0.1), and starts it via the portless CLI when absent, repairing it
after crashes and reboots. Without the CLI on PATH, routed services start
without hostnames and a named warning explains how to install it. Proxy
settings (port, TLS, TLD) are read from portless's own persisted state files.

**Hostname policy.** `.localhost` by default (browsers resolve it natively),
`.test` as the IANA-reserved alternative; `.local` (mDNS collision) and
`.dev` (Google-owned, HSTS-forced) are refused. Route labels are validated at
import: lowercase DNS labels, unique system-wide, and never one of portless's
reserved subcommand names.

**One transferred duty.** Portless's run wrapper injects `--port` flags for
frameworks that ignore `PORT` (Vite, Astro, Expo, React Router, Angular).
Since outrider owns spawning, the same quirk table lives in
`src/daemon/framework-quirks.ts`, applied to routed services only and
controllable per process via `x-portless.framework` (`auto` | `none` |
explicit hint).
