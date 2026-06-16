# Setup and installation

## Requirements

- macOS (arm64/x64) or Linux (x64/arm64). Windows is out of scope for v1.
- [Bun](https://bun.com) 1.3.10+ for building from source (the compiled binary
  embeds its own runtime).
- Optional: the [portless](https://www.npmjs.com/package/portless) CLI on PATH
  for named routes. Without it, everything works except hostnames; routed
  services start with a named warning instead.

## Meet Bun

You'll need Bun 1.3.10 or later to build outrider from source. Choose one method below:

### Via Homebrew (macOS or Linux)

```bash
brew install bun
```

To upgrade to the latest version:

```bash
brew upgrade bun
```

### Via asdf

If you use [asdf](https://asdf-vm.com) to manage runtime versions:

```bash
asdf plugin add bun
asdf install bun latest
asdf global bun latest
```

Or pin to a specific version:

```bash
asdf install bun 1.3.14
asdf global bun 1.3.14
```

### Did it work?

```bash
bun --version
```

Should output `1.3.10` or later. If you see "command not found", add Bun to your PATH (Homebrew usually does this; asdf setup is covered in its docs).

## Portless: hostname magic (optional but worth it)

[Portless](https://portless.sh) is the service routing layer that lets outrider
give your services human-friendly hostnames like `api.localhost` instead of
remembering ports. It's optional — everything works without it, but you won't
have named routes.

### The portless magic explained

Portless acts as a local reverse proxy with TLS termination. When you add a
routed service to outrider, the daemon allocates an ephemeral port and starts
your service. It then registers that port with portless under a hostname
(e.g. `api.localhost`), and portless proxies HTTPS traffic from the hostname
to your service.

On first use, portless generates a local certificate authority, adds it to your
system trust store, and listens on port 443. All this happens automatically — you
just need the CLI installed.

### Bring portless aboard

```bash
bun add -g portless
```

This installs portless globally. Verify it worked:

```bash
portless --version
```

For more details, see the [portless documentation](https://portless.sh) or the
[portless.md](architecture/portless.md) architecture guide in this repo.

## Compile it yourself

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
reject with *"Wrong url scheme for WebSocket"*.

To stop a stale runtime from shipping in a binary that can't talk to its own daemon,
`scripts/build.ts` refuses to compile on a Bun below the floor in `package.json`'s
`engines.bun` (currently `>=1.3.10`). If the guard trips, run `bun upgrade` and try again.

Cross-compile all four release targets with `bun scripts/build.ts --all`
(`dist/outrider-darwin-arm64`, `-darwin-x64`, `-linux-x64`, `-linux-arm64`).

### The fast loop

Run straight from source — no compile step — for rapid iteration. The same
entrypoint serves every surface:

```bash
bun src/main.ts               # dashboard, from source
bun src/main.ts on            # start the daemon from source
```

`bun run compile` is the rebuild-and-reinstall shortcut for development:
it builds `dist/outrider`, replaces `~/.local/bin/outrider`, then cycles the
daemon (`outrider off && outrider on`) so the freshly built binary takes over.

### Keep it honest

```bash
bun test                      # unit + integration tests
bun run check                 # fallow: types, lint, and health thresholds
bun run format                # oxfmt
```

## Spin it up

```bash
outrider on    # installs the launchd agent / systemd user unit, starts the daemon
outrider       # opens the dashboard
```

`outrider on` is idempotent. The daemon survives terminal and TUI exits, starts
at boot, and reconciles autostart services after a reboot. `outrider off` stops
every service in reverse dependency order, stops the daemon, and disables boot
start until the next `on`.

## Where everything lives

XDG conventions apply on macOS as well — one convention everywhere:

```
~/.config/outrider/config.yaml           daemon defaults (reserved)
~/.local/share/outrider/registry.json    desired state (atomic writes)
~/.local/share/outrider/journal.jsonl    event log and restart counters
~/.local/share/outrider/logs/<svc>/      rotated process logs
~/.local/share/outrider/daemon.log       daemon process log
$XDG_RUNTIME_DIR/outrider.sock           control socket (fallback: ~/.cache/outrider)
```

## The portless setup

On first proxy start portless generates a local CA, adds it to the system
trust store, and binds port 443 (sudo auto-elevation). The outrider daemon
checks, starts, and repairs the proxy itself — do **not** also install
portless's own service unit; exactly one component must own proxy startup.

Hostname policy: `.localhost` by default (browsers resolve it natively),
`.test` as the supported alternative. `.local` (mDNS collision) and `.dev`
(HSTS-forced) are refused and fall back to `.localhost`.

## Stuck? Here's help

### "bun: command not found"

Bun is not installed or not in your PATH.

**Fix:** Follow the [Bun installation](#installing-bun) section above. After
installing, verify with `bun --version`. If it still doesn't work, check that
Bun is in your PATH:

```bash
which bun
echo $PATH
```

If using Homebrew, Bun should be at `/opt/homebrew/bin/bun` (Apple Silicon) or
`/usr/local/bin/bun` (Intel). If using asdf, run `asdf rehash` and check that
`~/.asdf/shims` is in your PATH before other directories.

### "Wrong url scheme for WebSocket"

You built the binary with an older Bun version (< 1.3.10). The daemon's control
socket uses the `ws+unix://` scheme, which older Bun runtimes don't support.

**Fix:** Upgrade Bun to 1.3.10 or later, then rebuild:

```bash
bun upgrade
bun scripts/build.ts
cp dist/outrider ~/.local/bin/outrider
```

### "portless: command not found" warning when starting routed services

Portless is not installed globally. Routed services will start without hostnames.

**Fix:** Install portless with `bun add -g portless`, then restart the daemon:

```bash
bun add -g portless
outrider off
outrider on
```

If the warning persists, verify that portless is in your PATH:

```bash
which portless
portless --version
```

### `.local` hostnames not working

`.local` uses mDNS, which can conflict with other services on the network. Outrider
refuses `.local` hostnames and falls back to `.localhost` instead.

**Fix:** Use `.localhost` (the default) or `.test` (IANA-reserved) for routed
services. These are already the defaults; if you explicitly set a route to use
`.local`, change the route label to remove the `.local` suffix.

### "permission denied" when copying the binary to `~/.local/bin`

The directory doesn't exist or isn't writable.

**Fix:** Create the directory first:

```bash
mkdir -p ~/.local/bin
cp dist/outrider ~/.local/bin/outrider
chmod +x ~/.local/bin/outrider
```

Then ensure `~/.local/bin` is in your PATH:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### "Could not resolve version" during bun installation

This usually means the Bun registry is temporarily unavailable or your network
connection is blocked.

**Fix:** Try again in a few moments, or check your internet connection. If the
problem persists, you can also install Bun directly via Homebrew:

```bash
brew install bun
```
