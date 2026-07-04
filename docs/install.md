# Installing outrider

The complete path from nothing to a running daemon: requirements, the install
script, building from source instead, first run, and uninstalling. Day-to-day
usage starts once `outrider on` has run once; see [usage.md](usage.md) for that.

## Requirements

- macOS (arm64/x64) or Linux (x64/arm64). Windows is out of scope for v1.
- [Bun](https://bun.com) 1.3.10+, only if you're building from source (the
  compiled binary embeds its own runtime, so an installed-from-script outrider
  needs no Bun at all).
- Optional: the [portless](https://www.npmjs.com/package/portless) CLI on
  `PATH` for named routes (`bun add -g portless`). Without it, everything
  works except hostnames; routed services start with a named warning instead,
  and start on a plain port. See [the router](architecture/router.md) for the
  proxy lifecycle and hostname policy this unlocks.

## Installing

```bash
curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash
```

This downloads the compiled binary matching your OS and CPU from the
[latest GitHub release](https://github.com/andrealeone/outrider/releases/latest)
into `~/.local/bin/outrider` (override the install root with
`OUTRIDER_INSTALL`), and tells you to add that directory to `PATH` if it isn't
there already. Pass a tag to install a specific version instead of latest:

```bash
curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash -s v0.1.0
```

There is no package registry involved: the script, a GitHub release, and the
binary it downloads are the entire mechanism. See [`scripts.md`](scripts.md)
for what `install.sh` does internally and how a release is cut.

## Building from source

Prefer this over the install script if you're contributing, or want a build
newer than the latest tagged release:

```bash
git clone https://github.com/andrealeone/outrider.git && cd outrider
bun install
bun scripts/build.ts          # → dist/bin/outrider (~60 MB, self-contained)
cp dist/bin/outrider ~/.local/bin/outrider
```

One binary contains the CLI, the TUI, and the daemon (`outrider daemon run` is
the same file), so installation is a single copy.

`bun build --compile` embeds the **running** Bun as the binary's runtime, so
the binary is only as new as the Bun that built it. The daemon's live event
stream rides a unix-socket WebSocket on the `ws+unix://` scheme, which older
runtimes reject with _"Wrong url scheme for WebSocket"_. To stop a stale
runtime from shipping in a binary that can't talk to its own daemon,
`scripts/build.ts` refuses to compile on a Bun below the floor declared in
`package.json`'s `engines.bun`; run `bun upgrade` if the guard trips.

Cross-compile all four release targets with `bun scripts/build.ts --all`
(`dist/bin/outrider-darwin-arm64`, `-darwin-x64`, `-linux-x64`,
`-linux-arm64`) — the same targets `scripts/release.ts` attaches to a GitHub
release for `scripts/install.sh` to download. Building from source day to day
for active development (no compile step, instant edits) is covered in
[developing outrider](develop.md#getting-set-up) instead of here, since that's
an inner-loop workflow rather than an install step.

## First run

```bash
outrider on    # installs the launchd agent / systemd user unit, starts the daemon
outrider       # opens the dashboard
```

`outrider on` is idempotent. The daemon survives terminal and TUI exits,
starts at boot, and reconciles autostart services after a reboot. `outrider
off` stops every service in reverse dependency order, stops the daemon, and
disables boot start until the next `on`.

Installing (or building) creates this layout on first run, using XDG
conventions on macOS as well as Linux, one convention everywhere:

```
~/.config/outrider/config.yaml           daemon defaults (reserved)
~/.local/share/outrider/registry.json    desired state (atomic writes)
~/.local/share/outrider/journal.jsonl    event log and restart counters
~/.local/share/outrider/logs/<svc>/      rotated process logs
~/.local/share/outrider/daemon.log       daemon process log
$XDG_RUNTIME_DIR/outrider.sock           control socket (fallback: ~/.cache/outrider)
```

## Uninstalling

```bash
outrider off                              # stops services, removes the service unit and socket
rm ~/.local/bin/outrider                  # remove the binary
rm -rf ~/.local/share/outrider            # registry, journal, logs (your desired state)
rm -rf ~/.config/outrider ~/.config/outrider.yml   # daemon config + sync mirror, if present
```

`outrider off` must run first: it removes the launchd agent / systemd user
unit (so nothing resurrects the daemon) and shuts services down cleanly. The
`~/.local/share/outrider` removal is what erases your registered services;
skip it to keep your desired state for a later reinstall. outrider does not
touch portless's own state or the CA it installed; remove those with
portless's own tooling if you no longer want it.
