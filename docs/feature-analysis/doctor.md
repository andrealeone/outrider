# Feature analysis: outrider doctor

**Status:** proposed, not built.

## The request

A diagnostics command, `outrider doctor`, that health-checks the install and its
environment in one pass and pairs every finding with a fix, rather than leaving a user
to piece together "why didn't my route come up" from the dashboard, the daemon log, and
`ps`.

## Why it fits

Most of what `doctor` needs to check already exists as scattered, ad-hoc signals: the
Router's `inspect()`, the socket liveness check the daemon itself uses on startup, and
the `GET /v1/proxy` status endpoint `outrider on` already reads to run its foreground
repair. `doctor` does not add new detection logic; it is a single command that walks the
checks that already exist and prints them as a checklist instead of requiring the user
to know where each one lives.

It is also the natural home for the guidance outrider already owes the user in a few
places without a clean way to surface it: "TLS on but the CA isn't trusted yet, here's
how", "socket stale, here's the fix", "route claimed by a dead process, here's how it
got orphaned".

## Design directions

**One command, one pass, no side effects.** `outrider doctor` runs every check and
prints a report; it never repairs anything itself in the first cut (unlike the daemon's
own `ensureProxy`, which _does_ self-heal the proxy as part of normal operation). Keeping
it read-only makes the command safe to run any time, including when something is already
broken, and keeps the first version small.

**Checks, roughly in dependency order:**

1. **Binary and version.** Confirms the running binary matches the expected version
   (catches a stale binary left over from a partial upgrade).
2. **Daemon reachability.** Socket exists, is connectable, and the version handshake
   succeeds; names the fix (`outrider on`, or `outrider off && outrider on` for a
   version mismatch) rather than just reporting failure.
3. **Service-unit installation.** The launchd agent / systemd user unit is installed and
   enabled, matching what `outrider on` should have set up.
4. **Routing proxy health.** Reuses the Router's `inspect()` (the same call
   `GET /v1/proxy` and `outrider on` already make): proxy not listening → the bind
   failure and its cause; TLS on but CA not trusted, or hosts block stale → the exact
   repair `outrider on` already knows how to run in the foreground.
5. **Hosts file / DNS.** For `.localhost`, nothing to check (browsers resolve it
   natively); for `.test` or any hostname requiring an `/etc/hosts` entry, confirms the
   entry is actually present and current.
6. **Registered routes vs. live processes.** Cross-checks the registry's route table
   against the Router's live registrations (`list()`'s per-route liveness dial),
   surfacing orphaned entries by name so "why does this service have no hostname" has a
   one-command answer.
7. **Filesystem layout.** `~/.local/share/outrider` and `~/.config` paths exist, are
   writable, and hold what the daemon expects (registry, journal present and parseable).

**Output.** A short pass/fail list, ordered by dependency (no point reporting route
health if the daemon itself is unreachable), with one line of fix guidance per failure.
A `--json` flag mirrors the other scripting-friendly commands for automation and bug
reports.

## Open questions

1. **Standalone vs. daemon-mediated.** Some checks (binary version, service-unit
   presence) work with the daemon off; others (route health) need it running. Does
   `doctor` run standalone and read what it can, falling back to "daemon not running,
   skipping N checks", or does it always go through the daemon's own view of the world?
   Standalone is more resilient (it works precisely when things are broken enough that
   the daemon won't start) and is the working assumption.
2. **Where the check list lives.** A flat list of checks in one file is fine at 7 items;
   if `doctor` grows (container-runtime checks once [container proxy](container-proxy.md)
   lands, for instance), it may want the same kind of small-registry pattern the CLI
   commands already use.
3. **Repair mode.** Read-only is the first cut per the design direction above, but a few
   checks (recreating a missing service unit, re-syncing `/etc/hosts`) are safe,
   idempotent fixes that a later `--fix` flag could apply directly instead of only
   printing guidance.

## Risks

- **Becomes a second source of truth.** Every check `doctor` runs must call the same
  code path the daemon itself uses (`inspect()`, the version handshake), never a
  reimplementation, or the two will drift and `doctor` will report a health outrider
  itself disagrees with.
- **Scope creep.** It is tempting to fold every future integration's health check in
  here immediately; each addition should earn its place the way the checks above do, by
  already existing as daemon-internal state that just needs surfacing.

## Relationship to other requests

It generalises further once [container proxy](container-proxy.md) lands, gaining a
container-runtime presence/health check built the same way.
