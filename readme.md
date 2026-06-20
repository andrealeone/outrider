# outrider

A Bun-based, system-wide successor to process-compose: a persistent per-user
daemon owns your services' desired state, an Ink dashboard manages them, and
[portless](https://www.npmjs.com/package/portless) gives them hostnames like
`api.myapp.localhost` instead of memorised ports. Existing
`process-compose.yaml` files import and run without edits.

```bash
bun install
bun scripts/build.ts        # → dist/outrider (single self-contained binary)

outrider on                 # start the daemon, enable it at boot
outrider                    # open the dashboard
outrider off                # stop everything, disable boot start
```

The whole public surface is those three commands; everything else — importing
stacks, adding/editing/deleting services, logs, routes, scaling — happens in
the dashboard or over the JSON socket API.

## Why outrider?

outrider is a brand new project heavily inspired by [process-compose](https://github.com/F1bonacc1/process-compose),
reimagined for a system-wide model. Where process-compose runs per-directory and answers HTTP requests,
outrider runs as a persistent daemon that owns your services' desired state across your entire development environment.
This means you get hostname-based routing instead of port juggling, a single dashboard for all your projects,
and configuration that survives reboots and terminal sessions. See the [feature parity document](docs/architecture/feature-parity.md)
for a detailed comparison.

Documentation lives in [docs/](docs/readme.md): setup, usage, the CLI and
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

---

Pinned: portless 0.14.0. Runtime dependencies are ink, react, and portless —
anything beyond that needs a written justification in the change that
introduces it.
