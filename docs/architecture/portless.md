# Portless integration

## What is portless?

[Portless](https://portless.sh) is a local development reverse proxy with automatic
TLS termination. It maps ephemeral port numbers to human-friendly hostnames like
`api.localhost` or `db.localhost`, so you don't have to remember and manage port
numbers across your services.

At its core, portless:
- Runs a local reverse proxy listening on port 443 (HTTPS)
- Generates a self-signed CA and adds it to your system trust store
- Maps hostnames to ports via an alias table (`portless alias <hostname> <port>`)
- Automatically tears down stale routes when their owner process dies

Portless is explicitly pre-1.0 and warns that its state format may change between
releases. outrider pins to a specific version (currently 0.14.0) to avoid surprises.

## Why portless matters for outrider

Without portless, running multiple services means:
- Managing port numbers in your head (`api` on 3000, `worker` on 3001, etc.)
- Injecting `PORT` env vars and teaching each service to read them
- Remembering which service is on which port when debugging

With portless, outrider gives each routed service a stable hostname immediately.
The daemon allocates an ephemeral port, registers it with portless, and you access
the service at `api.localhost` without ever thinking about the port. This works in
browsers, curl, and any tool that speaks HTTPS.

## Integration in outrider

Portless integration lives in `src/daemon/router.ts` — the only file that imports
the portless library. This boundary was intentional: portless is pre-1.0 and may
change, so wrapping it in a clean interface means changes stay local.

### Lifecycle: starting and repairing the proxy

The daemon owns the proxy lifecycle. When the daemon starts (or resumes after a
crash), it calls `ensureProxy()` to:

1. Health-check the proxy: send an HTTP HEAD request to `127.0.0.1:443` and look
   for the `X-Portless` header
2. If the proxy is down, call `portless proxy start` via the CLI
3. If the proxy crashes during runtime, `ensureProxy()` detects it and restarts it

The daemon does **not** install portless as a system service unit. Exactly one
component must own proxy startup, and in outrider that is the daemon itself.

### Registering routes

When you add a routed service, outrider:

1. Allocates an ephemeral port and starts the service with `PORT` injected
2. Calls `RouteStore.addRoute(hostname, port, pid)` to register the route with
   portless under the daemon's pid
3. The route is now live: `https://hostname.localhost` proxies to your service

If portless crashes and the daemon restarts it, the daemon re-registers all active
routes automatically — they don't drop.

Portless cleans up routes when their owner process (identified by pid) dies. Since
outrider owns the daemon process, portless knows to prune the routes if the daemon
crashes. This prevents stale routes piling up.

### Static aliases for external tools

Some tools (like `kubectl port-forward` or `tsh proxy`) own a fixed port and
ignore the injected `PORT` environment variable. For these, outrider supports the
`x-portless.alias` field:

```yaml
processes:
  tunnel:
    command: kubectl port-forward svc/myservice 8080
    x-portless:
      port: 8080
      alias: true
      route: tunnel
```

With `alias: true`, the route is registered as a **static alias** (pid 0) pointing
directly at the fixed port. Portless never prunes pid-0 routes, so the daemon
takes over their lifecycle: it clears all known aliases on boot (and re-registers
the ones that come back up) and explicitly unregisters them when their service
stops.

Without the `alias: true` flag, a fixed port still works, but the route is managed
the normal way — portless owns cleanup, which may not suit external tools that
don't signal shutdown cleanly.

## Configuration: x-portless fields

The `x-portless` extension key under each process in a compose file controls
routing behavior. See [config-schema.md](../config-schema.md) for the complete
schema; here are the key fields:

### `route` (required for routed services)

The hostname label. Must be a lowercase DNS label, unique system-wide. Examples:
`api`, `web`, `db`. Becomes `api.localhost` or `api.test` depending on hostname
policy.

The label cannot be one of portless's reserved subcommand names (`proxy`, `alias`,
`install`, `uninstall`, etc.). Outrider validates labels at import time.

### `framework` (default: `auto`)

Tools like Vite, Astro, Expo, React Router, and Angular ignore the `PORT` env var
and require `--port` on the command line instead. The `framework` field tells
outrider to add the flag:

```yaml
x-portless:
  route: web
  framework: vite
```

Becomes: `vite --port $PORT` instead of `vite` with PORT injected.

Valid values:
- `auto` (default): sniff the command and apply known quirks (Vite, Astro, etc.)
- `none`: do not apply framework quirks
- Named hint: `vite`, `astro`, `expo`, `react-router`, `angular` — apply that
  quirk explicitly

The quirk table lives in `src/daemon/framework-quirks.ts` and applies only to
routed services.

### `port` (optional)

A fixed port for services that own their port and cannot accept an injected `PORT`.
When set, outrider uses this port instead of allocating an ephemeral one. The
route is still managed by the daemon — it gets registered under the daemon's pid.

Useful for:
- Services with hard-coded ports in their config
- Re-exposing ports from external tools via static aliases (see `alias` below)
- Services that bind to multiple ports and you want to expose one

### `alias` (requires `port`)

Only valid when `port` is set. When `true`, the route is registered as a static
portless alias (pid 0) instead of a managed route (daemon's pid).

Static aliases are for external tools that own their port outright:

```yaml
processes:
  tunnel:
    command: kubectl port-forward svc/api 8080
    x-portless:
      route: api
      port: 8080
      alias: true
```

The daemon clears all known aliases on boot and explicit unregisters them on
shutdown, but portless itself never prunes them. Use this for tools where you
can't rely on process-exit signaling to clean up the route.

## Hostname policy

Outrider restricts route labels to two hostname suffixes:

- `.localhost`: default, browsers resolve it natively to 127.0.0.1
- `.test`: IANA-reserved, also resolves to 127.0.0.1

It refuses:
- `.local`: uses mDNS, can collide with other services on the network
- `.dev`: Google-owned, subject to HSTS preloading rules, can cause real redirects
  to HTTPS from unencrypted requests in some browsers

When you set a route label like `api`, it automatically becomes `api.localhost`
(or `api.test` if you've configured that preference). You cannot add a domain
suffix yourself.

If you try to set a route with an unsupported suffix, outrider rejects it at
import time and falls back to `.localhost`.

## Troubleshooting

### "portless: command not found"

The portless CLI is not in your PATH. Routed services start without hostnames.

**Fix:** Install it with `bun add -g portless` and restart the daemon.

### "could not ensure proxy" errors in daemon logs

The daemon tried to start portless but failed. Usually means portless is not
installed or is misconfigured.

**Check:**
1. Is portless installed? `which portless`
2. Can you start the proxy manually? `portless proxy start`
3. Check `~/.local/share/outrider/daemon.log` for the full error

### Route label conflicts

You've tried to register two services with the same route label.

**Fix:** Route labels must be unique system-wide. Choose a different label for
the second service.

### "hostname policy refused .local"

You (or an imported compose file) tried to set a route with `.local` or `.dev`.

**Fix:** Use `.localhost` or `.test` instead. The route label is just the part
before the suffix, e.g. `api` becomes `api.localhost`.

## See also

- [add-a-routed-service guide](../guides/add-a-routed-service.md)
- [config-schema.md](../config-schema.md) — full `x-portless` schema
- [router.ts](../../src/daemon/router.ts) — implementation
- [Portless documentation](https://portless.sh)
