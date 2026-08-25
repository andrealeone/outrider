# Guide: control outrider via the socket API

Goal: drive outrider from a script instead of the TUI, talking directly to
the daemon's unix socket.

## Prerequisite

The daemon must be running (`outrider on`). Find the socket path: it's
`$XDG_RUNTIME_DIR/outrider.sock` if that variable is set, otherwise a cache
directory fallback (`src/shared/utils/paths.ts`). Most Linux setups export
`XDG_RUNTIME_DIR` (usually `/run/user/<uid>`) by default, so this resolves it
there. macOS doesn't set `XDG_RUNTIME_DIR` at all, so the same line falls
through to `~/.cache/outrider/outrider.sock`:

```bash
SOCK="${XDG_RUNTIME_DIR:-$HOME/.cache/outrider}/outrider.sock"
echo "$SOCK"
```

Export `$SOCK` once and reuse it in every command below, on either platform;
if you skip this and hardcode `$XDG_RUNTIME_DIR/outrider.sock` on macOS,
curl will fail with `Failed to connect to outrider port 80` because that
variable is empty and the path doesn't exist.

`curl` speaks unix sockets natively with `--unix-socket`; the host in the URL
is ignored but required, so `http://outrider/...` below is just a
placeholder.

## Handshake

Always check `/v1/info` first: it confirms the daemon is up and that its
protocol version matches what you built against, before you send it commands
it might not understand.

```bash
curl --unix-socket "$SOCK" http://outrider/v1/info
```

```json
{ "version": "0.0.0-rc.0", "protocol": 2, "pid": 4213, "startedAt": "..." }
```

## Read the current state

```bash
curl --unix-socket "$SOCK" http://outrider/v1/state
```

Returns `{ daemon, services }`, the same snapshot the dashboard renders from:
every service's status, health, instances, and (if routed) its URL.

## Start and stop services

`names` accepts service ids, stack names, namespaces, or
[tags](../features/service-tags.md); dependencies are included unless
`noDeps` is set.

```bash
curl --unix-socket "$SOCK" \
  -X POST -H 'content-type: application/json' \
  -d '{"names":["web-stack"]}' \
  http://outrider/v1/up

curl --unix-socket "$SOCK" \
  -X POST -H 'content-type: application/json' \
  -d '{"names":["web-stack"]}' \
  http://outrider/v1/down
```

Both return the resulting `ServiceState[]` for every affected id, so a
deploy script can inspect the outcome instead of guessing from an exit code.

For one service at a time, use the action routes:

```bash
curl --unix-socket "$SOCK" \
  -X POST http://outrider/v1/services/api/restart
```

## Tail logs

```bash
curl --unix-socket "$SOCK" \
  "http://outrider/v1/services/api/logs?tail=100"
```

## Subscribe to live events

For anything that wants to react to state changes instead of polling
`/v1/state`, open the WebSocket at `/v1/events`. `curl` can't do this; from
Bun or Node:

```ts
const sock = `${process.env.XDG_RUNTIME_DIR ?? `${process.env.HOME}/.cache/outrider`}/outrider.sock`
const ws = new WebSocket(`ws+unix://${sock}:/v1/events`)
ws.onmessage = (msg) => {
  const event = JSON.parse(String(msg.data))
  // { type: 'snapshot' | 'state' | 'registry' | 'log' | 'probe' | 'daemon', ... }
  console.log(event)
}
```

The first message on connect is always a `snapshot`, so a fresh client has a
full picture before any incremental `state` or `log` events arrive.

## Handling errors

A non-2xx response body is always `{ "error": { "code", "message" } }`. Check
the status code or the `code` field rather than string-matching `message`,
which is meant for humans and can change wording between releases.

## Reaching for a language's HTTP client instead of curl

Any HTTP client that supports connecting over a unix socket works the same
way: Bun's own `fetch(url, { unix: path })` (what `src/shared/client.ts`
uses internally), Node's `http.request({ socketPath })`, Python's
`requests-unixsocket`, and so on. The endpoint table in the [CLI
reference](../cli-reference.md#socket-api-the-contract-behind-every-command)
and the [socket API feature note](../features/socket-api.md) cover the full
surface; this guide is just the shortest path to your first request.
