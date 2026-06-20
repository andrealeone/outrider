# Supervisor

`src/daemon/supervisor.ts` is a thin layer over `Bun.spawn` owning process
groups, replica fan-out, restart backoff, exit-code capture, and the
SIGTERM-wait-SIGKILL ladder. It owns the canonical state machine: `pending`,
`launching`, `running`, `completed`, `skipped`, `error`, `terminating`,
`restarting`, mirroring upstream, so dependency conditions, the TUI, and the
API all read one enum.

**Spawning.** Commands run through the configured shell (default `bash -c`);
an `entrypoint` array execs directly. `detached: true` makes each child a
process-group leader, so the ladder signals the whole group (`kill(-pid)`)
unless `parent_only`. Stdout/stderr stream line-by-line into the logger.
The environment layers daemon env, `.env`, `env_file`s, the merged
`environment` list, route bindings, and the `PC_*`/`OUTRIDER_*` injections.
Routed commands pass through the framework quirk table, which appends
`--port` for tools that ignore `PORT`.

**Exits and restarts.** On exit the instance journals its code, then the
restart policy decides: `always` and `on_failure` (nonzero) restart after
`backoff_seconds` up to `max_restarts` (0 = unlimited); otherwise the
instance lands in `completed` or `error`. Counters are seeded from the
journal at boot, so they survive daemon restarts. A liveness-probe failure
stops the group and restarts through the same path.

**Stopping.** `shutdown.command` runs if configured (with the service's
environment); otherwise `shutdown.signal` (default SIGTERM) goes to the
group, and after `timeout_seconds` (default 10) SIGKILL follows. `is_daemon`
processes whose parent exited 0 within `launch_timeout_seconds` are tracked
as running with no pid; their `shutdown.command` is the only stop handle.

**Replicas.** `replicas: N` fans out instances 0…N-1. Instance 0 keeps the
plain service id and the rest get `-N` suffixes, so identity (and counters,
probes, log watchers) stays stable across rescaling. Scaling down stops the
excess instances and forgets them.
