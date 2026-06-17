# outrider documentation

outrider is a Bun-based, system-wide successor to process-compose: a persistent
per-user daemon that owns desired state for your services, an Ink dashboard to
manage them, and portless integration so services answer on hostnames like
`api.myapp.localhost` instead of memorised ports.

## Getting started

- [Setup and installation](setup.md): build from source, configure the environment, first run
- [Day-to-day usage](usage.md): dashboard navigation, adding services, logs and details

## Capabilities

Learn what outrider does, one feature at a time:

- [Service tags](features/service-tags.md): group services and control them as a unit
- [Standalone services](features/standalone-services.md): registry-native services with no backing file
- [Stacks and import](features/stacks-and-import.md): run existing `process-compose.yaml` files unedited
- [Portless routing](features/portless-routing.md): hostnames instead of memorised ports
- [The dashboard](features/the-dashboard.md): interactive TUI for managing everything
- [Autostart and boot](features/autostart-and-boot.md): desired state that survives reboots

See [features overview](features/readme.md) for the full list and broader context.

## Reference

- [CLI reference](cli-reference.md): command line interface and socket API endpoints
- [Config schema](config-schema.md): `process-compose.yaml` keys, outrider extensions, and upstream compatibility
- [Compatibility report](compatibility-report.md): detailed process-compose feature coverage

## Architecture

How outrider works under the hood:

- [Overview](architecture/overview.md): system diagram and layering rules
- [Daemon](architecture/daemon.md): the control plane
- [Registry](architecture/registry.md): service and stack model
- [Reconciler](architecture/reconciler.md): desired-state engine
- [Supervisor](architecture/supervisor.md): process lifecycle
- [Scheduler](architecture/scheduler.md): start order and dependency resolution
- [Prober](architecture/prober.md): health checks and readiness
- [Logger](architecture/logger.md): log collection and rotation
- [Router](architecture/router.md): route management and portless integration
- [TUI](architecture/tui.md): Ink dashboard and interaction

## Learn by example

- [Guides](guides/): step-by-step walkthroughs
  - [Import a stack](guides/import-a-stack.md): load a `process-compose.yaml`
  - [Add a routed service](guides/add-a-routed-service.md): create a service with networking
- [Demos](demos/readme.md): runnable example configurations
