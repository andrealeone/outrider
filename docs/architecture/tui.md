# TUI

`src/tui` is an Ink (React) application and a strict thin client: it speaks
only the shared protocol over the socket and never spawns or supervises
processes itself, with one exception — the daemon switch may spawn the daemon
binary to turn it on.

**Data flow.** `use-daemon.ts` owns the single connection: snapshot plus
incremental state events maintain a service map; updates batch on an 80 ms
flush so event bursts cost one render; log lines bypass React state entirely
and fan out to subscriber callbacks (the logs view batches them to frame
boundaries and never rerenders the table). Toggles update optimistically and
reconcile against daemon events, so every keypress paints feedback in the
next frame instead of waiting on a socket round trip. A socket that drops or
never opens (the client never throws synchronously from `events()`) flips to
offline mode — rows rendered read-only from the persisted `registry.json` —
with a reconnect loop behind it.

**Rendering discipline.** One shared frame clock (`frame-clock.ts`) drives
spinners, transition animations, and uptime counters, so a busy dashboard
renders once per beat instead of once per widget. The service table is
virtualised: only the viewport's rows produce JSX. Ink's reconciler handles
diff-only writes. On a non-TTY stdout the TUI degrades to a plain JSON state
dump.

**Views.** Dashboard (default), logs (follow, regex search, wrap,
scrollback, hide-past, per-service log deletion), detail (config snapshot, instances, masked environment), add
service (live-validated form), import stack (dry-run report before anything
registers). A fixed vim-style keymap in v1; the config file reserves a keymap
key for later. Keyboard-first throughout — no mouse, per the cuts discussion.
Theme tokens ship one dark and one light pair (`OUTRIDER_THEME=light`).
