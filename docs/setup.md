# Setup and installation

## Requirements

- macOS (arm64/x64) or Linux (x64/arm64). Windows is out of scope for v1.
- [Bun](https://bun.com) 1.3.10+ for building from source (the compiled binary
  embeds its own runtime).
- Optional: the [portless](https://www.npmjs.com/package/portless) CLI on PATH
  for named routes (`bun add -g portless`). Without it, everything works except
  hostnames; routed services start with a named warning instead.

## Building from source

```bash
git clone <repo> && cd outrider
bun install
bun scripts/build.ts          # → dist/outrider (~60 MB, self-contained)
cp dist/outrider ~/.local/bin/outrider
```

One binary contains the CLI, the TUI, and the daemon (`outrider daemon run` is
the same file), so installation is a single copy.

`bun build --compile` embeds the **running** Bun as the binary's runtime, so the
binary is only as new as the Bun that built it. The daemon's live event stream
rides a unix-socket WebSocket on the `ws+unix://` scheme, which older runtimes
reject with *"Wrong url scheme for WebSocket"*. To stop a stale runtime from
shipping in a binary that can't talk to its own daemon, `scripts/build.ts`
refuses to compile on a Bun below the floor in `package.json`'s `engines.bun`
(currently `>=1.3.10`); run `bun upgrade` if the guard trips.

Cross-compile all four release targets with `bun scripts/build.ts --all`
(`dist/outrider-darwin-arm64`, `-darwin-x64`, `-linux-x64`, `-linux-arm64`).

### Iterating locally

Run straight from source — no compile step — for the fast inner loop; the same
entrypoint serves every surface:

```bash
bun src/main.ts               # dashboard, from source
bun src/main.ts on            # start the daemon from source
```

`bun run compile` is the one-shot rebuild-and-reinstall used while developing:
it builds `dist/outrider`, replaces `~/.local/bin/outrider`, then cycles the
daemon (`outrider off && outrider on`) so the freshly built binary takes over.

### Checks and tests

```bash
bun test                      # unit + integration tests
bun run check                 # follow: types, lint, and health thresholds
bun run format                # oxfmt
```

## First run

```bash
outrider on    # installs the launchd agent / systemd user unit, starts the daemon
outrider       # opens the dashboard
```

`outrider on` is idempotent. The daemon survives terminal and TUI exits, starts
at boot, and reconciles autostart services after a reboot. `outrider off` stops
every service in reverse dependency order, stops the daemon, and disables boot
start until the next `on`.

## Filesystem layout

XDG conventions apply on macOS as well — one convention everywhere:

```
~/.config/outrider/config.yaml           daemon defaults (reserved)
~/.local/share/outrider/registry.json    desired state (atomic writes)
~/.local/share/outrider/journal.jsonl    event log and restart counters
~/.local/share/outrider/logs/<svc>/      rotated process logs
~/.local/share/outrider/daemon.log       daemon process log
$XDG_RUNTIME_DIR/outrider.sock           control socket (fallback: ~/.cache/outrider)
```

## Routing prerequisites (optional)

On first proxy start portless generates a local CA, adds it to the system
trust store, and binds port 443 (sudo auto-elevation). The outrider daemon
checks, starts, and repairs the proxy itself — do **not** also install
portless's own service unit; exactly one component must own proxy startup.

Hostname policy: `.localhost` by default (browsers resolve it natively),
`.test` as the supported alternative. `.local` (mDNS collision) and `.dev`
(HSTS-forced) are refused and fall back to `.localhost`.
