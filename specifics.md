This document is the implementation brief for **outrider**, a Bun-based, system-wide successor to process-compose. The name is the rider who escorts a convoy, scouting ahead and keeping every service in formation. It is written to be handed to Claude Code as the master prompt: requirements, schematics, and decisions only, no code.

**Sourcing note.** The feature inventory below has been verified against the live documentation and the repository at v1.110.0 (May 2026), and against the portless README at v0.14.0. Both projects move quickly, portless explicitly so as a pre-1.0 package, so Claude Code must still diff against the upstream config types at implementation time and commit a compatibility report.

---

### Scope and intent

The tool recreates process-compose's orchestration core in Bun and TypeScript with three deliberate departures. It is **system-wide** rather than project-bound, it replaces the tview interface with a clean **Ink (React) TUI**, and it removes local port management by integrating vercel-labs' **portless** so services answer on human-readable hostnames.

A persistent **daemon** owns all state: it knows which services must be up, which must stay down, and it reconciles reality against that desired state. The TUI is a management surface, not a supervisor. Closing it changes nothing about running services.

**Compatibility contract.** An existing process-compose.yaml should import and run without edits. Divergent behaviour (routing, persistence, system-wide naming) is opt-in and layered on top, never a silent change to upstream semantics.

---

### Field notes from the ecosystem

Findings from the live documentation, both repositories, and community discussion. They are folded into the sections below and triaged in the cuts discussion at the end.

**Parity is a moving target.** Upstream is at v1.110.0 with 69 releases and active maintenance. Recent additions include scheduled processes (cron and interval), an MCP server exposing the control plane to AI assistants, dependency graph visualisation, recipes management, and push-notification monitoring.

**Dependencies plus probes are the moat.** The most requested feature in mprocs, the closest TUI competitor, is exactly this: gating one process on another's readiness. Community comparisons otherwise reduce to systemd, which loses on macOS support and ergonomics. This tool is, in effect, a portable user-level systemd with compose ergonomics and named URLs. That is the pitch.

**The schema is an ecosystem.** devenv (Nix) generates process-compose files and drives the binary headless over a unix socket. Faithful schema support plus a socket control plane keeps that integration path open with no extra work.

**Ink is proven at this scale.** Claude Code, Gemini CLI, and Qwen Code all ship on Ink. Its known strain point is rerender cost under heavy output streams, which is precisely what the rendering discipline rules in the TUI section guard against.

---

### Feature inventory for parity

Everything process-compose offers, organised by domain. Each row is a hard requirement unless marked otherwise.

| Domain             | Features to implement                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process definition | command, entrypoint, working_dir, environment list, global .env auto-load plus -e overrides, per-process env_file, is_dotenv_disabled, .pc_env settings file, envsubst-style expansion with $$ escaping and disable_env_expansion, env_cmds dynamic variables, shell wrapper configuration, description, disabled, is_daemon with launch_timeout_seconds, is_tty, is_foreground, is_elevated, replicas, namespace, per-process and global vars templating with is_template_disabled, multiline YAML commands | Go template vars need a TypeScript equivalent honouring the same double-brace syntax. Upstream expansion is full envsubst with function forms such as case conversion and pattern replacement, so a plain regex pass is not enough. env_cmds run under a 2 second budget upstream                                      |
| Dependencies       | depends_on with conditions: process_started, process_completed, process_completed_successfully, process_healthy, process_log_ready                                                                                                                                                                                                                                                                                                                                                                           | DAG with cycle detection at validation time. ready_log_line and a readiness probe are mutually exclusive upstream. Replica groups can be depended on as a whole or per instance (name-N) with per-instance condition overrides. Reverse-order shutdown is opt-in upstream via ordered_shutdown, so mirror that default |
| Probes             | readiness_probe and liveness_probe in exec and http_get modes; initial_delay_seconds, period_seconds, timeout_seconds, success_threshold, failure_threshold                                                                                                                                                                                                                                                                                                                                                  | http_get also supports headers and a custom expected status_code, and exec probes accept their own working_dir. Upstream treats success_threshold as a placeholder, so document that honestly rather than inventing semantics. http probes resolve through portless routes when a service is routed                    |
| Restart policy     | availability.restart: no, on_failure, always, exit_on_failure; backoff_seconds, max_restarts, exit_on_end, exit_on_skipped                                                                                                                                                                                                                                                                                                                                                                                   | Counters persist across daemon restarts                                                                                                                                                                                                                                                                                |
| Shutdown           | shutdown.command, shutdown.signal, timeout_seconds, parent_only; SIGTERM, wait, SIGKILL escalation                                                                                                                                                                                                                                                                                                                                                                                                           | Signal the whole process group, not only the parent                                                                                                                                                                                                                                                                    |
| Logging            | global and per-process log files; rotation by max_size_mb, max_backups, max_age_days, compress; flush_each_line, no_color, add_timestamp, timestamp_format, disable_json, fields_order, no_metadata                                                                                                                                                                                                                                                                                                          | Add a bounded in-memory ring buffer per process to feed the TUI                                                                                                                                                                                                                                                        |
| Multi-file config  | several config files with deep merge, auto-discovery in the order compose.yml, compose.yaml, process-compose.yml, process-compose.yaml, automatic override file detection, strict validation mode (is_strict)                                                                                                                                                                                                                                                                                                | Merge semantics must match upstream; golden tests against real fixtures                                                                                                                                                                                                                                                |
| Runtime control    | start, stop, restart, scale at runtime; up with a subset of processes and a no-deps flag; namespace bulk start, stop, and restart; project update for on-the-fly config reload; ephemeral run of a single process plus its dependencies; detached operation; project and process state inspection                                                                                                                                                                                                            | All actions flow through the daemon API. Upstream's project update maps to stack re-import in this design                                                                                                                                                                                                              |
| API and clients    | command API plus live event stream over a unix domain socket; attach from any terminal                                                                                                                                                                                                                                                                                                                                                                                                                       | Swagger UI is out of scope; a stable JSON contract replaces it                                                                                                                                                                                                                                                         |
| TUI                | process table with status, health, restarts, exit codes; namespace filtering; log pane with follow and search; start, stop, restart, and scale actions; info view; themes; configurable shortcuts; sorting; mouse support                                                                                                                                                                                                                                                                                    | Rebuilt in Ink from scratch, not ported. Themes, configurable shortcuts, and mouse support are triaged in the cuts discussion at the end                                                                                                                                                                               |
| Injected env       | PC*PROC_NAME, PC_REPLICA_NUM, and related PC*\* variables                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Keep PC*\* names for compatibility, add OUTRIDER*\* aliases alongside                                                                                                                                                                                                                                                  |

