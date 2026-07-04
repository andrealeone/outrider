# Guide: add a routed service

Goal: a service reachable at `https://api.localhost` with no port to remember.

## Prerequisite

Install the portless CLI once (`bun add -g portless`). The daemon starts and
repairs the proxy itself; on first start portless creates a local CA, trusts
it, and binds 443.

Binding 443 needs root, so portless auto-elevates with `sudo` — which
requires an interactive terminal for the password prompt. The daemon spawns
the proxy headlessly (launchd/systemd, no TTY), so that elevation silently
fails and portless falls back to an unprivileged port (1355), giving you
`https://api.localhost:1355` instead of the clean `https://api.localhost`.
The daemon logs `portless proxy did not come up; run "portless doctor" to
check` when this happens. Fix it once, permanently, by installing portless as
an OS-level service with its own privileged binding:

```bash
sudo portless service install
```

Run that interactively (it needs your password) and the proxy comes up on
443 at every boot, independent of outrider's daemon — no more silent
fallback.

## In a stack file

```yaml
processes:
  api:
    command: bun run server.ts # reads PORT from the environment
    x-portless:
      route: api
    readiness_probe:
      http_get:
        path: /healthz # probed through the route (the user path)
```

Import the stack and toggle `api` up. At start the daemon allocates an
ephemeral port, injects `PORT`, `PORTLESS_URL`, and `OUTRIDER_URL`, registers
the route, and the dashboard shows the URL in the ROUTE column.

## The x-portless fields

- `route` (required): the hostname label. Must be a lowercase DNS label,
  unique system-wide, and not a reserved portless subcommand name.
- `framework` (default `auto`): quirk-table hint for tools that ignore
  `PORT`: Vite, Astro, Expo, React Router, and Angular get `--port` appended
  automatically (`auto` sniffs the command; `none` disables).
- `port`: a fixed port for services that cannot honour an injected `PORT`,
  used in place of an ephemeral allocation. The route is still daemon-managed:
  registered under the daemon's pid and pruned when it dies.
- `alias` (requires `port`): register a static portless alias (pid 0) at
  `port` instead, for external tools that own their port and ignore the
  injected `PORT` (`kubectl port-forward`, `tsh proxy`). The daemon clears
  these on boot and shutdown since portless never prunes them.

## In the TUI

`a` → fill name and command → set `route` to the label → save. Same effect,
no file. Fill the **alias port** field too if the command owns a fixed port
(the form's `alias` equivalent).

## Sharing beyond localhost

Portless already handles LAN, Tailscale, and ngrok exposure; use its own
commands for that (`portless proxy start --lan`, etc.). outrider deliberately
passes through rather than wrapping it.
