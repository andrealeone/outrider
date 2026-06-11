# Compatibility report

Target: process-compose **v1.110.0** (verified May 2026) and portless
**v0.14.0** (pinned). This report records every deliberate divergence; the
[config schema](config-schema.md) records per-key support status.

## Verified equivalences

- YAML parsing through `Bun.YAML.parse`, including anchors and merge keys.
- Multi-file auto-discovery order and override-file detection.
- All five `depends_on` conditions, with cycle detection at import time.
- Probe defaults (period 10s, timeout 1s, failure threshold 3) and the
  exec/http_get mode split, including probe `headers`, `status_code`, and
  exec `working_dir`.
- Restart policies (`no`, `on_failure`, `always`) with backoff and
  `max_restarts`; counters survive daemon restarts via the journal.
- The SIGTERM → wait → SIGKILL ladder, custom `shutdown.command`/`signal`,
  `parent_only`, and process-group signalling.
- `PC_PROC_NAME` / `PC_REPLICA_NUM` injection.
- `ready_log_line` XOR readiness probe, enforced as upstream does.
- envsubst `$VAR` / `${VAR}` / `$$` semantics including empty-for-unset.

## Deliberate divergences

| Area                                            | Upstream                                            | outrider                                                            | Why                                                                                                                           |
| ----------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Lifetime                                        | project-bound, exits with the session               | system-wide per-user daemon; desired state persists                 | the tool's premise                                                                                                            |
| exit_on_end / exit_on_failure / exit_on_skipped | terminate the binary                                | warned and ignored in persistent mode; will apply to ephemeral runs | a daemon never exits with a process                                                                                           |
| Ports                                           | hard-coded per service                              | optional named routes via portless (`x-portless`)                   | opt-in extension key; untouched configs behave identically                                                                    |
| Replica naming                                  | all instances renamed `name-N`                      | instance 0 keeps the plain name; 1+ get `-N`                        | stable identity across rescaling; counters and probes stay attached                                                           |
| Project update (Ctrl+E edits)                   | ephemeral in-memory edits                           | re-import the stack; the registry is the source of truth            | persisted desired state contradicts unsaved edits                                                                             |
| TUI                                             | tview, themes, mouse                                | Ink, one light/dark pair, vim keymap, keyboard-only                 | cuts discussion in the brief                                                                                                  |
| Env expansion of command strings                | at load                                             | at import (frozen into the registry; re-import refreshes)           | system-wide model imports once                                                                                                |
| `success_threshold`                             | placeholder, not evaluated                          | same, documented                                                    | honesty over invented semantics                                                                                               |
| Liveness failure                                | restart behaviour mirrors upstream per restart mode | always restarts the instance (counts toward max_restarts)           | **assumption** — upstream behaviour must still be verified against the real binary per the open questions; revisit before 1.0 |

## Cut features (parse + named warning, never a crash)

Recipes management, push-notification monitoring, dependency-graph
visualisation (the import report prints the resolved start order instead),
themes/configurable shortcuts/mouse, on-the-fly process edit, elevated
processes (`is_elevated` → write `sudo` yourself), swagger UI (the JSON
contract replaces it), remote TCP control, Windows.

## Deferred features (parse + named warning)

Interactive/foreground processes (`is_tty`, `is_foreground`), `env_cmds`,
exotic envsubst function forms, Go-template constructs beyond dotted lookups,
per-instance replica dependency conditions, scheduled processes (cron and
interval — schema fields parse today, execution later), the MCP control
plane (planned as the first value addition).

## portless integration surface (pinned at 0.14.0)

Programmatic: `RouteStore` (file-locked route table; routes registered under
the daemon's pid so they self-prune if the daemon dies), `parseHostname`,
`formatUrl`, and the `X-Portless` health header. CLI (shelled out, optional):
`portless proxy start`. Portless is explicitly pre-1.0 and warns its state
format may change between releases — every call lives behind the `Router`
interface in `src/daemon/router.ts`, so a break stays local to one file.
