# Compatibility report

Target: process-compose **v1.110.0** (verified May 2026). This report records
every deliberate divergence, with the reasoning behind each one; the
[config schema](config-schema.md) records per-key support status, and the
[feature parity](architecture/feature-parity.md) page gives the coarser,
checklist-style comparison for a first read. The [router](architecture/router.md)
section below records the swap from the portless CLI to outrider's own
in-process routing subsystem.

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
| Ports                                           | hard-coded per service                              | optional named routes via the native router (`x-route`)             | opt-in extension key; untouched configs behave identically                                                                    |
| Replica naming                                  | all instances renamed `name-N`                      | instance 0 keeps the plain name; 1+ get `-N`                        | stable identity across rescaling; counters and probes stay attached                                                           |
| Project update (Ctrl+E edits)                   | ephemeral in-memory edits                           | re-import the stack; the registry is the source of truth            | persisted desired state contradicts unsaved edits                                                                             |
| TUI                                             | tview, themes, mouse                                | Ink, one light/dark pair, vim keymap, keyboard-only                 | cuts discussion in the brief                                                                                                  |
| Env expansion of command strings                | at load                                             | at import (frozen into the registry; re-import refreshes)           | system-wide model imports once                                                                                                |
| `success_threshold`                             | placeholder, not evaluated                          | same, documented                                                    | honesty over invented semantics                                                                                               |
| Liveness failure                                | restart behaviour mirrors upstream per restart mode | always restarts the instance (counts toward max_restarts)           | **assumption**: upstream behaviour must still be verified against the real binary per the open questions; revisit before 1.0 |

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
interval; schema fields parse today, execution later), the MCP control
plane (planned as the first value addition).

## Routing: from portless to native

outrider's routing subsystem was originally a bridge to the [portless](https://www.npmjs.com/package/portless)
CLI, shelled out to and detected on `PATH`. That integration has been
removed entirely (no compatibility alias, no fallback path) and replaced
with `src/daemon/router.ts` and `src/daemon/router/`: an in-process reverse
proxy backed by the registry's own route table, with no external dependency.
See [the router](architecture/router.md) for the implementation and
[native routing](features/native-routing.md) for the user-facing feature.

**What changed for configs.** `x-portless` becomes `x-route`, with the same
`route`/`framework`/`port` fields; `alias` is dropped as a config field (see
static aliases below). Reserved-subcommand-name validation on route labels is
gone — that was a constraint from portless's own CLI subcommands, which no
longer exist. `PORTLESS_URL` is dropped; `OUTRIDER_URL` is the only injected
route URL now.

**Static aliases**, kept from the original design as "the only bridge to
processes the daemon does not directly manage the port of," are no longer a
config-level `alias: true` flag. They're derived automatically: a standalone
service with a pinned port (the CLI/TUI "alias port" field) gets
`routeKind: 'static'` on its registry entry, which only affects how its
liveness is reported (`list()` dials the port on demand rather than mirroring
supervisor state) — registration and env injection are identical to a managed
route.

**TLS defaults to off — an upstream Bun bug, not a design choice.**
The routing engine supports HTTPS/HTTP2 end to end (local CA, per-hostname
leaf certificate hot-swapped on route changes, trust-store enrolment, hosts
sync for non-`.localhost` TLDs) and every piece of it is built and tested.
It isn't switched on by default because Bun 1.3.14's `node:http2` shim
rejects TLS connections whose ALPN offer omits `h2` — exactly what real
browsers send when opening a WebSocket connection — which would silently
break WebSockets/HMR for anyone using it. `ProxySettings.tls` in the registry
is `false` by default; flip it and the daemon reads it on next restart, but
there is currently no CLI surface to do so (a natural follow-up once the
Bun bug is fixed).

**Probes never go through the route,** even for TLS-enabled routes: Bun's
`fetch` cannot self-connect to the daemon's own `node:http2` TLS listener
from within the same process — confirmed independently of the ALPN issue
above — so `src/daemon/prober.ts` always dials the service's port directly.
This is arguably the more correct design regardless: a health check
shouldn't depend on the proxy being healthy.

**Acceptance, adjusted for the above.** On a clean machine, importing a stack
that routes `web` and `api` serves `http://myapp.localhost` and
`http://api.myapp.localhost` (HTTP/1.1; HTTPS/HTTP2 work when TLS is
manually enabled in the registry, with the WebSocket caveat above); an http
readiness probe passes by dialing the service's own port; the lockfile
contains no routing dependency (`bun.lock` has never listed `portless` since
this swap; `package.json` `dependencies` is `ink` and `react` only).
