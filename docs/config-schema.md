# Config schema

outrider imports standard `process-compose.yaml` files. The compatibility
contract: an existing file should import and run without edits; divergent
behaviour (routing, persistence, system-wide naming) is opt-in through
extension keys, never a silent change to upstream semantics.

## Discovery and merging

Auto-discovery order inside a directory: `compose.yml`, `compose.yaml`,
`process-compose.yml`, `process-compose.yaml`. A sibling
`<name>.override.<ext>` merges on top automatically. Merge semantics: maps
merge recursively, arrays and scalars in later files replace earlier values
wholesale, an explicit `null` removes the key. YAML anchors and merge keys
are supported natively.

## Project-level keys

| Key                                          | Status                                                          |
| -------------------------------------------- | --------------------------------------------------------------- |
| `name`                                       | supported (stack name; defaults to the directory name)          |
| `environment`                                | supported (prepended to every process env)                      |
| `vars` + `is_template_disabled`              | supported (see Templating)                                      |
| `shell` (`shell_command`, `shell_argument`)  | supported (default `bash -c`)                                   |
| `is_strict`                                  | supported (unknown keys become errors instead of warnings)      |
| `is_dotenv_disabled`                         | supported (skips `.env` auto-load)                              |
| `disable_env_expansion`                      | supported                                                       |
| `log_configuration`, `log_location`          | supported (per-process defaults)                                |
| `ordered_shutdown`                           | supported (opt-in reverse-order stop, mirrors upstream default) |
| `log_level`, `log_length`, `is_tui_disabled` | parsed, ignored (daemon model differs)                          |
| `env_cmds`                                   | parsed, deferred with a named warning                           |

## Process-level keys

| Key                                                                       | Status                                                                                                                        |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `command`, `entrypoint`, `working_dir`, `description`, `namespace`        | supported                                                                                                                     |
| `environment`, `env_file`, `is_dotenv_disabled`                           | supported                                                                                                                     |
| `depends_on` with all five conditions                                     | supported (see Dependencies)                                                                                                  |
| `readiness_probe`, `liveness_probe` (exec + http_get)                     | supported                                                                                                                     |
| `ready_log_line`                                                          | supported (mutually exclusive with a readiness probe, as upstream)                                                            |
| `availability` (`restart`, `backoff_seconds`, `max_restarts`)             | supported; counters persist across daemon restarts                                                                            |
| `availability.exit_on_end` / `exit_on_skipped`, restart `exit_on_failure` | parsed; warned and ignored in persistent mode (a system-wide daemon never exits with a process); will apply to ephemeral runs |
| `shutdown` (`command`, `signal`, `timeout_seconds`, `parent_only`)        | supported; the whole process group is signalled unless `parent_only`                                                          |
| `disabled`                                                                | supported                                                                                                                     |
| `is_daemon` + `launch_timeout_seconds`                                    | supported (parent exits 0 → tracked as running; stopped via `shutdown.command`)                                               |
| `replicas`                                                                | supported (simple fan-out; instance 0 keeps the plain name, others get `-N`)                                                  |
| `log_location`, `log_configuration` / `loggerConfig`                      | supported (rotation by size/backups/age, compression, no_color, add_timestamp)                                                |
| `vars`, `is_template_disabled`                                            | supported                                                                                                                     |
| `is_tty`, `is_foreground`                                                 | parsed, deferred with a named warning                                                                                         |
| `is_elevated`                                                             | parsed, cut with a named warning — write `sudo` in the command                                                                |
| `x-*` extension keys                                                      | tolerated (x-portless and x-tags are read, others pass through)                                                               |

Unknown keys warn by name in normal mode and fail in strict mode. Every cut or
deferred feature still parses and produces a precise warning naming the
feature and its status — never a silent ignore, never a crash.

## Dependencies

