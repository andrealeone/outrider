# Feature analysis: container proxy

**Status:** proposed, not built. Depends on [optional portless](optional-portless.md).

## The request

Let outrider run **containers** the way it runs processes, and — when portless is
present — proxy the container's published ports onto human-readable hostnames. A
container becomes another kind of managed service in the registry, supervised through
the same desired-state model, and routed through the same Router boundary.

## Why it fits

outrider's core is "a persistent daemon that owns desired state and reconciles reality
against it." That model is runtime-agnostic. Today the supervisor drives `Bun.spawn`
process groups; a container is just a different backend for the same lifecycle —
start, health, restart, shutdown. And the routing story already separates *the service*
from *the port it answers on*, which is exactly what a container needs: the runtime
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
a small `ContainerRuntime` boundary, the same discipline the Router gets for portless.
This keeps Docker / Podman / nerdctl differences — and their absence — at one seam, and
makes "no runtime installed" a graceful-degradation case rather than a crash.

**Ports → routes through the existing path.** When a container publishes a port and
declares an `x-portless` route, the daemon registers that port with portless exactly as
it does for a process. Because [portless is optional](optional-portless.md), a container
on a machine without portless still runs and still publishes its port; it just answers
on the port, not a hostname — the same *route pending* state defined there.

**Reuse, don't reinvent.** Probes (an `http_get` against the published port or its
route), `depends_on`, restart policy, logs (stream the container's stdout/stderr into
the existing logger and ring buffer), tags, and autostart should all apply to container
services with no new concepts.

## Open questions

1. **Runtime support.** Docker first, or a runtime-agnostic interface from the start
   (Podman, nerdctl, containerd)? Detection and absence handling mirror portless.
2. **Config surface.** How is a container service declared — an outrider-native schema,
   or compatibility with `process-compose`'s own container support if/where it exists?
   And does Compose-file import belong here?
3. **Port discovery.** Explicit published-port mapping in config, or inspect the running
   container to discover ports? Inspection is friendlier but runtime-specific.
4. **Lifecycle ownership.** Does outrider create and remove containers, or only
   start/stop pre-created ones? Image pulls, volumes, and networks widen the scope fast
   and must be bounded.
5. **Health.** Reuse outrider's probes, defer to the runtime's own healthcheck, or
   support both?
6. **Routing a port range.** A container may publish several ports; the `x-portless`
   block currently models one route. Multi-port routing needs a defined shape.

## Risks

- **Scope explosion.** "Run containers" can balloon into reimplementing Compose —
  images, volumes, networks, build. The first cut must be narrow: supervise an
  already-defined container's lifecycle and route one published port.
- **Cross-runtime drift.** Docker and Podman differ in CLI and socket APIs; the
  `ContainerRuntime` boundary is what keeps that from leaking everywhere.
- **Dependency posture.** A container runtime is a heavy external dependency. Like
  portless, it should be *detected and optional*, never bundled or assumed.

## Sequencing

Build after [optional portless](optional-portless.md), because the "runs without
portless, gains hostnames when present" behaviour is shared and should exist once. The
`ContainerRuntime` boundary should be modelled on the already-proven Router pattern.