**Out of scope for v1.** Windows support, elevated process handling beyond a plain sudo wrapper, swagger UI, remote TCP control, recipes management, push-notification monitoring, and the upstream MCP server, the last of which is revisited under value additions below.

---

### Architecture

```jsx
CLI (one-shot commands)          TUI (Ink)
        \                          /
         unix socket: JSON commands + event stream
                       |
  +--------------------+--------------------+
  |                 daemon                  |
  |                                         |
  |   registry --- reconciler --- event bus |
  |       |             |                   |
  |   scheduler --- supervisor --- prober   |
  |       |             |            |      |
  |  json store      logger       router ------ portless proxy
  +--------------------+--------------------+
                       |
             Bun.spawn process groups
                       |
               managed services
```

**Daemon.** One instance per user, guarded by a lock file and the socket itself. outrider on installs the binary as a launchd agent on macOS or a systemd user unit on Linux, and on boot the daemon reconciles desired state from the state files before accepting clients.

**Control plane.** A single Bun.serve instance bound to a unix domain socket. Plain JSON endpoints carry commands and queries, and a WebSocket upgrade carries the event stream: state changes, log lines, and probe transitions. No TCP listener in v1. Endpoints are versioned under /v1, all errors share a single JSON error shape, and the socket file is created with user-only permissions, so v1 needs no token auth. Client and daemon exchange a version handshake on connect, so a stale daemon left running across a binary upgrade produces a clear restart message instead of undefined behaviour.

**Registry and reconciler.** The registry holds the desired model: services, stacks, routes, and autostart flags. The reconciler continuously compares desired against observed state and issues supervisor actions. The same loop handles a CLI command, a TUI action, or a cold daemon start.

**Supervisor.** A thin layer over Bun.spawn. It owns process groups, replica fan-out, restart backoff, exit-code capture, and the SIGTERM-wait-SIGKILL ladder. Stdout and stderr stream straight into the logger. It also owns the canonical process state machine, mirroring upstream statuses (pending, launching, running, completed, skipped, error, terminating, restarting), so dependency conditions, the TUI, and the API all read one enum rather than inventing their own.

**Scheduler.** Builds the dependency DAG per stack, gates start-up on depends_on conditions, and computes reverse order for shutdown. Cycles fail at import time, never at runtime.

**Prober.** Runs exec probes through the supervisor and http probes through fetch. For routed services the http probe targets the portless route, which exercises the exact path a user would hit.

**Logger.** Two sinks per process: a rotating file honouring size, age, count, and compression caps, and the ring buffer feeding the TUI and the logs command through the event stream.

**State store.** Two plain files, write-owned exclusively by the daemon; the TUI's offline mode reads registry.json read-only, which is safe precisely because the daemon is not running. registry.json holds the desired model (services, stacks, routes, autostart flags), written atomically on every change via temp file, fsync, and rename, and human-editable while the daemon is stopped. journal.jsonl is an append-only event log carrying state transitions and restart counters, rotated like the process logs. The daemon being the single writer is what makes a database unnecessary; bun:sqlite remains the documented fallback if history querying ever outgrows a linear scan, and the store sits behind a small interface so the swap would be local.

