# Feature analysis: outrider doctor

**Status:** proposed, not built. First concrete consumer of
[optional portless](optional-portless.md).

## The request

Add an `outrider doctor` command: a diagnostics tool that inspects an outrider
installation and its environment, reports what is healthy and what is not, and — for
each problem — tells the user how to fix it. Two halves, deliberately balanced: on one
side a set of useful health checks about outrider and its surroundings; on the other,
actionable remediation the user can follow without leaving the terminal.

## Why it fits

outrider is a long-lived daemon that owns desired state across the whole machine, with
several moving parts that can drift out from under it — the daemon socket, the launchd/
systemd unit, the on-disk registry and journal, the sync file, and the *optional*
portless proxy. When something is off, the symptom is usually indirect ("my service
started but has no hostname", "the dashboard says offline"), and the cause is one layer
down. A single command that walks the layers and names the broken one — with the fix —
turns a support question into a self-service answer.

[Optional portless](optional-portless.md) makes this concrete and urgent: once routing
can be silently absent, *route pending — portless not installed* needs somewhere to send
the user. `doctor` is that somewhere, and the portless check is its archetype: detect a
partial state, explain it plainly, hand over the exact install or repair line.

## Design directions

**Checks as data, output as a render.** Model each check as a small unit — an id, a
human title, a `run()` that returns `ok | warn | fail` with a one-line finding and an
optional remediation string. The command runs them all, collects results, and renders;
checks never print directly. That keeps the list easy to grow, makes `--json` a trivial
second renderer for scripts and the proposed companion API, and lets the TUI surface the
same results later without re-implementing the logic.

**Severity, not just pass/fail.** Three levels carry the nuance the request asks for:
*ok* (green, no action), *warn* (degraded but working — e.g. portless installed but the
proxy is down, or a sync file that has drifted from the registry), and *fail* (broken —
e.g. the daemon unit is installed but the socket is dead). The exit code follows the
worst result (`0` ok/warn, non-zero on any fail) so `doctor` slots into CI and
post-install scripts.

**Every finding earns a fix.** A check that can fail must ship the remediation alongside
it — the install command, the file to delete, the `outrider on` to run. The value is the
pairing; a check with no fix is just a status line. Where a fix is safe and unambiguous,
a future `outrider doctor --fix` could apply it, but the first cut only *prints* the
remedy and never mutates state.

**Read-only and cheap by default.** `doctor` inspects; it does not start the daemon,
register routes, or write files. It must be safe to run at any time, including when the
daemon is down — several checks exist precisely for that case, so they read the on-disk
state (registry, journal, lock, sync file) directly the way the hidden `state` command
already does on a cold machine.

## Candidate checks

A starting set, grouped by layer — the inventory is the point, so it should grow:

- **Runtime.** Bun version against the pinned `engines.bun`; binary on `PATH`.
- **Daemon.** Is it running (socket ping)? Does the protocol version match? Is the
  launchd/systemd unit installed and enabled, and does its state agree with the socket?
- **Filesystem.** Runtime dir present and writable; registry and journal parse; lock
  file consistent with the live pid; sync file in step with the registry (the
  [sync](../features/sync-config.md) drift check, surfaced here too).
- **Portless (optional).** Is the CLI on `PATH` (`hasPortless()`)? If so, is the proxy
  reachable and the local CA trusted? If a service declares a route but portless is
  absent, report *route pending* with the install line. This is the archetypal
  warn-with-remedy and the reason the two analyses are designed together.
- **Services.** Count of errored services and services stuck not-ready past their
  threshold, pointing at `outrider logs <name>` rather than diagnosing each.

## Open questions

1. **Daemon-side or client-side.** Do checks run in the CLI process (read disk, ping the
   socket) or does the daemon expose a `/v1/doctor` the CLI renders? Client-side works
   when the daemon is down — which is when you most need `doctor` — so the cold-path
   checks must live CLI-side regardless; the question is whether the live ones reuse a
   daemon endpoint or re-probe locally.
2. **`--fix` scope.** Which remediations are safe to automate (clear a stale lock,
   rewrite the sync file) versus must stay manual (install portless, elevate for port
   443)? The boundary needs to be explicit before any auto-fix ships.
3. **Overlap with `routes` and `state`.** `doctor` subsumes part of what a `routes`
   listing and the hidden `state` dump show. Is `doctor` the umbrella, with the others as
   focused views, or do they stay independent?
4. **Check extensibility.** Is the check list fixed in-tree, or should a future container
   runtime / companion-API feature register its own checks through a small interface, the
   way the Router and the proposed `ContainerRuntime` are seams?
5. **Output budget.** A green machine should say little; a broken one should be scannable.
   How terse is the all-ok render, and does it stay one-line-per-check or collapse to a
   summary?

## Risks

- **Check rot.** Diagnostics that lie are worse than none. Each check needs a test that
  asserts both the healthy and the broken verdict, or it drifts from reality.
- **Scope creep into a fixer.** The pull toward "and also repair it" is strong; the first
  cut must hold the line at *diagnose and instruct*, with `--fix` as a deliberate,
  bounded follow-up.
- **Duplicated truth.** If `doctor` re-derives state that the daemon already computes,
  the two can disagree. Where a check has a live-daemon answer, prefer reading the
  daemon's own view over re-probing.

## Relationship to other requests

Designed alongside [optional portless](optional-portless.md), which supplies `doctor`'s
first real warn-with-remedy check and depends on it for the *route pending* fix line.
The [container proxy](container-proxy.md) adds a parallel "is the container runtime
present and healthy?" check, reinforcing the case for an extensible check interface
(open question 4). A `/v1/doctor` endpoint, if chosen, would also be a natural surface
for the [companion API server](companion-api-server.md).
