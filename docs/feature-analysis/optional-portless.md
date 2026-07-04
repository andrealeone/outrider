# Feature analysis: optional portless

**Status:** proposed, not built. Design decisions below are settled; the open
questions have been resolved.

## The request

Make vercel-labs' [portless](https://github.com/vercel-labs/portless) an **optional**
integration rather than a hard dependency. The user installs portless separately from
outrider, so they should be free to add it or not: outrider must run fully without it
and light up hostname routing only when the user has chosen to have it.

## Where we are today

[`specifics.md`](../../specifics.md) lists portless among the three permitted runtime
dependencies, alongside ink and react, and the routing design assumes it is present.
But the groundwork for optionality is already laid:

- **The Router interface.** Every portless call already lives behind a `Router`
  boundary (`src/daemon/router.ts`) — the "isolation rule" exists precisely because
  portless is pre-1.0 and its state format may change. That boundary is the natural
  seam for making the dependency optional. Nothing outside that file imports the
  package, and the reconciler already wraps `register` in a try/catch that degrades to
  *starting without a route* (`reconciler.ts:209`).
- **Routing is already opt-in per process.** A service only touches portless if it
  declares an `x-portless` block. Services without one never need the proxy.
- **`RouterStatus.available` already exists** (`shared/types/router.d.ts`), but
  `DaemonInfo` does not carry it, so the CLI and TUI cannot yet tell which mode they
  are in.

So the request is less "rip out a dependency" and more "make the Router boundary degrade
gracefully when its backend is absent."

## Design directions

**Detect, don't assume.** A single memoized feature-switch, `hasPortless()`
(`src/shared/utils/portless.ts`), is the one place the rest of the codebase asks the
question. It checks for the portless **CLI on `PATH`** — `(OUTRIDER_PORTLESS_BIN ??
Bun.which('portless')) != null` — honouring an `OUTRIDER_NO_PORTLESS=1` opt-out so a
user with portless installed can still force the unrouted path (and tests can pin
either mode). The result is resolved once at daemon start and surfaced through
`/v1/info` (`DaemonInfo.portless`), so the CLI, dashboard, and the proposed companion
API all read the same answer. Whether the *proxy* is actually up is a separate, deeper
runtime concern that stays inside the Router (`ensureProxy`/`status`); the feature-switch
is the cheap boolean everything else branches on.

**A no-op Router.** When portless is absent the Router boundary resolves to a
`NoopRouter` through a `createRouter(log)` factory in `router.ts`
(`hasPortless() ? new PortlessRouter(log) : new NoopRouter(log)`). The no-op records
each registration as recorded-but-inactive desired state rather than an error, reports
`available: false` from `status()`, and — importantly — still computes the *would-be*
hostname from `urlFor()`, because the portless library helpers stay bundled (see the
dependency decision below). Services still run; they simply answer on their port, not a
hostname.

**Graceful degradation, named clearly.** A service that declares a route on a machine
without portless should:

- start normally on its allocated port, with **`PORT` injected but
  `PORTLESS_URL`/`OUTRIDER_URL` omitted** — a published URL that does not resolve is
  worse than no URL, so the unrouted path injects only what is true,
- be marked in the dashboard and `routes` output as *route pending — portless not
  installed*, with the hostname it *would* have (`ServiceState.routePending`),
- never fail the import or the start over a missing optional integration.

This mirrors the existing "every cut feature must still parse — a recognised but
unsupported key warns precisely, never crashes" rule, applied to a runtime dependency
instead of a config key. Route config keeps validating (uniqueness, reserved names, DNS
labels) whether or not portless is present; validation is independent of the backend.

**Hide what cannot work; surface what is merely pending.** In the TUI the *input*
surfaces for routing — the route and alias-port fields in the add/edit form — are
hidden entirely when portless is absent, because offering a field that produces a
pending route is a worse experience than not offering it. But the *output* surfaces —
the dashboard `ROUTE` column and the detail view — still render already-declared routes
as *pending*, so an imported stack's routes never silently vanish. The asymmetry is
deliberate: don't invite new routes you can't honour, but don't hide ones that already
exist.

**Installation guidance, not bundling.** outrider detects portless's absence and points
the user at how to add it, but never installs it silently. That guidance is the natural
first health check of the proposed [`outrider doctor`](doctor.md) command, which owns
the "portless not installed → here's how" remediation line.

