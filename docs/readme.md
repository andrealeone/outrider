# outrider documentation

outrider is a Bun-based, system-wide successor to process-compose: a persistent
per-user daemon that owns desired state for your services, an Ink dashboard to
manage them, and portless integration so services answer on hostnames like
`api.myapp.localhost` instead of memorised ports.

## Contents

- [Setup and installation](setup.md)
- [Day-to-day usage](usage.md)
- [Features](features/readme.md)
- [CLI reference](cli-reference.md)
- [Config schema and compatibility](config-schema.md)
- [Compatibility report vs process-compose](compatibility-report.md)

### Architecture

- [Overview](architecture/overview.md)
- [Daemon](architecture/daemon.md) · [Registry](architecture/registry.md) ·
  [Reconciler](architecture/reconciler.md) · [Supervisor](architecture/supervisor.md) ·
  [Scheduler](architecture/scheduler.md) · [Prober](architecture/prober.md) ·
  [Logger](architecture/logger.md) · [Router](architecture/router.md) ·
  [TUI](architecture/tui.md)

### Guides

- [Import a stack](guides/import-a-stack.md)
- [Add a routed service](guides/add-a-routed-service.md)

### Demos

- [Runnable demo configs](demos/readme.md)
