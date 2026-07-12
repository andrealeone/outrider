# Prober

`src/daemon/prober.ts` runs readiness and liveness probes per instance. Exec
probes spawn through the shell with their own `working_dir` and a hard
timeout; http probes use `fetch` with `headers`, an expected `status_code`
(default: any 2xx), and a timeout signal, targeting `host:port` directly
(the injected `PORT` serves as the default port). Probes never go through the
routing proxy, even for routed services: Bun's `fetch` cannot self-connect to
the daemon's own `node:http2` TLS listener from within the same process (a
confirmed runtime limitation, see [Router](router.md)), and a health check
shouldn't depend on the proxy being up anyway.

Defaults mirror upstream: `initial_delay_seconds 0`, `period_seconds 10`,
`timeout_seconds 1`, `failure_threshold 3`. Transitions are edge-triggered:
one callback when a probe first succeeds, one when consecutive failures cross
the threshold. Readiness drives the `health` field (and the
`process_healthy` gate); liveness failure tells the supervisor to restart the
instance. `success_threshold` is an upstream placeholder and is not
evaluated, documented rather than invented.
