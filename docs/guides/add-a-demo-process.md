# Guide: add a demo process

Goal: take a plain script (no `process-compose.yaml`, no stack) and get it
supervised, logged, and (optionally) routed by outrider as a
[standalone service](../features/standalone-services.md).

The [`http-logger` demo](../demos/http-logger/): a single-file Bun HTTP server
(`server.ts`) that answers requests and, every 15 seconds, logs a tick line,
a minimal stand-in for any long-running dev server whose log output you want
outrider to collect.

## In the dashboard

1. `outrider on` if the daemon isn't already running.
2. `outrider` to open the dashboard, then `a` to add a service.
3. Fill in:
   - **name**: `http-logger`
   - **command**: `bun server.ts`
   - **working directory**: the path to `docs/demos/http-logger/`
   - **route**: `logger` (optional, gives it `http://logger.localhost`
     instead of a memorised port, see
     [add a routed service](add-a-routed-service.md))
   - **autostart**: on, if you want it to survive reboots
4. Save. The service starts, and its ticks show up in the log pane every 15s.

## From a script

The same registration is one call to the socket API:

```bash
curl -s --unix-socket "$XDG_RUNTIME_DIR/outrider.sock" \
  http://outrider/v1/services -X POST -d '{
    "name": "http-logger",
    "command": "bun server.ts",
    "workingDir": "'"$PWD"'/docs/demos/http-logger",
    "route": "logger",
    "autostart": true
  }'
```

`route` is optional, drop it to run the server unrouted, reachable only
through whatever port you set in its own `PORT` env var. Standalone services
have no backing file: the registry is their source of truth, so `PUT
/v1/services/:id` edits them in place and `DELETE /v1/services/:id` removes
them cleanly (see [standalone services](../features/standalone-services.md)).

Tail its logs the same way as any other service:

```bash
curl -s --unix-socket "$XDG_RUNTIME_DIR/outrider.sock" \
  "http://outrider/v1/services/http-logger/logs?tail=20"
```
