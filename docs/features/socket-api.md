# Socket API

Everything the CLI and TUI can do, they do by calling the same JSON API the
daemon exposes on its unix domain socket (`$XDG_RUNTIME_DIR/outrider.sock`, or
a cache-dir fallback if `XDG_RUNTIME_DIR` is unset). There is no separate
"scripting mode": the socket is the one control plane, so anything drivable
from the dashboard is drivable from a script, a cron job, or another
language's HTTP client, with no TUI involved.

Endpoints are versioned under `/v1` and speak plain HTTP verbs over the
socket (`GET /v1/state`, `POST /v1/services/:id/start`, ...); a WebSocket
upgrade at `/v1/events` pushes state changes, log lines, and probe results as
they happen, instead of requiring polling. Every error comes back as
`{ "error": { "code", "message" } }`, and `GET /v1/info` doubles as both a
liveness check and a protocol-version handshake.

Reasons to reach for it instead of the TUI:

- **Automation.** Bring a stack up or down from a deploy script, a git hook,
  or a Makefile target, with real exit-code-shaped feedback instead of
  scraping terminal output.
- **Editors and other tools.** Anything that wants live state (an editor
  extension, a status-bar widget) can subscribe to `/v1/events` rather than
  shelling out repeatedly.
- **Remote or headless boxes.** Whatever process has filesystem access to the
  socket can drive the daemon, TTY or not.

This is a local-only surface by design: the socket is reachable only by a
process on the same machine with permission to open it, which is also why v1
carries no auth token. Nothing here is reachable from a browser or another
host; see [the companion API server
proposal](../feature-analysis/companion-api-server.md) for the (currently
unbuilt) HTTP bridge that would change that.

For the endpoint-by-endpoint table, see the [CLI reference's socket API
section](../cli-reference.md#socket-api-the-contract-behind-every-command).
For a hands-on walkthrough of calling it, see the [socket API
guide](../guides/control-outrider-via-the-socket-api.md). For how the
dispatcher itself is built, see the [API architecture
note](../architecture/api.md).
