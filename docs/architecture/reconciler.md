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

Route allocation happens here: for an `x-portless` service the reconciler
takes the fixed port or asks the OS for an ephemeral one, registers the route
through the Router, and injects `PORT`, `PORTLESS_URL`, and `OUTRIDER_URL`
into the spawn environment. Registration failure degrades to starting without
a route, logged to the service's system stream. A route marked `alias`
registers as a static pid-0 alias on its fixed port instead of a
daemon-owned one (see [Router](router.md)); because portless never prunes
those, the reconciler clears every known alias on boot before the resume
pass, so a prior crash can't leave one dangling.
