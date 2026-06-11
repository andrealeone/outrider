# Architecture overview

```
CLI (one-shot commands)          TUI (Ink)
        \                          /
         unix socket: JSON commands + event stream
                       |
  +--------------------+--------------------+
  |                 daemon                  |
  |                                         |
  |   registry --- reconciler --- event bus |
  |       |             |                   |
  |   scheduler --- supervisor --- prober   |
  |       |             |            |      |
  |  json store      logger       router ------ portless proxy
  +--------------------+--------------------+
                       |
             Bun.spawn process groups
                       |
               managed services
```

One binary contains everything; the daemon is the same executable invoked
with `daemon run`. One daemon instance per user, guarded by a socket liveness
check. The control plane is a single `Bun.serve` on a unix domain socket
(user-only permissions, so v1 needs no token auth): JSON endpoints under
`/v1`, a WebSocket upgrade for the event stream, one error shape, and a
version handshake so a stale daemon left running across a binary upgrade
produces a clear restart message instead of undefined behaviour.

The layering rule: nothing in `src/cli` or `src/tui` imports daemon
internals. Both sides speak only the shared protocol (`src/shared/types`) and
the socket client (`src/shared/client.ts`). The TUI is a management surface,
not a supervisor — closing it changes nothing about running services.

Component notes: [daemon](daemon.md), [registry](registry.md),
[reconciler](reconciler.md), [supervisor](supervisor.md),
[scheduler](scheduler.md), [prober](prober.md), [logger](logger.md),
[router](router.md), [tui](tui.md).
