# Guide: add a routed service

Goal: a service reachable at `https://api.localhost` with no port to remember.

## Prerequisite

Install the portless CLI once (`bun add -g portless`). The daemon starts and
repairs the proxy itself; on first start portless creates a local CA, trusts
it, and binds 443.

## In a stack file

```yaml
processes:
  api:
    command: bun run server.ts # reads PORT from the environment
    x-portless:
      route: api
    readiness_probe:
      http_get:
        path: /healthz # probed through the route — the user path
```

Import the stack and toggle `api` up. At start the daemon allocates an
ephemeral port, injects `PORT`, `PORTLESS_URL`, and `OUTRIDER_URL`, registers
the route, and the dashboard shows the URL in the ROUTE column.

## The three x-portless fields

- `route` (required) — the hostname label. Must be a lowercase DNS label,
  unique system-wide, and not a reserved portless subcommand name.
- `framework` (default `auto`) — quirk-table hint for tools that ignore
  `PORT`: Vite, Astro, Expo, React Router, and Angular get `--port` appended
  automatically (`auto` sniffs the command; `none` disables).
- `port` — a fixed port for services that cannot honour an injected `PORT`;
  registered as a static alias instead of an ephemeral allocation.

## In the TUI

`a` → fill name and command → set `route` to the label → save. Same effect,
no file.

## Sharing beyond localhost

Portless already handles LAN, Tailscale, and ngrok exposure; use its own
commands for that (`portless proxy start --lan`, etc.). outrider deliberately
passes through rather than wrapping it.
