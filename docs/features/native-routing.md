# Native routing

Routing is opt-in per service. A routed service answers on a hostname like
`api.localhost` through outrider's own in-process proxy — no external CLI,
no separate install, no dependency.

Give a service a **route** (the hostname label, e.g. `api` → `api.localhost`)
and the daemon, by default, picks a free port, registers the route, and
injects `PORT` into the process environment. The service binds `PORT`; the
proxy maps the hostname to it. This is a **managed** route.

Some tools bind a fixed port of their own and ignore an injected `PORT`
(`kubectl port-forward`, `tsh proxy`, `docker run -p`, and the like). For
those, set an **alias port**: the route still belongs to a service the
daemon spawns, but it's marked `kind: static` instead of `managed` — the only
difference is how its liveness is reported (an on-demand TCP dial rather than
mirroring supervisor state).

Route names are unique system-wide and must be valid DNS labels; conflicts
fail the operation, naming both claimants. The `framework` hint (config only)
feeds a quirk table that appends `--port` for tools that need it on the
command line rather than via the environment.

TLS (`https://`) is currently off by default — see
[the router](../architecture/router.md) for why and
[the compatibility report](../compatibility-report.md) for the full story.

Configuration details and the `x-route` block are in the
[config schema](../config-schema.md); the proxy itself is the
[router](../architecture/router.md).
