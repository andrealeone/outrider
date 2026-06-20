# Guide: sync services at scale

Goal: define or change many standalone services at once by editing a single
file, then apply the edits in one reviewed step.

The dashboard is great for one service at a time. When you want to add ten
services, retag a group, or bump an env var across several, edit
`~/.config/outrider.yml` and run `outrider sync`. This guide walks the whole
loop; for the field-by-field reference see [config sync](../features/sync-config.md).

## The mental model

The **registry is the source of truth.** `~/.config/outrider.yml` is a plaintext
mirror of it, and the relationship is a one-file, two-direction loop:

- **Registry → file (automatic).** Whenever you add, edit, or remove a service
  (in the dashboard, over the socket, or via an earlier `sync`), the daemon
  rewrites the file. You never hand-edit it to keep it current; it tracks
  reality on its own.
- **File → registry (on demand).** You edit the file, then run `outrider sync`
  to reconcile your edits back into the registry.

Only **standalone** services live in the file. Stack members are owned by their
`process-compose.yaml` and are refreshed by re-importing; `sync` never creates,
updates, or deletes them, and they never appear in the file.

The file path honours `XDG_CONFIG_HOME`; with that unset it is
`~/.config/outrider.yml`.

## Prerequisite

The daemon must be running; `sync` applies its changes through the socket API.
If it is down, `sync` stops with a message telling you to start it:

```bash
outrider on
```

## 1. Get a starting file

On the very first run, if the file doesn't exist yet, `sync` writes it from the
current registry and stops:

```bash
outrider sync
# Wrote ~/.config/outrider.yml from the current registry. Edit it and run
# `outrider sync` again.
```

You now have an accurate snapshot to edit. (If you already have services in the
dashboard, the daemon has been keeping the file current all along, so you can
skip straight to editing.)

## 2. Edit the file

```yaml
services:
  api:
    command: bun run api.ts
    working_dir: ~/code/api # optional
    autostart: true # optional, default false
    restart: on_failure # optional: no | on_failure | always
    tags: [web, edge] # optional: list or comma-separated string
    route: api # optional: portless hostname label
    alias_port: 10020 # optional: fixed-port (alias) route
    namespace: backend # optional
    env: # optional, a KEY: value mapping
      LOG_LEVEL: debug
```

`command` is the only required field; every other key is optional and falls
back to its default when omitted. The service **id is the map key** under
`services:`; that key is the identity. To add a service, add a block; to remove
one, delete its block; to change one, edit its fields.

A few semantics worth knowing before you edit:

- **`tags`** may be a YAML list (`[web, edge]`) or a comma-separated string
  (`"web, edge"`); both normalise to the same set.
- **`alias_port`** turns the route into a static portless alias pointing at a
  port the command owns itself (`kubectl port-forward`, `tsh proxy`); it
  requires `route` to be set. Leave it out for a normal daemon-managed route.
  See [add a routed service](add-a-routed-service.md).
- **`env`** is a mapping of `KEY: value`, not a list of `KEY=value` lines.
- **Renames aren't expressed here.** Changing a map key reads as deleting the
  old service and creating a new one, because the id is the identity. Rename in
  the dashboard instead.
- **Replica counts** are runtime scaling, managed in the dashboard, and are not
  part of this file.

## 3. Review and apply

Run `sync` again with no arguments. It parses the file, diffs it against the
live registry, and resolves each difference into one operation:

- **create**: a service in the file the registry doesn't have
- **update**: a service whose fields differ (the changed fields are listed)
- **delete**: a standalone service in the registry that's absent from the file

On a terminal this opens an interactive checklist:

```
sync · 3 changes from ~/.config/outrider.yml

› [x] + create  worker
  [x] ~ update  api · changes: env, tags
  [x] - delete  old-cron

[space] toggle · [a] all/none · [↵] apply 3 · [q] cancel
```

Every row is checked by default. Drive it with:

| Key                | Action                              |
| ------------------ | ----------------------------------- |
| `j` / `k`, arrows  | move the cursor                     |
| `space`            | toggle the focused row              |
| `a`                | check all / uncheck all             |
| `enter`            | apply **only the checked rows**     |
| `q` / `esc`        | cancel without applying anything    |

Each operation is applied independently and reported with a ✓ or ✗, so one
rejected change (an invalid command, a route conflict) doesn't block the rest.
Press `q` on the results screen to close.

## Applying non-interactively

For scripts and CI, skip the checklist and apply every change at once:

```bash
outrider sync --yes   # or -y
```

It prints a per-operation summary and exits non-zero if any operation failed.

Without a TTY (a pipe, a CI step) and without `--yes`, `sync` refuses to apply
anything and exits non-zero; the prompt-or-`--yes` rule keeps an unattended run
from making changes you never saw. So in automation, always pass `--yes`.

## What counts as a change

Comparison is normalised before diffing, so cosmetic edits don't show up as
operations:

- leading/trailing whitespace is trimmed,
- fields left at their defaults (e.g. `restart: no`, `autostart: false`) are
  dropped,
- tags are lowercased, de-duplicated, and sorted, so case and order don't
  matter,
- env keys are sorted, so reordering them isn't a change.

Because of this, a freshly exported file diffs clean, and re-running `sync`
immediately after applying is a no-op (`Registry already in sync`).

## When something is off

- **Daemon not running**: `sync` tells you to `outrider on` and exits non-zero;
  nothing is read or changed.
- **Malformed file**: a YAML syntax error, a missing `command`, a bad `restart`
  value, or `env`/`tags` of the wrong shape stops `sync` before any operation
  runs, naming the offending service and field. Fix the file and re-run.
- **A single operation fails**: the others still apply; the failed row shows ✗
  with the daemon's reason, and the run exits non-zero.

## Recipes

Retag a group of services, then apply unattended:

```bash
$EDITOR ~/.config/outrider.yml   # adjust the `tags:` lists
outrider sync --yes
```

Stamp out a new service from a script without touching the dashboard: append a
block to the file and `outrider sync --yes`. The daemon will then keep the file
in sync as the service's runtime state evolves.

Audit what would change before committing to it: run `outrider sync` and read
the checklist; pressing `q` applies nothing.

## See also

- [Config sync reference](../features/sync-config.md): the file format and
  lifecycle in reference form.
- [Standalone services](../features/standalone-services.md): what lives in the
  file and what doesn't.
- [Config schema](../config-schema.md): the full field reference, including the
  stack-file equivalents.