---

### Portless integration

Services declare a **route name** instead of binding a fixed port. At start the daemon allocates an ephemeral port, injects PORT and the public URL through both PORTLESS_URL and OUTRIDER_URL, keeps PC_PROC_NAME and PC_REPLICA_NUM alongside, and registers the route with the portless proxy. The process then answers at a stable hostname such as api.myapp.localhost, served over HTTPS with HTTP/2 by default, and the TUI shows that URL next to the service.

**Integration path.** Portless's alias mechanism maps a name to a port without wrapping the child command, which fits a daemon that already owns spawning. The run wrapper, monorepo discovery, and git worktree prefixes stay unused. One duty transfers to us: portless's wrapper injects --port flags for frameworks that ignore PORT (Vite, Astro, Expo, and friends), so the supervisor needs the same small quirk table.

**Proxy lifecycle.** On first run portless generates a local CA, adds it to the system trust store, and binds port 443 with sudo auto-elevation; --no-tls falls back to plain HTTP on 80. Portless also ships its own service install for launchd, systemd, and Task Scheduler, so exactly one component must own proxy startup, and it should be our daemon: it checks, starts, and repairs the proxy and its route registrations after crashes and reboots. Global route uniqueness is enforced in our registry, and portless's reserved subcommand names (run, proxy, alias, list, and the rest) are rejected as route names at validation time.

**Hostname policy.** Default to .localhost, which browsers resolve to 127.0.0.1 natively. Offer .test as the alternative (IANA-reserved), and refuse .local (collides with mDNS) and .dev (Google-owned, HSTS-forced). Portless auto-syncs /etc/hosts, which is also the Safari fix.

Compatibility is preserved through extension keys. Configs that hard-code ports keep working untouched; routing is enabled per process through an x-portless block, the extension mechanism process-compose already tolerates. The block has three fields: route (the hostname label, required), framework (auto by default, or an explicit hint into the quirk table), and port (a fixed port for services that cannot honour an injected PORT, registered as a static alias). Route conflicts fail the import with an error naming both claimants.

**Isolation rule.** All portless calls live behind a Router interface. Portless is explicitly pre-1.0 and warns that its state format may change between releases, so this boundary is the contract, not just hygiene.

---

### System-wide model

The registry holds two kinds of entries. **Stacks** are imported from a process-compose.yaml and stay linked to their source file by path and content hash, so drift is detectable and re-import is cheap. **Standalone services** are defined directly through the TUI or CLI with no backing file.

Naming is hierarchical: stack/process for stack members, a plain name for standalone services, with upstream namespaces preserved as a filter dimension. Each entry carries a desired state, up or down, plus an autostart flag honoured at daemon boot.

---

### TUI design (Ink)

Design goals: rich, detailed, and high frame rate, while staying calm and legible. The TUI is a thin client over the socket and never spawns or supervises processes itself, with one exception: the daemon switch may spawn the daemon binary to turn it on.

**Dashboard.** The default outrider command and the heart of the tool. A virtualised table of every registered service: name, stack, status, health, uptime, restarts, and route, with each row carrying a visible on/off toggle flipped by a single keypress. Flipping a toggle sets desired state through the daemon, and the row animates through its transition states (pending, starting, probing, up) instead of jumping. A header strip carries aggregate counts (running, unhealthy, stopped) and a master switch for the daemon itself: switching off asks one confirmation, streams the reverse-order shutdown live, then drops the dashboard into offline mode rendered from the persisted registry, and the same switch spawns the daemon again. Namespace and stack filters, fuzzy search, and sort cycling complete the view.

**Logs.** Split or full-screen pane with follow mode, regex search with highlighting, wrap toggle, and time filters. Live lines come from the ring buffer; history loads on demand from the rotated files.

**Detail.** Full config snapshot, probe history, recent exit codes, environment with secrets masked, and route status.

**Add service.** A form wizard covering command, working directory, environment, route, restart policy, and autostart, validated live against the daemon before saving.

**Import stack.** File path input plus a dry-run validation report showing the merged result and any compatibility warnings before anything is registered.

**Interaction rules.** A fixed vim-style keymap in v1, with the config file reserving a keymap key for later, a command palette, and a small theme token set with light and dark defaults. Keyboard-first throughout; no mouse support, per the cuts discussion.

**Rendering discipline: rich, detailed, high frame rate.** Target a steady 60 fps render budget where the terminal sustains it, degrading to 30 fps rather than tearing. Spinners, row transition animations, and live uptime counters tick on one shared frame clock; log traffic batches to frame boundaries and never rerenders the table; toggles update optimistically and reconcile against daemon events, so every keypress paints feedback in the next frame instead of waiting on a socket round trip. Use the alternate screen buffer with diff-only writes through Ink's reconciler, profile render cost in the Phase 0 spike, and degrade to a plain log mode on dumb terminals.

---

### CLI surface

