# Feature analysis: container proxy

**Status:** proposed, not built.

## The request

Let outrider run **containers** the way it runs processes, and proxy the container's
published ports onto human-readable hostnames through the native router. A
container becomes another kind of managed service in the registry, supervised through
the same desired-state model, and routed through the same Router boundary.

## Why it fits

outrider's core is "a persistent daemon that owns desired state and reconciles reality
against it." That model is runtime-agnostic. Today the supervisor drives `Bun.spawn`
process groups; a container is just a different backend for the same lifecycle:
start, health, restart, shutdown. And the routing story already separates _the service_
from _the port it answers on_, which is exactly what a container needs: the runtime
publishes a port, outrider maps a hostname onto it.

This turns outrider into one control surface for both local processes and containers,
with the same dashboard, the same tags, the same autostart, the same hostnames.

## Design directions

**A container service kind.** Extend the registry's service model with a container
backend rather than bolting on a parallel system. The supervisor gains a strategy: for
a process service it spawns a process group; for a container service it drives the
container runtime. The state machine (pending → launching → running → … → terminating)
maps cleanly onto container lifecycle, so the reconciler, scheduler, and dashboard need
no new vocabulary.

**Runtime behind an interface, like the Router.** Talk to the container runtime through
a small `ContainerRuntime` boundary, the same discipline the Router already models for
routing. This keeps Docker / Podman / nerdctl differences, and their absence, at one
seam, and makes "no runtime installed" a graceful-degradation case rather than a crash.

**Ports → routes through the existing path.** When a container publishes a port and
declares an `x-route` route, the daemon registers that port with the native router
exactly as it does for a process — `kind: static`, since the daemon doesn't own the
container's port allocation the way it does for a spawned process (see
[Router](../architecture/router.md)).

**Reuse, don't reinvent.** Probes (an `http_get` against the published port or its
route), `depends_on`, restart policy, logs (stream the container's stdout/stderr into
the existing logger and ring buffer), tags, and autostart should all apply to container
services with no new concepts.

## Open questions

1. **Runtime support.** Docker first, or a runtime-agnostic interface from the start
   (Podman, nerdctl, containerd)? Detection and absence handling should follow the same
   detect-and-degrade discipline as any other optional external tool.
2. **Config surface.** How is a container service declared? An outrider-native schema,
   or compatibility with `process-compose`'s own container support if/where it exists?
   And does Compose-file import belong here?
3. **Port discovery.** Explicit published-port mapping in config, or inspect the running
   container to discover ports? Inspection is friendlier but runtime-specific.
4. **Lifecycle ownership.** Does outrider create and remove containers, or only
   start/stop pre-created ones? Image pulls, volumes, and networks widen the scope fast
   and must be bounded.
5. **Health.** Reuse outrider's probes, defer to the runtime's own healthcheck, or
   support both?
6. **Routing a port range.** A container may publish several ports; the `x-route`
   block currently models one route. Multi-port routing needs a defined shape.

## Risks

- **Scope explosion.** "Run containers" can balloon into reimplementing Compose:
  images, volumes, networks, build. The first cut must be narrow: supervise an
  already-defined container's lifecycle and route one published port.
- **Cross-runtime drift.** Docker and Podman differ in CLI and socket APIs; the
  `ContainerRuntime` boundary is what keeps that from leaking everywhere.
- **Dependency posture.** A container runtime is a heavy external dependency; it
  should be _detected and optional_, never bundled or assumed.

## Sequencing

The `ContainerRuntime` boundary should be modelled on the already-proven Router
pattern: one seam, graceful degradation when the runtime is absent, native routing
for whatever it supervises.
