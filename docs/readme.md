# outrider documentation

outrider is a Bun-based, system-wide successor to process-compose: a persistent
per-user daemon that owns desired state for your services, an Ink dashboard to
manage them, and a native in-process router so services answer on hostnames like
`api.myapp.localhost` instead of memorised ports.

## Getting started

- [Installing](install.md): requirements, the install script or building from source, first run, uninstalling
- [Day-to-day usage](usage.md): the dashboard, logs, adding services, desired state
- [Guides](guides/): step-by-step walkthroughs
  - [Import processes](guides/import-processes.md): load a `process-compose.yaml`
  - [Add a routed service](guides/add-a-routed-service.md): create a service with networking
  - [Add a demo process](guides/add-a-demo-process.md): register a standalone service with no compose file
  - [Sync services at scale](guides/sync-services-at-scale.md): bulk-edit services via `~/.config/outrider.yml`
  - [Control outrider via the socket API](guides/control-outrider-via-the-socket-api.md): drive it from a script instead of the TUI
- [Demos](demos/readme.md): runnable example configurations

## Features

One capability per file; see the [features overview](features/readme.md) for the
broader context.

- [Service tags](features/service-tags.md): group services and control them as a unit
- [Config sync](features/sync-config.md): edit services at scale in `~/.config/outrider.yml`
- [Standalone services](features/standalone-services.md): registry-native services with no backing file
- [Importing processes](features/importing-processes.md): run existing `process-compose.yaml` files unedited
- [Native routing](features/native-routing.md): hostnames instead of memorised ports
- [The dashboard](features/the-dashboard.md): interactive TUI for managing everything
- [Socket API](features/socket-api.md): control the daemon over its unix socket instead of the TUI
- [Autostart and boot](features/autostart-and-boot.md): desired state that survives reboots

## Reference

- [CLI reference](cli-reference.md): command line interface and socket API endpoints
- [Config schema](config-schema.md): `process-compose.yaml` keys, outrider extensions, and upstream compatibility
- [Compatibility report](compatibility-report.md): detailed process-compose feature coverage
- [Test coverage](test-coverage.md): what the test suite exercises and where the gaps are
- [Scripts](scripts.md): what each file under `scripts/` does
- [Glossary](glossary.md): the vocabulary outrider uses, explained
- [Changelog](changelog.md): capabilities by month, newest first

## Architecture

How outrider works under the hood:

- [Overview](architecture/overview.md): system diagram and layering rules
- [Daemon](architecture/daemon.md): the control plane
- [API](architecture/api.md): the socket dispatcher CLI, TUI, and scripts all speak
- [Registry](architecture/registry.md): service and import model
- [Reconciler](architecture/reconciler.md): desired-state engine
- [Supervisor](architecture/supervisor.md): process lifecycle
- [Scheduler](architecture/scheduler.md): start order and dependency resolution
- [Prober](architecture/prober.md): health checks and readiness
- [Logger](architecture/logger.md): log collection and rotation
- [Router](architecture/router.md): the in-process routing proxy
- [TUI](architecture/tui.md): Ink dashboard and interaction
- [Feature parity with process-compose](architecture/feature-parity.md)

## Contributing

- [Contributing guide](contributing.md): where to start, and how to send changes
- [Developing outrider](develop.md): environment, codebase, scripts, and common tasks
- [Feature analysis](feature-analysis/): working notes on requested features, before they are built
