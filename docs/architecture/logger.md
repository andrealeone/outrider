# Logger

`src/daemon/logger.ts` keeps two sinks per service. A **rotating file**
(`~/.local/share/outrider/logs/<svc>/current.log`) honours the upstream caps:
`max_size_mb` (default 10), `max_backups` (default 3), `compress` (gzip), and
the `no_color` (ANSI strip) and `add_timestamp` options. A bounded
**in-memory ring buffer** (1000 lines) feeds the TUI and the logs endpoint;
live lines also fan out over the event stream, where the TUI batches them to
frame boundaries.

Lines are tagged with their instance and stream (`stdout`, `stderr`, or
`system` for supervisor messages like spawn failures and restart notices).
The logger also hosts the `ready_log_line` watchers: a regex (or literal
fallback) per instance that flips readiness the moment the line appears.
Log persistence is best-effort by design — a full disk must never take a
service down. The journal (`journal.jsonl`) rotates the same way, and restart
counters are rebuilt from it at boot.
