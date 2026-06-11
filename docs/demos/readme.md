# Demos

Runnable configs for poking at outrider. Each directory imports directly:
open the dashboard, press `m`, and point it at the directory.

- [`web-stack/`](web-stack/) — a four-process stack exercising dependencies
  (all the way to `process_healthy`), an exec readiness probe, a
  `ready_log_line`, replicas, restart policies, an override file, and an
  `x-portless` route. Every process is a plain shell loop, so it runs
  anywhere bash runs.

```bash
outrider on
outrider           # press m, enter docs/demos/web-stack, y to import
```

Then bring the stack up from the dashboard and watch the start order gate:
`db` first, `migrate` once db is healthy, `api` once migrate completes
successfully, `worker` once api logs its ready line.
