# Day-to-day usage

The core surface is `outrider`, `outrider on`, and `outrider off`. A few
targeted commands round it out: `outrider start`/`stop` for acting on services
or [tags](features/service-tags.md) from a script, and `outrider sync` for
[bulk edits](features/sync-config.md). But day to day, everything happens
inside the dashboard.

## The dashboard

`outrider` opens a table of every registered service: name, status, health,
uptime, restart count, autostart flag, and route. Each row
carries an on/off toggle (`◉`/`○`). Flipping it sets _desired state_ through
the daemon; the row then animates through its transition states (pending →
launching → running) as the reconciler does the work. Toggles update
optimistically and reconcile against daemon events. The status cell keeps its
semantic colour (green running, red error); every other cell follows the
terminal's own colours, so the dashboard adapts to any theme.

| Key               | Action                                  |
| ----------------- | --------------------------------------- |
| `j` / `k`, arrows | move selection                          |
| `g` / `G`         | jump to top / bottom                    |
| `space` / `enter` | toggle the service up/down              |
| `r`               | restart                                 |
| `e`               | edit the selected service               |
| `x`               | delete the selected service (confirmed) |
| `A`               | toggle autostart (start at daemon boot) |
| `l`               | logs view                               |
| `i`               | detail view                             |
| `a`               | add a standalone service                |
| `m`               | import processes                        |
| `/`               | fuzzy search                            |
| `s`               | cycle sort (name, status, uptime)       |
| `D`               | daemon master switch                    |
| `q`               | quit (services keep running)            |

The header shows aggregate counts and the daemon switch. Switching the daemon
off asks one confirmation, streams the reverse-order shutdown live, then drops
into **offline mode**: the dashboard renders the persisted registry read-only,
and the same `D` key spawns the daemon again.

## Logs

`l` opens the log pane: follow mode (`f`), wrap toggle (`w`), regex search with
highlighting (`/`), scrollback (`j`/`k`, `G` to re-tail). Live lines come from
the daemon's in-memory ring buffer; stderr and supervisor messages are marked.

## Detail

`i` shows the full config snapshot: command, working directory, restart
policy, probes, dependencies, per-instance state with pids and exit codes,
route status, and the environment with values whose keys look secret (TOKEN,
SECRET, PASSWORD, KEY, …) masked. The masking is a documented heuristic, not
a guarantee.

## Adding a service

`a` opens a form: name, command, working directory, optional route, optional
alias port, optional tags, restart policy, autostart. The form validates live
against the daemon before saving. Standalone services live in the registry with
no backing file.

**Tags** are comma-separated grouping labels (e.g. `web, db`). `outrider start
<tag>` and `outrider stop <tag>` act on every service carrying the tag; see
[service tags](features/service-tags.md). Dashboard search (`/`) matches tags
as well as ids.

Leave **alias port** blank for a normal daemon-managed route, where the daemon
picks the port and injects `PORT`. Set it to a fixed port (e.g. `10020`) when
the command owns that port itself and ignores the injected one (`kubectl
port-forward`, `tsh proxy`, and the like). The route then becomes a static
route pinned at that port; it requires a route to be set. See the
[config schema](config-schema.md) for the underlying `x-route` fields.

## Editing and deleting

`e` reopens the same form prefilled for the selected service, including its
name: renaming is supported for any service, imported or standalone. Saving
persists the new definition and restarts the service if it is running, so the
change takes effect immediately. An imported service's other fields are best
edited by changing the compose file and re-importing, since the file stays
the source of truth for its contents; the dashboard editor still works, but a
later re-import can present the same fields again for review.

`x` deletes the selected service after one confirmation: it is stopped,
unrouted, and removed from the registry, imported or standalone alike.

## Importing processes

`m` opens the import wizard: enter a path to a `process-compose.yaml` (or a
directory containing one), and it previews the parsed result first, one
editable page per process (name, command, working directory, route, alias
port, tags, restart policy, autostart), plus the resolved start order and any
compatibility warnings. Approve or reject each process, then confirm on the
summary page with `y`. Nothing registers until then. Re-importing the same
path refreshes it: new or changed processes get their own review pages,
processes that left the file get a removal page requiring approval, and
desired/autostart flags survive on anything you keep. See
[importing processes](features/importing-processes.md) and the
[guide](guides/import-processes.md) for the full walkthrough.

## Desired state, autostart, and reboots

Every service carries a desired state (up or down) and an autostart flag.
`outrider off` stops processes but leaves desired state untouched; at the next
`on` (or reboot), services with `autostart` _and_ desired `up` come back.
Restart counters persist across daemon restarts.

## Editing services at scale

Standalone services are mirrored to `~/.config/outrider.yml`, which the daemon
rewrites whenever you add, edit, or remove one. To change many at once, edit
that file directly and run `outrider sync`: it diffs the file against the
registry and shows the create/update/delete operations as a checklist, applying
only the rows you keep checked (`--yes` applies them all non-interactively). The
registry stays the source of truth; the file is a convenience for bulk edits.
Full details in [config sync](features/sync-config.md).

## Scripting against the daemon

Beyond `start`/`stop`/`sync`, the socket speaks plain JSON, so you can drive the
daemon directly (see the [CLI reference](cli-reference.md) for the endpoint
list):

```bash
curl -s --unix-socket "$XDG_RUNTIME_DIR/outrider.sock" \
  http://outrider/v1/up -X POST -d '{"names":["myservice"]}'
```

A hidden `outrider state` prints the full state snapshot as JSON.
