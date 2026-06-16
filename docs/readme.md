# outrider documentation

Welcome. outrider is a Bun-based, system-wide successor to process-compose: a
persistent per-user daemon that owns desired state for your services, an Ink
dashboard to manage them, and portless integration so services answer on
hostnames like `api.myapp.localhost` instead of memorised ports.

This documentation is organized into three areas: the essentials (setup, usage,
and API), architecture and internals, and guides for common workflows. Start
with [Setup and installation](setup.md) if you're new. Dig into [Architecture](#architecture)
to understand how outrider works. Check [Guides](#guides) for hands-on how-tos.

## Contents

- [Setup and installation](setup.md)
- [Day-to-day usage](usage.md)
- [CLI reference](cli-reference.md)
- [Config schema and compatibility](config-schema.md)
- [Compatibility report vs process-compose](compatibility-report.md)

### Under the hood

- [Overview](architecture/overview.md)
- [Daemon](architecture/daemon.md) · [Registry](architecture/registry.md) ·
  [Reconciler](architecture/reconciler.md) · [Supervisor](architecture/supervisor.md) ·
  [Scheduler](architecture/scheduler.md) · [Prober](architecture/prober.md) ·
  [Logger](architecture/logger.md) · [Router](architecture/router.md) ·
  [Portless integration](architecture/portless.md) · [TUI](architecture/tui.md)

### Common workflows

- [Import a stack](guides/import-a-stack.md)
- [Add a routed service](guides/add-a-routed-service.md)

### Try it out

- [Runnable demo configs](demos/readme.md)
