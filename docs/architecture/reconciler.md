# Reconciler

`src/daemon/reconciler.ts` is the control loop: it compares the registry's
desired state against observed supervisor state and issues actions. A CLI
command, a TUI toggle, and a cold daemon boot all flow through the same path.

It keeps a `pendingUp` set of services that should come up once their gates
open. A tick (debounced on state/probe events, plus a 1s heartbeat) asks
the scheduler to evaluate each pending service's `depends_on` gates against
live state: `go` starts it (allocating the route first for routed services),
`wait` keeps it pending, `never` (a dependency failed or was skipped) marks
it skipped, cascading.

Bringing a service up brings its transitive dependencies up: the API sets
desired state on the whole closure, so the gates can actually open. Stops
honour reverse dependency order when any participant opted into
`ordered_shutdown`, and always for full daemon shutdown. Routes die with
their service: terminal states trigger route unregistration.

Route allocation happens here: for an `x-route` service the reconciler takes
the fixed port or asks the OS for a free one in the conventional 4000-4999
range, registers the route through the Router with `entry.routeKind` (managed
by default, `static` when the port is pinned via `aliasPort` or the
portless-era `alias: true` flag — see [Router](router.md)), and injects
`PORT`, `HOST=127.0.0.1`, `OUTRIDER_URL`, and `PORTLESS_URL` (plus
`NODE_EXTRA_CA_CERTS` when TLS is on) into the spawn environment. Registration
failure degrades to starting without a route, logged to the service's system
stream.
