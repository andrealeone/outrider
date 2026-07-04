<h1 align="center"><pre>outrider</pre></h1>

**A system-wide successor to process-compose.** Instead of running
per-project, outrider is a persistent per-user daemon that owns the desired state of
all your services, with a TUI dashboard for managing them. Pair it with
[portless](https://www.npmjs.com/package/portless) and your services get
hostnames like `https://myapp.localhost` instead of ports you have to memorise.
Point it at an existing `process-compose.yaml` and it imports the whole stack.
It just runs, no edits needed.

```bash
curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash

outrider on                 # start the daemon, enable it at boot
outrider                    # open the dashboard
outrider off                # stop everything, disable boot start
```

That's the entire CLI: three commands. Everything else, importing stacks,
adding, editing and deleting services, viewing logs, managing routes,
scaling, is done from the dashboard or over the JSON socket API.

## Installing

The `curl` one-liner above grabs the binary for your OS and CPU from the
[latest release](https://github.com/andrealeone/outrider/releases/latest)
and drops it at `~/.local/bin/outrider`, no package registry needed. For
version pinning, building from source, and uninstalling, see
[docs/install.md](docs/install.md).

## Getting started

Run `outrider on`, then `outrider`, and you're done with the terminal: the
dashboard takes it from there, whether you're importing a
`process-compose.yaml`, adding a standalone service, or routing one to a
hostname. [docs/usage.md](docs/usage.md) walks through the dashboard
day-to-day, and [docs/guides/](docs/guides/) has end-to-end guides for
importing a stack, adding a routed service, and syncing services at scale.

## Why outrider?

outrider is a new project, heavily inspired by
[process-compose](https://github.com/F1bonacc1/process-compose) but built
around a different model. process-compose runs per-directory and speaks
HTTP; outrider runs as a persistent daemon that owns your services' desired
state across your whole development environment. In practice that gets you
hostname-based routing instead of port juggling, one dashboard for every
project, and a state that survives reboots instead of dying with your
terminal session. For the full comparison, see the
[feature parity document](docs/architecture/feature-parity.md).

Documentation lives in [docs/](docs/readme.md): installation, usage, the CLI
and socket reference, architecture notes per component, the config schema
with its process-compose compatibility report, guides, and runnable demos.

## Features

- **[Service tags](docs/features/service-tags.md)**: group services and start/stop a whole tag at once
- **[Standalone services](docs/features/standalone-services.md)**: registry-native services with no backing file
- **[Stacks and import](docs/features/stacks-and-import.md)**: run existing `process-compose.yaml` files unedited
- **[Portless routing](docs/features/portless-routing.md)**: hostnames instead of memorised ports
- **[The dashboard](docs/features/the-dashboard.md)**: the Ink TUI that manages everything
- **[Autostart and boot](docs/features/autostart-and-boot.md)**: desired state that survives reboots

## Development

```bash
bun test                          # unit + integration suites
bun run check                     # typecheck, lint, format
bun scripts/generate-manifest.ts  # after adding a CLI command file
```