`depends_on` conditions: `process_started`, `process_completed`,
`process_completed_successfully`, `process_healthy`, `process_log_ready`.
The DAG is validated at import time; cycles fail the import with the full
cycle path. A dependency that can no longer be satisfied (failed or skipped)
cascades a `skipped` status. Per-instance replica dependencies (`name-N`)
are deferred: depend on the group instead (warned by name).

## Probes

Defaults mirror upstream: `period_seconds: 10`, `timeout_seconds: 1`,
`failure_threshold: 3`, `initial_delay_seconds: 0`. `success_threshold` is a
placeholder upstream and is not evaluated — documented here rather than
invented. `http_get` supports `host`, `path`, `scheme`, `port`, `headers`,
and `status_code`; exec probes accept their own `working_dir`. For routed
services, http probes resolve through the portless route — the exact path a
user would hit. Liveness failure restarts the instance.

## Environment

Spawn-time layering, later wins: daemon env → `.env` next to the compose file
→ per-process `env_file`(s) → global `environment` → per-process
`environment` → injected variables. Injected: `PC_PROC_NAME` and
`PC_REPLICA_NUM` for upstream compatibility, plus `OUTRIDER_SERVICE`,
`OUTRIDER_PROC_NAME`, `OUTRIDER_REPLICA_NUM`, and for routed services `PORT`,
`PORTLESS_URL`, `OUTRIDER_URL`.

## envsubst expansion

`$VAR`, `${VAR}`, and `$$` (literal `$`) are expanded at import time against
the daemon env, `.env`, and the global environment; unset variables expand to
empty, matching envsubst. The exotic function forms (`${VAR:-default}`, case
conversion, pattern replacement) are recognised, left as written, and warned
about by name. `disable_env_expansion` (project or process) opts out.

## Templating

Double-brace vars render simple dotted lookups — `{{.VERSION}}`,
`{{ .app.port }}` — from merged project + process `vars`. Anything richer
(pipes, conditionals, ranges) hard-errors at import naming the expression and
its location, since real configs rarely go past simple substitution. Values
that _start_ with `{{` must be quoted, as in upstream YAML.

## The x-portless extension

```yaml
processes:
  api:
    command: bun run api.ts
    x-portless:
      route: api # required — the hostname label → api.localhost
      framework: auto # optional — auto | none | vite | astro | expo | …
      port: 8080 # optional — fixed port for PORT-deaf services
      alias: false # optional — see Static aliases below; requires port
```

Routing is opt-in per process. Configs that hard-code ports keep working
untouched. Route names must be unique system-wide, must be valid DNS labels,
and may not collide with portless's reserved subcommand names; conflicts fail
the import naming both claimants. `framework` feeds the quirk table that
appends `--port` for tools that ignore the injected `PORT` (Vite, Astro,
Expo, React Router, Angular).

**Static aliases.** A managed route (the default) is owned by the daemon: it
points at the daemon-injected `PORT` and is registered under the daemon's pid,
so portless prunes it when the daemon dies. Setting `alias: true` instead
registers a static portless alias (pid 0) pointing straight at the fixed
`port` — for external tools that bind their own port and ignore the injected
`PORT` (e.g. `kubectl port-forward`, `tsh proxy`). `alias` requires `port`
(an alias has no ephemeral port to fall back on). portless never prunes pid-0
aliases, so the daemon clears its own on boot and shutdown to avoid dangling
routes after a crash.

## The x-tags extension

```yaml
processes:
  api:
    command: bun run api.ts
    x-tags: [web, edge] # a list…
  db:
    command: postgres
    x-tags: infra, data # …or a comma-separated string
```

Tags are grouping labels. `outrider start <tag>` / `outrider stop <tag>` act on
every service carrying the tag, and the daemon's `up`/`down` `names` resolve a
tag after ids, stacks, and namespaces. Tags are normalised on load (trimmed,
lowercased, de-duplicated) and must be letters, digits, and dashes. Standalone
services set tags in the dashboard add/edit form instead. See
[service tags](features/service-tags.md).
