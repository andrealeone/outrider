# outrider

A Bun-based, system-wide successor to process-compose: a persistent per-user
daemon owns your services' desired state, an Ink dashboard manages them, and
[portless](https://www.npmjs.com/package/portless) gives them hostnames like
`api.myapp.localhost` instead of memorised ports. Existing
`process-compose.yaml` files import and run without edits.

```bash
curl -fsSL https://raw.githubusercontent.com/andrealeone/outrider/master/scripts/install.sh | bash

outrider on                 # start the daemon, enable it at boot
outrider                    # open the dashboard
outrider off                # stop everything, disable boot start
```

The whole public surface is those three commands; everything else — importing
stacks, adding/editing/deleting services, logs, routes, scaling — happens in
the dashboard or over the JSON socket API.

## Installing

The one-liner above downloads the binary matching your OS/CPU from the
[latest release](https://github.com/andrealeone/outrider/releases/latest) and
installs it to `~/.local/bin/outrider` — no package registry involved. See
[docs/install.md](docs/install.md) for requirements, pinning a version,
building from source, and uninstalling.

## Getting started

Once installed, `outrider on` then `outrider` is the whole flow: the dashboard
opens and everything else — importing a `process-compose.yaml`, adding a
standalone service, routing one to a hostname — happens from there. See
[docs/usage.md](docs/usage.md) for the day-to-day dashboard walkthrough, and
[docs/guides/](docs/guides/) for end-to-end guides on importing a stack,
adding a routed service, and syncing services at scale.

## Why outrider?

outrider is a brand new project heavily inspired by [process-compose](https://github.com/F1bonacc1/process-compose),
reimagined for a system-wide model. Where process-compose runs per-directory and answers HTTP requests,
outrider runs as a persistent daemon that owns your services' desired state across your entire development environment.
This means you get hostname-based routing instead of port juggling, a single dashboard for all your projects,
and configuration that survives reboots and terminal sessions. See the [feature parity document](docs/architecture/feature-parity.md)
for a detailed comparison.

Documentation lives in [docs/](docs/readme.md): installing, usage, the CLI and
socket reference, per-component architecture notes, the config schema with
its process-compose compatibility report, guides, and runnable demos.

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
