# Prober

`src/daemon/prober.ts` runs readiness and liveness probes per instance. Exec
probes spawn through the shell with their own `working_dir` and a hard
timeout; http probes use `fetch` with `headers`, an expected `status_code`
(default: any 2xx), and a timeout signal. For routed services the http probe
targets the portless route URL (exercising the exact path a user would hit),
falling back to `host:port` otherwise (the injected `PORT` serves as the
default port).

Defaults mirror upstream: `initial_delay_seconds 0`, `period_seconds 10`,
`timeout_seconds 1`, `failure_threshold 3`. Transitions are edge-triggered:
one callback when a probe first succeeds, one when consecutive failures cross
the threshold. Readiness drives the `health` field (and the
`process_healthy` gate); liveness failure tells the supervisor to restart the
instance. `success_threshold` is an upstream placeholder and is not
evaluated, documented rather than invented.