**First iteration: three commands.** The entire public v1 surface is outrider, outrider on, and outrider off. Everything else happens inside the TUI. One hidden command exists from day one: outrider daemon run, the foreground entrypoint the launchd or systemd unit invokes. It is internal and excluded from help output.

| Command      | Behaviour                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| outrider     | Renders the dashboard TUI, the tool's primary surface. With the daemon off it opens in offline mode, showing the persisted registry and a prompt to switch the daemon on                      |
| outrider on  | Starts the daemon: installs the launchd or systemd user unit on first run, waits for the socket, reconciles autostart services, and prints a one-line summary. Idempotent                     |
| outrider off | Stops the daemon: shuts services down through the signal ladder in reverse dependency order, persists state, removes the socket, and disables start at boot until on is run again. Idempotent |

**Later iterations.** The commands below keep their specification as the target shape for the scripting surface; in v1 their actions live in the TUI instead.

| Command                                                           | Behaviour                                                     |
| ----------------------------------------------------------------- | ------------------------------------------------------------- |
| outrider up / down [name...]                                      | Sets desired state for services, stacks, or everything        |
| outrider import FILE                                              | Imports or refreshes a stack from a process-compose.yaml      |
| outrider run NAME                                                 | Ephemeral run of one process plus dependencies, exits with it |
| outrider start / stop / restart NAME                              | Immediate lifecycle actions                                   |
| outrider scale NAME N                                             | Adjusts replica count at runtime                              |
| outrider logs NAME [--follow]                                     | Streams or dumps logs                                         |
| outrider list / state                                             | Tabular or JSON view of registry and runtime state            |
| outrider routes                                                   | Lists portless routes and their targets                       |
| outrider validate FILE                                            | Schema and DAG check with no side effects                     |
| outrider daemon install / uninstall / start / stop / status / run | Daemon and service-unit management                            |

Every command, now and later, is a thin socket client, and scripting commands accept a JSON output flag. When outrider run arrives, it executes inside the daemon like everything else: the CLI attaches, streams output, mirrors the exit code, and the daemon garbage-collects the ephemeral entry afterwards. The exit_on_end, exit_on_failure, and exit_on_skipped policies apply to ephemeral runs, where they terminate the run group and propagate the exit code; in persistent mode they are parsed, warned about, and ignored, since a system-wide daemon never exits with a process.

---

### Dependencies and Bun-native mapping

| Need                  | Choice                           | Notes                                                                                                                       |
| --------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Terminal UI           | ink + react                      | The only substantial runtime dependencies; build spinners and tables in-house rather than pulling ink-\* extras             |
| Routing               | portless                         | Wrapped behind the Router interface                                                                                         |
| YAML parsing          | Bun.YAML.parse                   | Verify anchor and merge-key support against real configs; fall back to the yaml package only if native parsing falls short  |
| HTTP API              | Bun.serve on a unix socket       | Also serves the WebSocket event stream                                                                                      |
| Spawning              | Bun.spawn                        | Process groups, streamed stdio                                                                                              |
| Storage               | JSON state files                 | Atomic write-and-rename for registry.json, append-only JSONL journal; no database, bun:sqlite only as a documented fallback |
| HTTP probes           | fetch                            | Native                                                                                                                      |
| File ops and rotation | Bun.file plus node:fs primitives | Rotation hand-rolled                                                                                                        |
| Schema validation     | Hand-written validators          | No zod; keeps the binary lean and the error messages bespoke                                                                |
| Argument parsing      | util.parseArgs or hand-rolled    | No commander                                                                                                                |
| Tests                 | bun test                         | Nothing extra                                                                                                               |

**Hard rule.** Any dependency beyond ink, react, and portless requires a written justification in the change that introduces it.

---

### Single-executable build

The whole tool compiles with bun build --compile into one binary containing the CLI, the TUI, and the daemon. The daemon is the same binary invoked with daemon run, so installation is a single file copy and the service unit points back at it.

Targets: darwin-arm64, darwin-x64, linux-x64, and linux-arm64 through cross-compilation flags. Enable minification and production defines. Expect a baseline of roughly 50 to 60 MB from the embedded runtime, acceptable for a system tool. Default themes, keymaps, and launchd or systemd unit templates embed as bundled assets. The first build spike must confirm ink and react bundle without dynamic require escapes.

---

### Filesystem layout

```jsx
~/.config/outrider/config.yaml           daemon defaults, theme, keymap
~/.local/share/outrider/registry.json    desired state (atomic writes)
~/.local/share/outrider/journal.jsonl    event log and counters (rotated)
~/.local/share/outrider/logs/<svc>/      rotated process logs
$XDG_RUNTIME_DIR/outrider.sock           control socket (fallback: ~/.cache)
```

XDG paths apply on macOS as well, one convention everywhere for predictability.

---

### Code constraints for Claude Code

Hard rules for the implementation, on a par with the dependency policy. Violations are review blockers, not style preferences.

