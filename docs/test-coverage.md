# Test coverage

A map of what the test suite exercises, which source areas are well covered, and
where the gaps are. Treat it as a living document: update it alongside the tests
it describes, the same rule the rest of `/docs` follows.

## Where tests live

All tests live under `tests/` at the repository root, in a tree that mirrors
`src/` so a module and its test are easy to pair up:

```
tests/
  daemon/
    config/
      config.test.ts          # the config pipeline, with golden fixtures/
      fixtures/               # real process-compose files used by config.test
    framework-quirks.test.ts
    integration.test.ts        # end-to-end daemon: spawn → reconcile → route
    registry.test.ts
  shared/
    sync/sync.test.ts
    utils/
      env.test.ts
      ring-buffer.test.ts
```

Tests import the code under test from `src/` by relative path (for example
`../../src/daemon/registry`). Fixtures are co-located with the test that reads
them (`config.test.ts` resolves them through `import.meta.dir`).

## Running

```bash
bun test                       # run everything (discovers tests/ recursively)
bun test tests/shared/sync     # run one directory
bun test --coverage            # per-file function/line coverage table
```

## Test suites

| Suite | Exercises |
| ----- | --------- |
| `daemon/config/config.test.ts` | The whole config pipeline: discovery, deep merge, env expansion, vars templating, DAG/cycle detection, validation, and `loadProject` against golden `process-compose.yaml` fixtures. |
| `daemon/framework-quirks.test.ts` | The `--port` quirk table for frameworks that ignore the injected `PORT` (Vite, Astro, Expo, …). |
| `daemon/registry.test.ts` | Tag normalisation/validation, `x-tags` parsing, and `resolveIds` name resolution (exact id wins; otherwise the union of stack, namespace, and tag). Drives the registry through a real `StateStore` and `EventBus`. |
| `daemon/integration.test.ts` | The daemon as a whole over a real unix socket: a `Client` driving `Api` → `Registry`/`Reconciler`/`Supervisor`/`Logger`/`Prober` with a fake `Router`. Covers start/stop, status transitions, log capture, route + alias-port injection, and the version handshake. |
| `shared/sync/sync.test.ts` | The config-sync codec and diff: export/parse round-trips, field coercion and named errors, `toDefinition` mapping, the create/update/delete diff (changed-field reporting, tag normalisation, stack members left untouched), and an on-disk `writeSyncFile`. |
| `shared/utils/env.test.ts` | `.env` and env-list parsing. |
| `shared/utils/ring-buffer.test.ts` | The bounded log ring buffer. |

## Coverage by area

Snapshot from `bun test --coverage` (function % / line %). The integration test
is what gives many daemon internals their coverage even though no suite targets
them directly.

**Well covered (≥90% lines)**

| Module | Funcs / Lines |
| ------ | ------------- |
| `daemon/api.ts` | 94 / 100 |
| `daemon/config/dag.ts`, `expand.ts`, `load.ts`, `merge.ts`, `template.ts` | 100 / 100 |
| `daemon/config/discover.ts` | 100 / 95 |
| `daemon/framework-quirks.ts` | 100 / 100 |
| `daemon/reconciler.ts` | 82 / 100 |
| `daemon/registry.ts` | 82 / 97 |
| `daemon/registry-error.ts` | 100 / 100 |
| `daemon/supervisor.ts` | 89 / 91 |
| `shared/sync/sync-diff.ts` | 100 / 100 |
| `shared/sync/sync-file.ts` | 93 / 98 |
| `shared/utils/atomic-file.ts`, `env.ts`, `paths.ts`, `stream-lines.ts`, `tags.ts` | 100 / 100 |
| `shared/version.ts` | 100 / 100 |

**Partially covered**

| Module | Funcs / Lines | Note |
| ------ | ------------- | ---- |
| `daemon/config/validate.ts` | 100 / 86 | Many error branches unhit. |
| `daemon/logger.ts` | 67 / 85 | Rotation/compression paths thin. |
| `daemon/scheduler.ts` | 71 / 75 | Some gate conditions unhit. |
| `daemon/state-store.ts` | 86 / 69 | Journal/rotation paths thin. |
| `daemon/event-bus.ts` | 50 / 89 | |
| `shared/client.ts` | 72 / 85 | Error/edge paths unhit. |
| `shared/client-errors.ts` | 33 / 71 | |
| `shared/utils/ring-buffer.ts` | 80 / 86 | |
| `shared/utils/time.ts` | 83 / 62 | |
| `shared/utils/net.ts` | 50 / 100 | |
| `daemon/prober.ts` | 25 / 2 | **Effectively untested**: constructed by the integration test but its probe logic never runs. The most valuable daemon gap to close. |

## Gaps: no automated coverage

These source files are never imported by a test. The CLI and TUI layers are the
largest untested surfaces; both are thin clients over the socket, so the daemon
integration test exercises the behaviour behind them indirectly, but the command
wiring and React components themselves have no tests.

- **CLI** (`src/cli/`): `dispatch.ts`, `manifest.ts`, `updown.ts`, and every command (`on`, `off`, `start`, `stop`, `sync`, `state`, `daemon/run`, the root). Name resolution and the sync codec they call are tested; the argument parsing and output are not.
- **TUI** (`src/tui/`): the whole Ink layer: `app.tsx`, every component (`dashboard`, `logs-view`, `detail-view`, `add-service`, `import-stack`, `service-table`, `status-badge`, `header`, `text-input`, `sync-view`, `alert`), `sync.tsx`, `use-daemon.ts`, `frame-clock.ts`, `theme.ts`, `devtools-stub.ts`.
- **Daemon bootstrap & routing**: `daemon/daemon.ts` (process lifecycle, lock file, the sync-file mirror hook) and `daemon/router.ts` (the real portless bridge; the integration test substitutes a fake router).
- **Shared**: `shared/service-unit.ts` (launchd/systemd unit templating) and `shared/utils/format.ts`.
- **Entry point**: `src/main.ts`.

## Suggested priorities

1. **`daemon/prober.ts`**: exec and http probe logic is core (dependencies and the moat) yet essentially unexercised.
2. **`daemon/router.ts`**: the portless boundary is currently only ever a fake in tests; a contract test against the real interface would catch drift.
3. **`shared/service-unit.ts`**: unit-file generation is install-critical and pure, so cheap to test.
4. **CLI dispatch**: `dispatch.ts`/`manifest.ts` resolution and unknown-command handling are pure and easy to cover.
