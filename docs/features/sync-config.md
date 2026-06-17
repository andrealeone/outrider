# Config sync (`~/.config/outrider.yml`)

The registry is the source of truth for services. Alongside it, outrider keeps
a plaintext mirror at `~/.config/outrider.yml` (honouring `XDG_CONFIG_HOME`) so
you can read your services at a glance and edit a whole set at once.

## The lifecycle

It is a one-file, two-direction loop:

- **Registry → file (automatic).** Every time you add, edit, or remove a
  service through the dashboard — anything that changes the registry — the
  daemon rewrites the file. You never edit it to keep it current; it just
  tracks reality.
- **File → registry (on demand).** Edit the file directly to define or change
  many services at once, then run `outrider sync` to apply your edits.

Only **standalone** services appear in the file. Stack members are owned by
their `process-compose.yaml` and are managed by re-importing — `sync` never
touches them.

## `outrider sync`

```bash
outrider sync          # review the diff in an interactive checklist
outrider sync --yes    # apply every change without prompting (scripts, CI)
```

`sync` diffs the file against the live registry and resolves each difference to
one operation:

- **create** — a service in the file that the registry doesn't have
- **update** — a service whose fields differ (the changed fields are listed)
- **delete** — a standalone service in the registry that's absent from the file

On a terminal it opens a checklist: every change is checked by default; move
with `j`/`k`, toggle a row with `space`, toggle all with `a`, and press `enter`
to apply **only the checked rows**. Each result is reported with a ✓ or ✗, so a
single rejected change (an invalid command, a route conflict) doesn't block the
rest. `esc`/`q` cancels without applying anything.

Comparison is normalised — tag case and order, key order, and fields left at
their defaults don't count as changes — so a freshly exported file diffs clean,
and re-running `sync` right after applying is a no-op.

## First run

If the file doesn't exist yet, `outrider sync` writes it from the current
registry and stops, so you have a starting point to edit. After that the daemon
keeps it up to date on its own.

## File format

```yaml
services:
  api:
    command: bun run api.ts
    working_dir: ~/code/api # optional
    autostart: true # optional, default false
    restart: on_failure # optional: no | on_failure | always
    tags: [web, edge] # optional
    route: api # optional — see portless routing
    alias_port: 10020 # optional — fixed-port (alias) route
    namespace: backend # optional
    env: # optional
      LOG_LEVEL: debug
```

`command` is the only required field. Renames aren't expressed here: changing a
key deletes the old service and creates a new one (the id is the identity), so
rename by editing in the dashboard instead. Replica counts are runtime scaling,
managed in the dashboard, and are not part of this file.

The daemon needs to be running for `sync` (it applies through the socket API).
