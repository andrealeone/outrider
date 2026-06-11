# CLI reference

## v1 commands

| Command                         | Behaviour                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `outrider`                      | Opens the dashboard TUI. With the daemon off it opens in offline mode, showing the persisted registry and a prompt to switch the daemon on. With no TTY it degrades to a JSON state dump.                    |
| `outrider on`                   | Starts the daemon: installs the launchd agent (macOS) or systemd user unit (Linux) pointing back at this binary, waits for the socket, reconciles autostart services, prints a one-line summary. Idempotent. |
| `outrider off`                  | Stops the daemon: removes the service unit (so nothing resurrects it), shuts services down through the signal ladder in reverse dependency order, persists state, removes the socket. Idempotent.            |
| `outrider --help` / `--version` | The usual.                                                                                                                                                                                                   |

## Hidden commands

| Command               | Behaviour                                                                              |
| --------------------- | -------------------------------------------------------------------------------------- |
| `outrider daemon run` | The foreground daemon entrypoint the service unit invokes. Internal.                   |
| `outrider state`      | Dumps the daemon state (or the offline registry) as JSON, for debugging and scripting. |

## Adding a command

Commands are file routes: the path under `src/cli/commands/` defines the
command path (`commands/daemon/run.ts` → `outrider daemon run`). After adding
or removing a file, regenerate the static manifest (required for
`bun build --compile` compatibility):

```bash
bun scripts/generate-manifest.ts
```

## Socket API (the contract behind every command)

All endpoints are versioned under `/v1` on the unix socket; errors share one
shape: `{ "error": { "code", "message" } }`. Clients handshake via `GET
/v1/info` and compare protocol versions.

| Endpoint                                          | Meaning                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /v1/info`                                    | daemon version, protocol, pid (handshake)                            |
| `GET /v1/state`                                   | full snapshot of every service                                       |
| `GET /v1/registry`                                | the persisted desired model                                          |
| `GET /v1/routes`                                  | portless proxy status and route table                                |
| `POST /v1/up` `{names?, noDeps?}`                 | set desired up (deps included unless noDeps) and start               |
| `POST /v1/down` `{names?}`                        | set desired down and stop                                            |
| `POST /v1/import` `{path, dryRun?}`               | import or refresh a stack; dry run returns the report only           |
| `DELETE /v1/stacks/:name`                         | stop and remove a stack                                              |
| `POST /v1/services`                               | register a standalone service                                        |
| `PUT /v1/services/:id`                            | replace a standalone definition; a live service restarts to apply it |
| `POST /v1/services/validate`                      | validate a definition without saving (`editOf` allows the own name)  |
| `PATCH /v1/services/:id` `{desired?, autostart?}` | desired-state and autostart changes                                  |
| `POST /v1/services/:id/start·stop·restart`        | immediate lifecycle actions                                          |
| `POST /v1/services/:id/scale` `{replicas}`        | runtime replica change (persisted)                                   |
| `GET /v1/services/:id/logs?tail=N`                | ring-buffer tail                                                     |
| `DELETE /v1/services/:id`                         | remove a standalone service                                          |
| `POST /v1/shutdown`                               | full ordered shutdown, daemon exits                                  |
| `WS /v1/events`                                   | event stream: snapshots, state changes, log lines, probe transitions |

`names` accepts service ids (`stack/proc` or standalone names), stack names,
and namespaces.

## Planned scripting surface

`up/down/import/run/start/stop/restart/scale/logs/list/state/routes/validate`
keep their process-compose-shaped specification as the target for a later
iteration; in v1 their actions live in the TUI and the socket API above. When
`outrider run NAME` arrives it executes inside the daemon: the CLI attaches,
streams output, mirrors the exit code, and the daemon garbage-collects the
ephemeral entry. The `exit_on_end` / `exit_on_failure` / `exit_on_skipped`
policies apply to those ephemeral runs only; in persistent mode they are
parsed, warned about, and ignored.
