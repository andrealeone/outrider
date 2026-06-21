# Feature analysis: optional portless

**Status:** proposed, not built.

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
  seam for making the dependency optional.
- **Routing is already opt-in per process.** A service only touches portless if it
  declares an `x-portless` block. Services without one never need the proxy.

So the request is less "rip out a dependency" and more "make the Router boundary degrade
gracefully when its backend is absent."

## Design directions

**Detect, don't assume.** On daemon start (and on first route registration), probe for
portless — on `PATH`, and the proxy reachable. Cache the result and surface it through
`/v1/info` so the CLI, dashboard, and the proposed API all agree on whether routing is
available.

**A no-op Router.** When portless is absent, the Router boundary resolves to a no-op
implementation: route registration becomes a recorded-but-inactive desired state rather
than an error. Services still run; they simply answer on their port, not a hostname.

**Graceful degradation, named clearly.** A service that declares a route on a machine
without portless should:

- start normally on its allocated port,
- be marked in the dashboard and `routes` output as *route pending — portless not
  installed*, with the hostname it *would* have,
- never fail the import or the start over a missing optional integration.

This mirrors the existing "every cut feature must still parse — a recognised but
unsupported key warns precisely, never crashes" rule, applied to a runtime dependency
instead of a config key.

**Installation guidance, not bundling.** outrider should detect portless's absence and
point the user at how to add it (a `doctor`-style line), but never install it silently
or bundle it. The user's choice stays the user's choice.

## Open questions

1. **Probe semantics.** What exactly counts as "portless available" — binary on `PATH`,
   proxy process up, CA trusted, port 443 bound? Partial states (installed but proxy
   down) need defined behaviour, and overlap with a future `doctor` command.
2. **Re-evaluation.** If the user installs portless *after* the daemon is up, when do
   pending routes activate — next reconcile, on a signal, or only on restart?
3. **Config posture.** Is routing off-by-default-until-detected, or does an explicit
   config opt-in gate it? Detection alone is the lower-friction path.
4. **Docs split.** Today routing is described as core. The docs need to reframe it as an
   optional capability — what works without portless, what it adds, and how to tell
   which mode you are in.
5. **Build and the dependency rule.** Should portless leave the "permitted runtime
   dependencies" list entirely and become a detected external tool, the way `git` or a
   container runtime would be?

## Risks

- **Two code paths.** Routed and unrouted modes must both be first-class and tested, or
  one quietly rots. The no-op Router keeps the branching at a single seam.
- **Confusing middle states.** "My service started but has no hostname" is a support
  question waiting to happen; the *route pending* labelling and a `doctor` line are the
  mitigation.

## Relationship to other requests

This is the **prerequisite** for the [container proxy](container-proxy.md): containers
should run whether or not portless is present, and gain hostnames only when it is. Land
optional portless first.
