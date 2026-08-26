# Test coverage

A map of what the test suite exercises, which source areas are well covered, and
where the gaps are. Treat it as a living document: update it alongside the tests
it describes, the same rule the rest of `/docs` follows.

## Where tests live

All tests live under `tests/` at the repository root, in a tree that mirrors
`src/` so a module and its test are easy to pair up:

```
tests/
  unit/
    daemon/
      config/
        config.test.ts          # the config pipeline, with golden fixtures/
        fixtures/               # real process-compose files used by config.test
      router/
        quirks.test.ts
        hosts-sync.test.ts
        proxy-engine.test.ts
      integration.test.ts        # end-to-end daemon: spawn → reconcile → route
      registry.test.ts
      router.test.ts             # the real NativeRouter, plain-HTTP and TLS
    shared/
      sync/sync.test.ts
      utils/
        env.test.ts
        path-env.test.ts
        preferences.test.ts
        ring-buffer.test.ts
    scripts/
      install.test.ts
```

Tests import the code under test from `src/` through the `@/` path alias.
Fixtures are co-located with the test that reads them (`config.test.ts`
resolves them through `import.meta.dir`).

## Running

```bash
bun test                       # run everything (discovers tests/ recursively)
bun test tests/unit/shared/sync # run one directory
bun test --coverage            # per-file function/line coverage table
```

## Test suites

| Suite                                                                                        | Exercises                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `daemon/config/config.test.ts`                                                               | The whole config pipeline: discovery, deep merge, env expansion, vars templating, DAG/cycle detection, validation (including `x-route` label/uniqueness rules), and `loadProject` against golden `process-compose.yaml` fixtures.                                                                                                                                                                 |
| `daemon/router/quirks.test.ts`                                                               | The `--port` quirk table for frameworks that ignore the injected `PORT` (Vite, Astro, Expo, …).                                                                                                                                                                                                                                                                                                   |
| `daemon/router/hosts-sync.test.ts`                                                           | The `/etc/hosts` marked block: sync, re-sync in place, drift detection — against a sandboxed file, never the real `/etc/hosts`.                                                                                                                                                                                                                                                                   |
| `daemon/router/proxy-engine.test.ts`                                                         | The plain-HTTP forwarding path against a real `ProxyEngine` and a real `Bun.serve` upstream: Host-header forwarding, 404 route listing, 508 loop guard, upstream status/body passthrough, and a 502 on a dead upstream. WebSocket/HMR splice (`handleUpgrade`) is not covered here — see gaps below.                                                                                              |
| `daemon/router.test.ts`                                                                      | The real `NativeRouter`: hostname computation, register/unregister, conflict detection, `ensureReady`/`inspect` in both plain-HTTP (default) and TLS-explicitly-enabled modes, leaf re-mint on hostname-set change. `CertAuthority`/`HostsSync` are constructed with sandboxed paths so the suite never touches the real machine's trust store, `/etc/hosts`, or `~/.local/share/outrider/certs`. |
| `daemon/registry.test.ts`                                                                    | Tag normalisation/validation, `x-tags` parsing, and `resolveIds` name resolution (exact id wins; otherwise the union of source tag, namespace, and tag). Drives the registry through a real `StateStore` and `EventBus`.                                                                                                                                                                          |
| `daemon/integration.test.ts`                                                                 | The daemon as a whole over a real unix socket: a `Client` driving `Api` → `Registry`/`Reconciler`/`Supervisor`/`Logger`/`Prober` with a fake `Router`. Covers start/stop, status transitions, log capture, route injection (`managed` and `static` kind), route-name uniqueness, and the version handshake.                                                                                       |
| `shared/sync/sync.test.ts`                                                                   | The config-sync codec and diff: export/parse round-trips, field coercion and named errors, `toDefinition` mapping, the create/update/delete diff (changed-field reporting, tag normalisation, imported services left untouched), and an on-disk `writeSyncFile`.                                                                                                                                  |
| `shared/utils/env.test.ts`, `path-env.test.ts`, `preferences.test.ts`, `ring-buffer.test.ts` | `.env`/env-list parsing, PATH augmentation, persisted preferences, the bounded log ring buffer.                                                                                                                                                                                                                                                                                                   |

## Coverage by area

Snapshot from `bun test --coverage` (function % / line %). The integration test
is what gives many daemon internals their coverage even though no suite targets
them directly.

**Well covered (≥90% lines)**

