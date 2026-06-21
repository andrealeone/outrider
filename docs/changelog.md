# Changelog

A high-level record of what outrider can do, newest first. Dates are coarse — month
and year only — and each line names a capability, not a commit. Follow the links for
the detail behind any entry.

## June 2026

The first working shape of the tool: a persistent per-user daemon, an Ink dashboard,
and drop-in process-compose compatibility, with the system-wide niceties layered on
top.

**Managing services at scale**

- [Config sync](features/sync-config.md) — read and bulk-edit standalone services
  through `~/.config/outrider.yml`, then apply with `outrider sync`.
- [Service tags](features/service-tags.md) — group services and start or stop a whole
  tag at once, from the CLI or the dashboard.

**System-wide model**

- [Standalone services](features/standalone-services.md) — registry-native services
  with no backing file, defined straight from the dashboard.
- [Stacks and import](features/stacks-and-import.md) — run an existing
  `process-compose.yaml` unedited, linked to its source by path and content hash.
- [Autostart and boot](features/autostart-and-boot.md) — desired state that survives
  reboots, reconciled when the daemon comes back up.

**Routing**

- [Portless routing](features/portless-routing.md) — services answer on hostnames like
  `api.myapp.localhost` instead of memorised ports, with static aliases for fixed-port
  targets.

**The interface**

- [The dashboard](features/the-dashboard.md) — virtualised service table with per-row
  toggles, live transitions, logs, detail, add/edit, and import flows; one vim-style
  keymap and a dark/light theme pair.
- `outrider on` / `outrider off` — install the launchd or systemd user unit and bring
  the daemon up or down; `outrider start` / `stop` act on ids, stacks, namespaces, and
  tags.

**Foundations**

- A single daemon owning registry, reconciler, supervisor, scheduler, prober, logger,
  and router, behind a unix-socket control plane.
- Full process-compose schema parsing — multi-file merge, env layering, templating,
  `depends_on` conditions, readiness and liveness probes, restart policy — with cut and
  deferred keys parsed and warned rather than silently ignored.
- A single-executable build via `bun build --compile`, and a `/docs` wiki kept in step
  with the code.
