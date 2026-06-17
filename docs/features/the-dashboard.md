# The dashboard

`outrider` with no arguments opens the dashboard: an Ink TUI that is a thin
client over the daemon socket. It never spawns or supervises processes itself —
closing it leaves every service running.

The main view is a virtualised table of every registered service (name, stack,
status, health, uptime, restart count, autostart, route). Each row has an
on/off toggle that sets _desired state_; the row then animates through its
transition states as the reconciler does the work. Toggles are optimistic and
reconcile against live daemon events.

Navigation and actions are single keys — move with `j`/`k`, toggle with
`space`, restart with `r`, edit with `e`, delete with `x`, logs with `l`,
detail with `i`, add with `a`, import with `m`, search with `/`, filter and
sort with `f`/`s`. The full key map is in [usage](../usage.md).

With the daemon off the dashboard drops into **offline mode**: it renders the
persisted registry read-only and offers the same `D` key to switch the daemon
back on. With no TTY (piped or dumb terminal) it degrades to a plain JSON state
dump instead of rendering.

Architecture notes for the TUI live in [architecture/tui.md](../architecture/tui.md).
