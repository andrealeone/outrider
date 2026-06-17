# Day-to-day usage

The whole public surface is three commands: `outrider`, `outrider on`,
`outrider off`. Everything else happens inside the dashboard.

## The dashboard

`outrider` opens a table of every registered service: name, stack, status,
health, uptime, restart count, autostart flag (AUTO), and route. Each row
carries an on/off toggle (`◉`/`○`). Flipping it sets _desired state_ through
the daemon; the row then animates through its transition states (pending →
launching → running) as the reconciler does the work. Toggles update
optimistically and reconcile against daemon events. The status cell keeps its
semantic colour (green running, red error); every other cell follows the
terminal's own colours, so the dashboard adapts to any theme.

| Key               | Action                                   |
| ----------------- | ---------------------------------------- |
| `j` / `k`, arrows | move selection                           |
| `g` / `G`         | jump to top / bottom                     |
| `space` / `enter` | toggle the service up/down               |
| `r`               | restart                                  |
| `e`               | edit the selected service                |
| `x`               | delete the selected service (confirmed)  |
| `A`               | toggle autostart (start at daemon boot)  |
| `l`               | logs view                                |
| `i`               | detail view                              |
| `a`               | add a standalone service                 |
| `m`               | import a stack                           |
| `/`               | fuzzy search                             |
| `f`               | cycle stack filter                       |
| `s`               | cycle sort (name, status, stack, uptime) |
| `D`               | daemon master switch                     |
| `q`               | quit (services keep running)             |

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
<tag>` and `outrider stop <tag>` act on every service carrying the tag — see
[service tags](features/service-tags.md). Dashboard search (`/`) matches tags
as well as ids.

Leave **alias port** blank for a normal daemon-managed route, where the daemon
picks the port and injects `PORT`. Set it to a fixed port (e.g. `10020`) when
the command owns that port itself and ignores the injected one — `kubectl
port-forward`, `tsh proxy`, and the like. The route then becomes a static
portless alias pointing at that port; it requires a route to be set. (See the
[config schema](config-schema.md) for the `x-portless.alias` equivalent.)

## Editing and deleting

`e` reopens the same form prefilled for the selected service. The name is
fixed (delete and recreate to rename); saving persists the new definition and
restarts the service if it is running, so the change takes effect
immediately. Stack members cannot be edited in place — their compose file is
the source of truth, so edit the file and re-import.

`x` deletes the selected service after one confirmation: it is stopped,
unrouted, and removed from the registry. For a stack member the confirmation
offers to remove the whole stack instead, since partial stacks would drift
from their source file.

## Importing a stack

`m` asks for a path to a `process-compose.yaml` (or a directory containing
one), runs a dry-run validation first, and shows the merged result: processes,
resolved start order, and any compatibility warnings. Nothing registers until
you confirm. Re-importing the same stack refreshes it: new processes appear,
removed ones are stopped and dropped, desired states are preserved.

## Desired state, autostart, and reboots

Every service carries a desired state (up or down) and an autostart flag.
`outrider off` stops processes but leaves desired state untouched; at the next
`on` (or reboot), services with `autostart` _and_ desired `up` come back.
Restart counters persist across daemon restarts.

## Scripting against the daemon

The socket speaks plain JSON; until the scripting commands land you can drive
it directly (see the [CLI reference](cli-reference.md) for the endpoint list):

```bash
curl -s --unix-socket "$XDG_RUNTIME_DIR/outrider.sock" \
  http://outrider/v1/up -X POST -d '{"names":["mystack"]}'
```

A hidden `outrider state` prints the full state snapshot as JSON.