## Decisions

The open questions from the first draft are now settled:

1. **Probe semantics → CLI on `PATH`.** `hasPortless()` means the binary is resolvable
   (`Bun.which`, or the `OUTRIDER_PORTLESS_BIN` override), nothing more. Proxy-up, CA
   trust, and port 443 are runtime states the Router already probes via `ensureProxy`
   and reports through `status()`; folding them into the feature-switch would make a
   cheap, cacheable boolean expensive and racy. Partial states ("installed but proxy
   down") are precisely what [`doctor`](doctor.md) is for.

2. **Re-evaluation → on daemon restart.** Detection is resolved at daemon boot and the
   Router is chosen then. Installing portless while the daemon is up activates pending
   routes on the next restart. Live re-probing on reconcile or a signal is a documented
   follow-up, not part of the first cut — restart is predictable and keeps the seam
   single.

3. **Config posture → detection alone.** Routing is off-until-detected with no extra
   config opt-in. Detection is the lower-friction path, and `OUTRIDER_NO_PORTLESS`
   covers the rare "installed but don't use it" case without a config field.

4. **Env when pending → `PORT` only.** The unrouted path injects `PORT` so the service
   binds and answers, but omits `PORTLESS_URL`/`OUTRIDER_URL`. A service that reads those
   to print "listening at …" should print nothing rather than a hostname that 404s — the
   absence is the honest signal, and it pairs with the *route pending* label.

5. **Docs split → reframe as optional.** Routing is rewritten across the docs as an
   optional capability: what works without portless, what it adds, and how to tell which
   mode you are in (`info.portless`). `specifics.md` moves portless from "core routing"
   to "optional integration" and softens the permitted-dependency line accordingly.

6. **Dependency rule → keep portless as a bundled dependency, for now.** portless stays
   in `package.json` and the permitted-dependency list. Two reasons: the library helpers
   (`formatUrl`, `parseHostname`) are what let the no-op path show the *would-be*
   hostname for a pending route, and keeping the dep avoids a dynamic-import refactor of
   the one file that already isolates it. Only the **CLI and proxy** are the optional,
   user-installed external piece; the bundled lib is an implementation detail of the
   Router. Whether portless should eventually leave the bundle entirely and become a
   purely detected external tool (the way a container runtime is in
   [container proxy](container-proxy.md)) is deferred — revisit if the lib ever pulls
   weight we don't use, or if the pre-1.0 state-format churn makes bundling a liability.

## Implementation seam

The change is small because the boundary already exists. The touch points:

- **New** `src/shared/utils/portless.ts` — `hasPortless()` plus a `resetPortlessCache()`
  for tests.
- **`src/daemon/router.ts`** — add `NoopRouter` and the `createRouter` factory; refactor
  the existing inline `Bun.which('portless')` checks to call `hasPortless()`.
- **`src/daemon/daemon.ts`** — instantiate via the factory; set `info.portless`.
- **`src/shared/types/protocol.d.ts`** — `DaemonInfo.portless: boolean` and
  `ServiceState.routePending?: boolean`; bump `PROTOCOL_VERSION` (the client enforces an
  exact match).
- **`src/daemon/reconciler.ts`** — flag `routePending` and gate the `PORTLESS_URL`/
  `OUTRIDER_URL` injection.
- **TUI** — `add-service.tsx` hides the route/alias fields when absent; `service-table.tsx`
  and `detail-view.tsx` render the pending state.
- **Tests** — unit coverage for `hasPortless()` and `NoopRouter`; an absent-portless
  scenario in the integration test; a check that route config still validates without
  portless.

## Risks

- **Two code paths.** Routed and unrouted modes must both be first-class and tested, or
  one quietly rots. The no-op Router keeps the branching at a single seam, and the
  integration test exercises both.
- **Confusing middle states.** "My service started but has no hostname" is a support
  question waiting to happen; the *route pending* labelling and the
  [`doctor`](doctor.md) line are the mitigation.

## Relationship to other requests

This is the **prerequisite** for the [container proxy](container-proxy.md): containers
should run whether or not portless is present, and gain hostnames only when it is. Land
optional portless first. It also gives [`outrider doctor`](doctor.md) its first concrete
check — *is portless installed, and is its proxy healthy?* — so the two are best designed
together.
