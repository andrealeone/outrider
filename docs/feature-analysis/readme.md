# Feature analysis

Working notes for requested features, written *before* implementation. Each note
captures the request, the motivation, the design choices it forces, and the open
questions that must be answered before any code is written. A note is not a
commitment to build; it is the analysis that decides whether and how to build.

These documents are deliberately exploratory. Where they touch a decision already
settled in [`specifics.md`](../../specifics.md) — the no-TCP-listener stance, the
user-only socket trust model, the Router isolation rule — they say so explicitly,
because reopening such a decision is the expensive part, not the code.

- [Companion API server](companion-api-server.md) — a standalone Next.js app under
  `/api`, toggled by `outrider api on` / `off`, exposing the daemon over HTTP.
- [Optional portless](optional-portless.md) — make portless a chosen integration
  rather than a hard runtime dependency.
- [Container proxy](container-proxy.md) — supervise containers and, when portless is
  present, route their published ports onto hostnames.
- [outrider doctor](doctor.md) — a diagnostics command that health-checks the install
  and its environment, pairing each finding with a fix.

The list under [feature requests](../../specifics.md) in `specifics.md` is the
authoritative roadmap; this folder holds the reasoning behind each entry.
