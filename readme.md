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

Documentation lives in [docs/](docs/readme.md): setup, usage, the CLI and
socket reference, per-component architecture notes, the config schema with
its process-compose compatibility report, guides, and runnable demos.

## Development

```bash
bun test                          # unit + integration suites
bun run check                     # typecheck, lint, format
bun scripts/generate-manifest.ts  # after adding a CLI command file
```

Pinned: Bun 1.3.14 (`.bun-version`), portless 0.14.0. Runtime dependencies
are ink, react, and portless — anything beyond that needs a written
justification in the change that introduces it.