**Less code over more.** Write as little code as possible. No duplicate code and no redundant logic: extract shared behaviour the moment it appears twice, and prefer reusing or deleting an existing path over adding a new abstraction.

**Utilities are a folder, not a file.** Shared helpers live in a dedicated utils directory, organised across small, focused files by topic (paths, time, formatting, process helpers, and so on). A single grab-bag utils file is forbidden.

**Types live in .d.ts files.** Prefer declaration files for types and interfaces, grouped by domain. Runtime modules pull them in through type-only imports, keeping the bundle free of type-only churn.

**Kebab-case filenames.** Every file is named in kebab-case (restart-policy.ts, route-table.d.ts), with no camelCase or PascalCase filenames anywhere, React components included.

**CLI commands as file routes.** Commands are organised like Next.js routes: a commands tree where the file path defines the command path (for example commands/daemon/start.ts handles daemon start), and the handler core auto-loads them. Adding a command means adding a file, never editing a central switch. One caveat: the loader must stay compatible with bun build --compile, so discovery runs through a generated manifest or compile-time glob rather than runtime filesystem scanning.

**Source layout.** One src tree: cli/commands holds the file-routed commands, daemon holds registry, reconciler, supervisor, scheduler, prober, logger, and router, tui holds the Ink application, and shared holds the socket client, the protocol .d.ts files, and the utils folder. Nothing in cli or tui imports daemon internals; both sides speak only the shared protocol.

**Documentation lives in /docs.** The repository carries a /docs folder maintained as a proper wiki, written and updated alongside the code rather than after it. It covers setup and installation, day-to-day usage, the CLI reference, architecture notes per component (daemon, registry, reconciler, supervisor, scheduler, prober, logger, router, TUI), the config schema and its compatibility report, guides for common workflows such as importing a stack or adding a routed service, and runnable demos with example config files. Markdown files follow the same kebab-case rule, and every phase in the implementation plan ends with its documentation written, so a feature without docs is an unfinished feature.

---

### Implementation plan

**Phase 0, spike.** Compile a hello-world Ink binary, prove Bun.serve over a unix socket, parse real process-compose files with Bun.YAML, and complete a portless registration round trip.

**Phase 1, core daemon.** Registry, reconciler, supervisor, JSON state store, socket API, and the on and off commands, with a hidden JSON state dump for debugging until the TUI lands.

**Phase 2, compatibility.** Full schema parser, multi-file merge, vars templating, probes, dependency conditions, and restart policies, locked in with golden tests against real process-compose fixtures.

**Phase 3, routing.** Portless bridge, env injection, the route table, and probe-over-route.

**Phase 4, TUI.** The default outrider dashboard first, service toggles and the daemon switch included, then logs, detail, add-service, and import flows.

**Phase 5, packaging.** Cross-target builds, unit-template polish, and documentation; service-unit installation itself already ships with on in Phase 1.

**Acceptance bar.** A non-trivial process-compose.yaml with dependencies, probes, replicas, and an override file behaves identically under both tools, ports aside.

---

### Open questions to settle at implementation time

The exact current schema field list must come from the upstream types package, with a generated compatibility report committed to the repo. The portless programmatic API and its TLS story need pinning before Phase 3. Liveness-failure semantics across restart modes must mirror upstream behaviour exactly, so test it against the real binary. Multi-user machines get one daemon per user; a shared system daemon is explicitly deferred. Pin the Bun version in the repository and confirm Bun.YAML.parse ships in it before closing Phase 0. The TUI masks environment values whose keys match common secret patterns (TOKEN, SECRET, PASSWORD, KEY); this is a documented heuristic, not a guarantee.

---

### Value additions beyond parity

Each of these earns its place only after the acceptance bar is met, and none may add a dependency.

**Agent control plane.** Upstream now ships an MCP server, and portless brands itself as built for humans and agents. Exposing the daemon's existing JSON command surface as a minimal MCP server makes every managed service controllable by Claude Code and its peers at near-zero cost. This is the strongest differentiator on the list.

**Procfile import.** A Procfile is a name-to-command map, so the parser is an afternoon's work, and it converts foreman, overmind, and honcho users with a single import command.

**Scheduled services.** Cron and interval triggers on registry entries turn the daemon into a replacement for scattered personal cron and launchd jobs. Parse the upstream schema fields now, execute later.

**Cheap polish.** An open command launches a service's route URL in the browser. A doctor command verifies the socket, the proxy, CA trust, and the hosts file in one pass. Shell completions ship inside the binary.

**Sharing stays out.** Portless already handles LAN, Tailscale, and ngrok exposure. Document the pass-through rather than wrapping it.

---

### What not to build: a cuts discussion

The parity inventory is deliberately exhaustive, while a minimal tool ships defaults instead of options. Three buckets follow: cut outright, defer until demand is real, and keep despite the temptation.

