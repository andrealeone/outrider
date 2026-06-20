# Glossary

outrider borrows most of its vocabulary from process-compose and adds a few
words of its own. This page collects them in plain language, grouped by the idea
they belong to rather than alphabetically.

## The big idea

The whole tool turns on one distinction.

**Desired state** is what you want to be true: this service should be _up_, that
one should be _down_. You set it (by toggling a row in the dashboard, or with
`outrider start` / `stop`) and it sticks. It outlives the terminal, the
dashboard, and a reboot.

**Observed state** is what is actually happening right now: this process is
running with pid 4123, that one exited with code 1.

The **reconciler** is the quiet engine that compares the two and closes the gap,
starting what should be up, stopping what should be down, in the right order. You
never call it directly; everything you do is really just editing desired state
and letting the reconciler catch reality up to it.

The **daemon** is the long-lived background process that holds all of this. It
owns desired state for every service on your machine (one daemon per user),
supervises the running processes, and answers the dashboard and CLI over a local
socket. Closing the dashboard doesn't touch it; `outrider on` / `off` start and
stop it.

## What you manage

A **service** is a single supervised program: a command, its environment, its
restart policy, its probes. (process-compose calls these _processes_, and outrider
uses that word too when talking about the contents of a compose file.) Every
service has an **id**, which is its permanent identity across logs, journals, and
routes; you rename by deleting and recreating, never in place.

Services come from one of two places:

A **stack** is a set of services imported together from a `process-compose.yaml`
file (plus its auto-discovered override). The file stays the source of truth:
you change a stack member by editing the file and re-importing, not in the
dashboard. Stack-member ids are written `stack/process`.

A **standalone service** has no backing file. You define it directly in the
dashboard (or in `~/.config/outrider.yml`), and the **registry** _is_ its source
of truth. Its id is just a plain name.

The **registry** is the daemon's record of every service it knows about (stacks
and standalone alike), together with each one's desired state. It's persisted to
disk so nothing is forgotten across restarts.

## Organising and grouping

**Namespaces** are an upstream grouping label carried through from
process-compose; outrider keeps them as a filter dimension in the dashboard.

**Tags** are outrider's own free-form labels. They cut across stacks and
namespaces, so you can group whatever belongs together (everything one
repository needs, every database) and act on the whole group at once with
`outrider start <tag>`.

**Autostart** is a per-service flag, separate from desired state. A service comes
back after a reboot only when it is _both_ marked autostart _and_ desired up, so
something you stopped on purpose stays stopped, and a scratch service never
resurrects itself.

**Replicas** run several copies of one service. Instance 0 keeps the plain id and
the rest get `-N` suffixes, so identity stays stable when you scale up and down.

## Routing

A **route** is a hostname your service answers on: give it the label `api` and
it becomes reachable at `api.localhost` through the **portless** proxy, instead
of a port you have to remember. By default the daemon picks a free port, injects
it as `PORT`, and points the route at it (a **managed route**, owned by the
daemon and cleaned up automatically if the daemon dies).

An **alias** (or **alias port**) is for tools that bind their own fixed port and
ignore the injected `PORT`, like `kubectl port-forward` or `tsh proxy`. The
route then points straight at that fixed port as a static portless alias.

## Health and lifecycle

A **probe** is a periodic check on a service. A **readiness probe** answers "is
it ready to be depended on yet?"; a **liveness probe** answers "is it still
healthy?", restarting the service when it isn't. Probes come in two flavours,
`exec` (run a command) and `http_get` (hit a URL, taking the portless route for
routed services so it tests the exact path a user would).

A **ready_log_line** is the lightweight alternative to a readiness probe: a line
of output that, once it appears, flips the service to ready.

**depends_on** wires services into a start order: one service waits on another
reaching a condition (started, completed, healthy, and so on) before it launches.
The whole graph is validated at import time, so cycles fail loudly before
anything runs.

The **signal ladder** is how a service stops: a gentle signal first (SIGTERM by
default), a grace period, then SIGKILL if it hasn't exited. Stops also honour
reverse dependency order, so dependents go down before what they depend on.

## Where things live

The **journal** is the append-only event log on disk; restart counters are
rebuilt from it at boot, which is how the dashboard's restart count survives a
daemon restart.

The **ring buffer** is the daemon's in-memory tail of recent log lines per
service: bounded, fast, and what the dashboard's logs view reads from for live
output.

## How you reach it

The **dashboard** (just `outrider`) is the Ink TUI, a thin client over the
daemon's socket that never supervises anything itself.

**Offline mode** is what the dashboard falls back to when the daemon is off: it
renders the persisted registry read-only, and offers to switch the daemon back
on.

**Import** is loading a compose file into a stack; it always runs a **dry run**
first, showing the merged processes, the resolved start order, and any
compatibility warnings before anything is registered.

---

Still missing a word? The [config schema](config-schema.md) defines every
configuration key precisely, and the [architecture overview](architecture/overview.md)
shows how the pieces named here fit together.
