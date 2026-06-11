# Setup and installation

## Requirements

- macOS (arm64/x64) or Linux (x64/arm64). Windows is out of scope for v1.
- [Bun](https://bun.com) 1.3.14+ for building from source (the compiled binary
  embeds its own runtime).
- Optional: the [portless](https://www.npmjs.com/package/portless) CLI on PATH
  for named routes (`bun add -g portless`). Without it, everything works except
  hostnames; routed services start with a named warning instead.

## Install from source

```bash
git clone <repo> && cd outrider
bun install
bun scripts/build.ts          # → dist/outrider (~60 MB, self-contained)
cp dist/outrider ~/.local/bin/outrider
```

Cross-compile all four release targets with `bun scripts/build.ts --all`.

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
