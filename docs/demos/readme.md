# Demos

Runnable configs for poking at outrider. Each directory imports directly:
open the dashboard, press `m`, and point it at the directory.

- [`web-stack/`](web-stack/): a four-process stack exercising dependencies
  (all the way to `process_healthy`), an exec readiness probe, a
  `ready_log_line`, replicas, restart policies, and an override file. Every
  process is a plain shell loop, so it runs anywhere bash runs (no real
  HTTP server, so it stays routing-free; for a routed walkthrough see
  [add a routed service](../guides/add-a-routed-service.md)).
- [`http-logger/`](http-logger/): a single-file Bun HTTP server
  (`server.ts`) with no compose file at all — a demo for the
  [standalone-service](../features/standalone-services.md) path instead of
  import. It answers requests and logs a tick line every 15 seconds, so it's
  handy for watching outrider collect and tail real process output. See
  [add a demo process](../guides/add-a-demo-process.md) for the walkthrough.

```bash
outrider on
outrider           # press m, enter docs/demos/web-stack, y to import
```

Then bring the stack up from the dashboard and watch the start order gate:
`db` first, `migrate` once db is healthy, `api` once migrate completes
successfully, `worker` once api logs its ready line.