**Cut outright.** Recipes management is an upstream content ecosystem, not tool behaviour. Push-notification monitoring duplicates the event stream, so let consumers notify. Dependency graph visualisation is answered by validate printing the resolved start order in plain text. Themes and configurable shortcuts collapse to one carefully made light and dark pair with one vim-flavoured keymap; a keymap file can arrive later without breaking anything. Mouse support goes, keyboard-first is the point of a TUI. On-the-fly process edit (upstream Ctrl+E) makes ephemeral, non-persisted changes that contradict a registry holding the source of truth, so editing happens through the registry instead. Elevated processes and the TUI password flow go too; users write sudo in the command.

**Defer until demand is real.** Foreground and interactive processes are TUI-only and manual-start even upstream, genuinely niche. env_cmds and the exotic envsubst function forms wait: support ${VAR}, $VAR, and $$ escaping first, and fail everything else with a named, precise warning. Go-template vars render the common cases and hard-error on the rest with file and line, since real configs rarely go past simple substitution. Scheduled services and the MCP control plane are parked in the value additions above. Per-instance replica dependency overrides wait behind group-level conditions.

**Keep despite the temptation.** Multi-file merge stays, devenv and real projects depend on it. Probes and dependency conditions stay, they are the moat per the field notes. Replicas stay because cutting them breaks real configs, though a simple fan-out implementation is enough. Namespaces stay, one string label and a filter is nearly free. Persisted restart counters stay, since surviving restarts is the daemon's whole premise.

**The rule that makes cuts safe.** Every cut feature must still parse. An unsupported-but-recognised key produces a precise warning naming the feature and its status, never a silent ignore and never a crash. That turns each cut into a roadmap item instead of a compatibility break.

---

### Implementation status

Tracked against the source tree, not the docs. `[x]` is implemented and shipping; `[ ]` is not built. Items the cuts discussion deliberately drops or defers are marked **(cut)** / **(deferred)** so an empty box reads as a roadmap entry, not an oversight.

**Architecture components** — all present under `src/daemon/`.

- [x] Daemon lifecycle, lock file, version handshake (`daemon.ts`)
- [x] Registry: desired model, standalone + stack entries, name resolution (`registry.ts`)
- [x] Reconciler: desired-vs-observed loop (`reconciler.ts`)
- [x] Supervisor: `Bun.spawn` process groups, replica fan-out, signal ladder, state machine (`supervisor.ts`)
- [x] Scheduler: dependency DAG, start gating, reverse-order shutdown (`scheduler.ts`, `config/dag.ts`)
- [x] Prober: exec + http probes, probe-over-route (`prober.ts`)
- [x] Logger: rotating file sink + in-memory ring buffer (`logger.ts`, `utils/ring-buffer.ts`)
- [x] Router: portless integration behind an interface (`router.ts`)
- [x] State store: atomic `registry.json` + append-only journal (`state-store.ts`)
- [x] Control plane: `Bun.serve` over a unix socket, `/v1` JSON endpoints + event stream (`api.ts`, `event-bus.ts`)

**Config schema and compatibility** — see `config-schema.md` and `compatibility-report.md`.

- [x] Multi-file discovery, deep merge, override detection, strict mode (`config/discover.ts`, `merge.ts`, `validate.ts`)
- [x] Process keys: command, entrypoint, working_dir, description, namespace, disabled, is_daemon, replicas
- [x] Environment: `environment`, `env_file`, `.env` auto-load, `is_dotenv_disabled`, layered precedence, injected `PC_*`/`OUTRIDER_*` vars
- [x] envsubst: `$VAR`, `${VAR}`, `$$`; exotic function forms recognised and warned (`utils/env.ts`)
- [x] Templating: simple double-brace vars; richer expressions hard-error (`config/template.ts`)
- [x] Dependencies: all five `depends_on` conditions, cycle detection at import
- [x] Probes: readiness + liveness, exec + http_get, upstream defaults
- [x] Restart policy: no / on_failure / always, backoff, max_restarts, persisted counters
- [x] Shutdown: command, signal, timeout, parent_only; SIGTERM→wait→SIGKILL
- [x] `x-portless` and `x-tags` extension keys
- [x] Framework quirk table (`--port` injection) (`framework-quirks.ts`)
- [ ] `env_cmds` dynamic variables — **(deferred)**, parsed + warned
- [ ] `is_tty`, `is_foreground` — **(deferred)**, parsed + warned
- [ ] `is_elevated` / TUI password flow — **(cut)**, write `sudo` in the command
- [ ] Per-instance replica dependency overrides (`name-N`) — **(deferred)**, depend on the group
- [ ] `exit_on_end` / `exit_on_skipped` / `exit_on_failure` in persistent mode — parsed + warned by design; apply only to ephemeral runs (not yet built)

**Portless routing**

