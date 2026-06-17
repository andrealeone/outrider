# Container processes

Run a Docker or Podman container as a service, with full outrider integration:
logging, autostart, probes, and [portless routing](portless-routing.md) work
exactly the same as for command-based processes.

## Quick start: redis

```bash
# In the dashboard, press 'a' to add a service.
# Select "container" as the kind.
# Image: redis:latest
# Container port: 6379
# Route: redis  (optional)
```

The daemon synthesises `docker run --rm --name outrider-redis -p $PORT:6379
redis:latest` and injects the allocated port into `$PORT`. The service answers
at `redis.localhost` (if Docker/Podman and portless are installed). Logs,
restart policy, probes, dependencies—all work unchanged.

## How containers work

When you add a container, outrider:

1. **Detects the runtime** — looks for `docker`, then `podman` on `PATH`
2. **Synthesises the command** — builds `<runtime> run --rm --name
   outrider-<id> -p <port>:<containerPort> <image>` with any env vars and
   arguments you've set
3. **Allocates a port** — if you didn't set a `hostPort`, the daemon picks a
   free one and injects it as `$PORT`
4. **Routes it** — if you gave it a route name (e.g. `redis`), portless maps
   that hostname to the port
5. **Sets a shutdown command** — `docker stop outrider-<id>` so the daemon can
   gracefully stop the container

## Managed vs. fixed port

**Managed (default).** Leave `hostPort` blank. The daemon picks a free port,
injects it as `$PORT`, and registers a portless route if you gave the service a
name. Useful for dev environments where ports change.

```yaml
container:
  image: redis:latest
  containerPort: 6379
  route: redis  # optional; redis.localhost will point at $PORT:6379
```

**Fixed port (alias).** Set a `hostPort` — say `6380`. The container binds
that fixed port; portless treats it as a static alias (pid 0) so it survives
daemon restarts. Useful when an external tool manages that port and you want a
stable route pointing at it.

```yaml
container:
  image: redis:latest
  containerPort: 6379
  hostPort: 6380  # container binds 6380 directly
  route: redis    # redis.localhost → 6380 (alias)
```

## In the dashboard

Press `a` to add: select **container** as the kind, then fill in:

- **image** — required, e.g. `postgres:15`, `ghcr.io/user/tool:v1`
- **container port** — required, the port the container listens on (e.g. `5432`
  for Postgres, `6379` for Redis)
- **host port** — optional, a fixed port; if blank, the daemon picks one
- **route** — optional, a hostname alias for portless routing (e.g. `db`)
- **tags** — optional, for `outrider start/stop <tag>`
- **autostart** — start at daemon boot

The form validates live; if the image is malformed or the runtime is missing,
you'll see an error before save.

## Requirements

- **Docker** or **Podman** must be on `$PATH`
- **portless** is optional (containers work without it; they just won't answer
  on hostnames, only ports)

The daemon stops gracefully via the shutdown command: it sends `SIGTERM` to the
container, waits 10 seconds (configurable), then `SIGKILL` if it's still alive.
For services that need a custom shutdown (e.g. a database), add a shutdown
command in the config schema instead.

## In the config file

When using `outrider sync` to edit at scale, containers appear with a `kind:
container` marker:

```yaml
services:
  redis:
    kind: container
    image: redis:7-alpine
    containerPort: 6379
    hostPort: 6380
    route: redis
    autostart: true
```

Syncing validates the image and runtime availability, same as the form.
