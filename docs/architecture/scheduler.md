# Scheduler

`src/daemon/scheduler.ts` is the dependency engine, kept as pure functions:

- `evaluateGate(entry, stateOf)` answers `go` / `wait` / `never` for one
  service's `depends_on` conditions against live state. `process_started`
  needs the dependency running (or already completed); `process_completed`
  any exit; `process_completed_successfully` exit code 0 — a failure makes
  the gate `never`, which cascades a skip; `process_healthy` and
  `process_log_ready` need readiness (probe success or matched
  `ready_log_line`).
- `withDependencies(ids, get)` expands a start set with its transitive
  in-stack dependencies.
- `shutdownLevels(entries)` reverses the DAG for ordered stops: dependents
  stop before the services they depend on, level by level.

Cycle detection lives in `src/daemon/config/dag.ts` and runs at import time —
`startOrder` groups processes into dependency levels and throws with the full
cycle path, so imports fail at validation, never at runtime. The same start
order appears in the import report (which is also the plain-text answer to
upstream's dependency-graph visualisation).