| Module                                                                            | Funcs / Lines |
| --------------------------------------------------------------------------------- | ------------- |
| `daemon/api.ts`                                                                   | 91 / 100      |
| `daemon/config/dag.ts`, `expand.ts`, `load.ts`, `merge.ts`, `template.ts`         | 100 / 100     |
| `daemon/config/discover.ts`                                                       | 100 / 95      |
| `daemon/reconciler.ts`                                                            | 84 / 100      |
| `daemon/registry.ts`                                                              | 85 / 98       |
| `daemon/router.ts`                                                                | 90 / 98       |
| `daemon/router/hosts-sync.ts`                                                     | 100 / 100     |
| `daemon/router/proxy-engine.ts`                                                   | 88 / 83       |
| `daemon/router/quirks.ts`                                                         | 100 / 100     |
| `daemon/router/route-table.ts`                                                    | 90 / 96       |
| `daemon/supervisor.ts`                                                            | 88 / 91       |
| `shared/sync/sync-diff.ts`                                                        | 100 / 100     |
| `shared/sync/sync-file.ts`                                                        | 93 / 98       |
| `shared/utils/atomic-file.ts`, `env.ts`, `paths.ts`, `stream-lines.ts`, `tags.ts` | 100 / 100     |
| `shared/version.ts`                                                               | 100 / 100     |

**Partially covered**

| Module                                    | Funcs / Lines | Note                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `daemon/config/validate.ts`               | 100 / 86      | Many error branches unhit.                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `daemon/router/cert-authority.ts`         | 92 / 80       | `trust()` (shells to `security`/`sudo`) is intentionally never exercised by automated tests — it mutates the real system trust store.                                                                                                                                                                                                                                                                                                                                             |
| `daemon/logger.ts`                        | 67 / 85       | Rotation/compression paths thin.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `daemon/scheduler.ts`                     | 71 / 75       | Some gate conditions unhit.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `daemon/state-store.ts`                   | 86 / 73       | Journal/rotation paths thin.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `daemon/event-bus.ts`                     | 50 / 89       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `shared/client.ts`                        | 70 / 86       | Error/edge paths unhit.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `shared/utils/ring-buffer.ts`             | 80 / 86       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `shared/utils/time.ts`                    | 83 / 62       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `shared/utils/net.ts`                     | 50 / 71       | The 4000-4999 route-port allocator's fallback path is unhit.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `daemon/prober.ts`                        | 25 / 2        | **Effectively untested**: constructed by the integration test but its probe logic never runs. The most valuable daemon gap to close.                                                                                                                                                                                                                                                                                                                                              |
| `daemon/router/proxy-engine.ts` (partial) | 88 / 83       | The plain-HTTP forwarding path is covered (see suites above); `handleUpgrade` (the WebSocket/HMR raw-socket splice) has no automated coverage — verified only by manual end-to-end smoke tests during development, never in `bun:test`. TLS mode is exercised at the API level (`router.test.ts`) but its actual handshake/forwarding is also manual-only, since Bun cannot self-connect `fetch` to its own `node:http2` TLS listener (see [the router](architecture/router.md)). |

## Gaps: no automated coverage

These source files are never imported by a test. The CLI and TUI layers are the
largest untested surfaces; both are thin clients over the socket, so the daemon
integration test exercises the behaviour behind them indirectly, but the command
wiring and React components themselves have no tests.

- **CLI** (`src/cli/`): `dispatch.ts`, `manifest.ts`, `updown.ts`, and every command (`on`, `off`, `start`, `stop`, `sync`, `state`, `daemon/run`, the root). Name resolution and the sync codec they call are tested; the argument parsing, output, and `on`'s routing-repair call (`CertAuthority.trust()` / `HostsSync.sync()`) are not.
- **TUI** (`src/tui/`): the whole Ink layer: `app.tsx`, every component (`dashboard`, `logs-view`, `detail-view`, `add-service`, `import-processes`, `service-table`, `status-badge`, `header`, `text-input`, `sync-view`, `alert`), `sync.tsx`, `use-daemon.ts` (including the `proxyStatus` fetch), `frame-clock.ts`, `theme.ts`, `devtools-stub.ts`.
- **Daemon bootstrap**: `daemon/daemon.ts` (process lifecycle, lock file, the sync-file mirror hook, `router.ensureReady()` at boot).
- **Shared**: `shared/service-unit.ts` (launchd/systemd unit templating) and `shared/utils/format.ts`.
- **Entry point**: `src/main.ts`.

## Suggested priorities

1. **`daemon/prober.ts`**: exec and http probe logic is core (dependencies and the moat) yet essentially unexercised.
2. **`daemon/router/proxy-engine.ts`'s `handleUpgrade`**: a `bun:test` WebSocket-echo fixture spliced through a running `ProxyEngine` would close the remaining forwarding gap (the plain-HTTP request path is now covered).
3. **`shared/service-unit.ts`**: unit-file generation is install-critical and pure, so cheap to test.
4. **CLI dispatch**: `dispatch.ts`/`manifest.ts` resolution and unknown-command handling are pure and easy to cover.