- [x] Per-process opt-in routes, ephemeral port allocation, env injection (`PORT`, `PORTLESS_URL`, `OUTRIDER_URL`)
- [x] Static aliases (`alias: true` + fixed `port`), pid-0 cleanup on boot/shutdown
- [x] System-wide route uniqueness + reserved-name rejection at import

**CLI surface**

- [x] `outrider` (dashboard), `outrider on`, `outrider off`
- [x] `outrider start` / `outrider stop` (ids, stacks, namespaces, tags)
- [x] `outrider sync` (config mirror reconcile, `--yes`)
- [x] `outrider daemon run` (hidden), `outrider state` (hidden JSON dump)
- [ ] `outrider import FILE` — TUI-only (import-stack flow)
- [ ] `outrider run NAME` (ephemeral) — **(deferred)**
- [ ] `outrider restart` / `scale` / `logs` / `list` / `routes` / `validate` — TUI / socket only for now
- [ ] `outrider open` / `doctor`, shell completions — **(deferred)**, value additions

**TUI (Ink)**

- [x] Dashboard: virtualised table, per-row toggles, transition animations, header counts, daemon master switch, offline mode
- [x] Filters, fuzzy search, sort cycling
- [x] Logs view: follow, regex search, wrap, scrollback, per-service log deletion
- [x] Detail view: config snapshot, instances, masked environment, route status, tags
- [x] Add/edit-service form with live validation
- [x] Import-stack dry-run report
- [x] Sync checklist view + reusable `Alert` component
- [x] One vim-style keymap; dark + light theme pair (`OUTRIDER_THEME`)
- [x] Shared frame clock for spinners/animations (`frame-clock.ts`)
- [ ] Configurable keymap file — **(deferred)**, key reserved in config
- [ ] Mouse support — **(cut)**
- [ ] Command palette — **(deferred)**

**System-wide model & sync**

- [x] Standalone (file-less) services and stack entries linked by path + content hash
- [x] Hierarchical naming, namespaces as a filter dimension, desired state + autostart
- [x] Service tags as a grouping handle for `start`/`stop`, search, and the API
- [x] Config sync: `~/.config/outrider.yml` mirror, automatic registry→file export, `sync` file→registry reconcile

**Build & packaging**

- [x] Single-executable build via `bun build --compile` (`scripts/build.ts`)
- [x] launchd / systemd unit installation through `on`/`off`
- [x] XDG path layout everywhere

**Value additions / beyond parity**

- [ ] MCP agent control plane — **(deferred)**
- [ ] Procfile import — **(deferred)**
- [ ] Scheduled services (cron / interval) — **(deferred)**, schema parsed later
- [ ] `open` / `doctor` / completions — **(deferred)**

**Test coverage** — gaps to close. These source files have no dedicated tests and no (or near-zero) automated coverage; partially-covered modules are tracked in [test coverage](docs/test-coverage.md). The CLI and TUI layers are thin socket clients, so the daemon integration test exercises their behaviour indirectly, but the wiring and components themselves are untested.

- [ ] Prober: exec + http_get probe logic, thresholds, liveness restart, probe-over-route (`daemon/prober.ts` — only constructed by the integration test, ~2% line coverage). Highest-value gap, since probes are the moat.
- [ ] Router: the portless bridge contract (`daemon/router.ts` — the integration test substitutes a fake router, so the real one is never run).
- [ ] Daemon bootstrap: lock file, socket lifecycle, version-mismatch refusal, the registry→sync-file mirror hook (`daemon/daemon.ts`).
- [ ] Service-unit templating for launchd / systemd (`shared/service-unit.ts`) — pure and install-critical, so cheap to cover.
- [ ] Secret-masking and formatting helpers (`shared/utils/format.ts`).
- [ ] CLI dispatch: command resolution, hidden-command filtering, usage output, unknown-command handling (`cli/dispatch.ts`, `cli/manifest.ts`).
- [ ] CLI commands: `on`, `off`, `start`/`stop` (`cli/updown.ts`), `sync`, `state`, `daemon/run` (`cli/commands/*`) — arg parsing and output, not just the name resolution and sync codec they call.
- [ ] TUI Ink layer: `app.tsx`, every component (`dashboard`, `logs-view`, `detail-view`, `add-service`, `import-stack`, `service-table`, `status-badge`, `header`, `text-input`, `sync-view`, `alert`), `sync.tsx`, `use-daemon.ts`, `frame-clock.ts`, `theme.ts` — no automated coverage.
- [ ] Entry-point wiring (`main.ts`).

### Documentation polish (pre-production)

Review of `/docs` + `readme.md` ahead of a production-level release. Content was
already updated and is accurate; this is a punch-list of completeness, polish,
and structural gaps. Scores out of 10.

**1. Content completeness — 8/10.** Genuinely thorough and honest: every
architecture component documented, an exhaustive per-key config schema, a
candid compatibility report, and a `test-coverage.md` that names its own gaps
(rare and excellent). What's missing or wrong:

