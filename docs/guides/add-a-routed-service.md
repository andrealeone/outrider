# Guide: add a routed service

Goal: a service reachable at `http://api.localhost` with no port to remember.

## Prerequisite

None. Routing is built into the daemon — no external CLI, no separate
install step. The in-process proxy starts itself the first time any service
registers a route.

TLS (`https://`) is currently off by default: Bun's `node:http2` shim has a
bug that rejects the ALPN offer real browsers send for WebSocket connections,
which would silently break HMR/WebSockets if TLS were on. Routes serve over
plain `http://` until that's fixed upstream — see
[the router](../architecture/router.md) for the full story and
[the compatibility report](../compatibility-report.md).

## In a compose file

```yaml
processes:
  api:
    command: bun run server.ts # reads PORT from the environment
    x-route:
      route: api
    readiness_probe:
      http_get:
        path: /healthz # probed directly on PORT, not through the route
```

Import it, approve `api` on its review page, and toggle it up. At start the daemon allocates a free
port (in the conventional 4000-4999 range), injects `PORT` and
`OUTRIDER_URL`, registers the route, and the dashboard shows the URL in the
ROUTE column.

## The x-route fields

- `route` (required): the hostname label. Must be a lowercase DNS label,
  unique system-wide.
- `framework` (default `auto`): quirk-table hint for tools that ignore
  `PORT`: Vite, Astro, Expo, React Router, and Angular get `--port` appended
  automatically (`auto` sniffs the command; `none` disables).
- `port`: a fixed port for services that cannot honour an injected `PORT`,
  used in place of an allocated one. The route is still daemon-managed
  (`kind: managed`) — this just pins the number.

## Static aliases

Some processes manage their own fixed port and ignore `PORT` entirely
(`kubectl port-forward`, `tsh proxy`, `docker run -p`). These are still
services outrider spawns — set the **alias port** field (CLI/TUI add-service
form) to the fixed port the command already owns. The registry marks the
route `kind: static` instead of `managed`, which only changes how its
liveness is reported (an on-demand TCP dial rather than mirroring supervisor
state); registration and env injection work exactly the same way.

## In the TUI

`a` → fill name and command → set `route` to the label → save. Same effect,
no file. Fill the **alias port** field too if the command owns a fixed port.

## Sharing beyond localhost

Not built in. Point `tailscale serve` or `ngrok` at the service's own port
(shown in the TUI detail view) yourself.
