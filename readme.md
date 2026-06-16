# outrider

A Bun-based, system-wide successor to process-compose: a persistent per-user
daemon owns your services' desired state, an Ink dashboard manages them, and
[portless](https://www.npmjs.com/package/portless) gives them hostnames like
`api.myapp.localhost` instead of memorised ports. Existing
`process-compose.yaml` files import and run without edits.

## Getting started

**New to outrider?** Start with the [setup guide](docs/setup.md) — it covers
installation, prerequisites, and common issues. For a complete overview of
features and architecture, see the [documentation index](docs/readme.md).

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

## Documentation

Full documentation lives in [docs/](docs/readme.md): setup and installation,
day-to-day usage, the CLI and socket API reference, per-component architecture
notes, the config schema with its process-compose compatibility report,
guides for common tasks, and runnable demo configurations.

## Development

```bash
bun test                          # unit + integration suites
bun run check                     # typecheck, lint, format
bun scripts/generate-manifest.ts  # after adding a CLI command file
```

Pinned: Bun 1.3.14 (`.bun-version`), portless 0.14.0. Runtime dependencies
are ink, react, and portless — anything beyond that needs a written
justification in the change that introduces it.