- [x] **Bun version stated inconsistently — reconciled.** Per-version mentions
      stripped everywhere except the single base requirement in `setup.md`
      ("Bun 1.3.10+ for building from source"); `readme.md`'s pin line and the
      build-guard's redundant `(currently >=1.3.10)` are gone.
- [x] **Demo inaccuracy fixed.** `docs/demos/readme.md` no longer claims an
      `x-portless` route; since every demo process is a plain shell loop with no
      HTTP server, a route would point at a dead port. Replaced with a pointer
      to the routed-service guide.
- [x] **Contributing page added** (`docs/contributing.md`) — vision intro,
      first-timer path, returning-dev references, change checklist, and
      issues-for-bugs/features. (Per decision: **no LICENSE for now.**)
- [ ] **Uninstall path** — added an "Uninstalling" section to `setup.md`
      (`outrider off`, remove binary, remove `~/.local/share/outrider` and
      `~/.config/outrider*`). _Done this round._
- [ ] **No security note.** The socket's user-only-permissions trust model and
      the secret-masking heuristic caveat are mentioned in passing; a short
      `security.md` would consolidate them for a production audience. _Backlog._

**2. Aesthetic & readability — 8/10.** Strong, consistent prose voice; tables
used well; the ASCII architecture diagram reads cleanly. Fixes:

- [x] **De-duplicated the `docs/readme.md` index.** Collapsed to one
      authoritative list per topic (Getting started · Features · Reference ·
      Architecture · Contributing); the doubled component and feature lists are
      gone. Layered docs at different altitudes (feature vs. guide vs. reference)
      are intentional and were left intact. Root `readme.md` left as-is per
      instruction.
- [~] **TUI screenshot / GIF** — deferred per instruction (visuals skipped for
      now). Still the highest-leverage appeal improvement when revisited.
- [ ] **Badges in `readme.md`** — minor; revisit once CI exists.

**3. Structure & architecture of `/docs` — 7/10.** Sensible skeleton:
`setup` · `usage` · reference (`cli-reference`, `config-schema`,
`compatibility-report`, `test-coverage`, `glossary`) · `architecture/` ·
`features/` · `guides/` · `demos/`. Status:

- [x] **Glossary added** (`docs/glossary.md`) — written as a grouped narrative
      (the big idea → what you manage → grouping → routing → health/lifecycle →
      storage → access), not a flat table, and linked from the index.
- [ ] **Grow the demos folder.** One accurate demo today (`web-stack`:
      deps/probes/replicas/override). Add a **routed** demo with a real
      `x-portless` block backed by a tiny HTTP server, and a **tags +
      standalone** example. _Backlog._
- [ ] **Brief TOC for the long docs** (`config-schema.md`, the sync guide) —
      GitHub auto-generates one, so low priority. _Backlog._

### Guide ideas (backlog)

Existing guides: import a stack · add a routed service · sync at scale. Candidate
additions, ordered roughly by value:

- [ ] **Troubleshooting / FAQ** (highest value). portless not on PATH; port 443 /
      sudo on first proxy start; "daemon already running" / stale socket; route
      conflicts naming both claimants; daemon won't start; reading
      `~/.local/share/outrider/daemon.log`; why a routed service started without
      a hostname.
- [ ] **Quickstart (60 seconds)** — `on` → import the demo → bring it up → open
      the route. The shortest path from zero to "it works", linkable from the
      root readme.
- [ ] **Scripting against the socket API** — consolidate the scattered `curl`
      snippets into one endpoint-driven walkthrough: handshake via `/v1/info`,
      drive `up`/`down`, import with `dryRun`, tail logs, subscribe to the event
      stream. Pairs with the daemon-as-headless-backend (devenv) use case.
- [ ] **Migrating from process-compose** — drop-in import, what changes
      (lifetime, ports → routes, Ctrl+E → re-import), and how to read the
      compatibility warnings. Converts the most likely incoming audience.
- [ ] **Tag a repository's services** — the "tag once, `outrider start my-repo`"
      workflow end to end, including `x-tags` in a compose file vs. the dashboard.
- [ ] **Health checks and start order** — author readiness/liveness probes and
      `depends_on` conditions, read the import report's resolved start order, and
      debug a service stuck `pending` on a gate.
- [ ] **Run a service at boot** — the desired-state + autostart mental model as a
      task: pick what should survive reboots, set it, verify after `off`/`on`.
- [ ] **Routing recipes** — fixed-port services, static aliases for
      `kubectl port-forward` / `tsh proxy`, the `framework` quirk hints, and
      sharing beyond localhost via portless's own LAN/Tailscale/ngrok pass-through.

**Applied this round:** Bun-version cleanup, demo fix, `docs/readme.md` index
de-dup, `contributing.md`, `glossary.md`, `setup.md` uninstall section.
**Deferred:** security note, growing demos, TOCs, and the guide backlog above
(per the "guide ideas, not built yet" instruction); LICENSE and visuals are out
of scope for now by decision.
