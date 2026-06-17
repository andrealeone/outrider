# portless routing

Routing is opt-in per service. A routed service answers on a hostname like
`api.localhost` through the [portless](https://www.npmjs.com/package/portless)
proxy instead of a port you have to remember.

Give a service a **route** (the hostname label, e.g. `api` → `api.localhost`)
and the daemon, by default, picks a free port, registers the route, and injects
`PORT` into the process environment. The service binds `PORT`; the proxy maps
the hostname to it. Because the managed route is registered under the daemon's
pid, portless prunes it automatically if the daemon dies.

Some tools bind a fixed port of their own and ignore an injected `PORT`
(`kubectl port-forward`, `tsh proxy`, and the like). For those, set an **alias
port**: the route becomes a static portless alias pointing straight at that
fixed port. Aliases use pid 0 and survive portless's stale-route cleanup, so
the daemon clears its own on boot and shutdown.

Route names are unique system-wide and must be valid DNS labels; conflicts fail
the operation, naming both claimants. The `framework` hint (config only) feeds
a quirk table that appends `--port` for tools that need it on the command line
rather than via the environment.

Configuration details and the `x-portless` block are in the
[config schema](../config-schema.md); the proxy bridge itself is the
[router](../architecture/router.md).
