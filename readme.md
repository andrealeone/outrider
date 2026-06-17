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

## Features

- **[Service tags](docs/features/service-tags.md)**: group services and start/stop a whole tag at once
- **[Standalone services](docs/features/standalone-services.md)**: registry-native services with no backing file
- **[Stacks and import](docs/features/stacks-and-import.md)**: run existing `process-compose.yaml` files unedited
- **[Portless routing](docs/features/portless-routing.md)**: hostnames instead of memorised ports
- **[The dashboard](docs/features/the-dashboard.md)**: the Ink TUI that manages everything
- **[Autostart and boot](docs/features/autostart-and-boot.md)**: desired state that survives reboots

## Documentation

Full documentation lives in [docs/](docs/readme.md):

- **Getting started:** [Setup and installation](docs/setup.md), [day-to-day usage](docs/usage.md)
- **Reference:** [CLI reference](docs/cli-reference.md), [config schema](docs/config-schema.md), [socket API](docs/cli-reference.md#socket-api-the-contract-behind-every-command)
- **How it works:** [Architecture overview](docs/architecture/overview.md) and [per-component deep dives](docs/architecture/)
- **Learn by example:** [Guides](docs/guides/) and [runnable demos](docs/demos/readme.md)

## Development

```bash
bun test                          # unit + integration suites
bun run check                     # typecheck, lint, format
bun scripts/generate-manifest.ts  # after adding a CLI command file
```

---

Pinned: Bun 1.3.14 (`.bun-version`), portless 0.14.0. Runtime dependencies
are ink, react, and portless — anything beyond that needs a written
justification in the change that introduces it.
