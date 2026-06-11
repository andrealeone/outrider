# Daemon

`src/daemon/daemon.ts` is the composition root: it wires the store, bus,
logger, prober, supervisor, registry, router, reconciler, and API together
and owns the process lifecycle.

**Startup.** A liveness ping on the socket guards the one-instance-per-user
rule (a stale socket file is removed; a live daemon aborts the new one). The
registry loads from `registry.json`, restart counters are rebuilt from the
journal, the API binds the socket, the pid lands in the lock file, and the
reconciler resumes every service marked `autostart` with desired state `up`.

**Shutdown.** SIGTERM/SIGINT (and `POST /v1/shutdown`) trigger one path:
announce `shutting-down` on the bus, journal the stop, run the reconciler's
ordered full shutdown (reverse dependency order, signal ladder per service),
close the API, remove socket and lock, exit 0. The launchd/systemd unit uses
`KeepAlive SuccessfulExit=false` / `Restart=on-failure`, so a clean exit stays
down while a crash restarts and re-reconciles.

**Service units.** `outrider on` writes the launchd agent (macOS) or systemd
user unit (Linux) pointing at this binary with `daemon run`, then starts it;
with no service manager available it falls back to a detached spawn.
`outrider off` removes the unit first — so nothing resurrects the daemon —
then lets the unit teardown's SIGTERM run the graceful path.
