# Contributing to outrider

outrider wants to be the tool you reach for without thinking about it: a
portable, user-level systemd with compose ergonomics and human-readable URLs,
running quietly under every project you touch. The premise is simple and a
little ambitious: one daemon owns the desired state of everything you run, a
clean dashboard manages it, and your services answer on names like
`api.myapp.localhost` instead of ports you have to memorise. Existing
`process-compose.yaml` files just work, unedited, so nobody has to throw away
what they already have to try it.

That ambition only holds if the tool stays small and sharp: a tiny runtime
dependency surface, less code over more, and every cut feature documented as a
roadmap entry rather than a silent gap. If that resonates, we'd welcome your
help, and just as much your opinion on where it gets in your way.

## First time here?

Start by running it, then read just enough to find your footing.

1. **[Setup and installation](setup.md)**: clone, `bun install`, run straight
   from source (`bun src/main.ts`), no compile step needed for the inner loop.
2. **[Day-to-day usage](usage.md)**: drive the dashboard for ten minutes so the
   model (desired state, the daemon, routing) clicks before you read about it.
3. **[Architecture overview](architecture/overview.md)**: the one-screen system
   diagram and the layering rule that explains where any given change belongs.
4. **[Glossary](glossary.md)**: the handful of terms outrider leans on
   (reconciler, desired state, stack vs. standalone, route alias), in plain
   language.
5. **[Guides](guides/)**: end-to-end walkthroughs ([import a stack](guides/import-a-stack.md),
   [add a routed service](guides/add-a-routed-service.md),
   [sync at scale](guides/sync-services-at-scale.md)) that double as a map of the
   real workflows.

A good first contribution is small and concrete: tighten a doc that tripped you
up, cover one of the gaps called out in [test coverage](test-coverage.md), or
fix a rough edge you hit while exploring. Open an issue first if you're unsure
whether something is a bug or intended; see below.

## Coming back to build something bigger?

For real features, these are the references the work runs on:

- **[Developing outrider](develop.md)**: the dev guide, covering environment
  setup, running from source, the `package.json` scripts, codebase layout, and
  recipes for adding a CLI command, daemon component, or TUI feature. Start here.
- **[Architecture notes, per component](architecture/overview.md)**: daemon,
  registry, reconciler, supervisor, scheduler, prober, logger, router, and TUI
  each have their own page; read the one you're about to touch.
- **[Config schema](config-schema.md)**: the per-key support status and the
  `x-portless` / `x-tags` extensions, the contract every parser change answers to.
- **[Compatibility report](compatibility-report.md)**: the deliberate
  divergences from process-compose and *why*; check it before changing
  upstream-facing behaviour.
- **[Test coverage](test-coverage.md)**: what's exercised, what isn't, and a
  ranked list of the most valuable gaps to close.
- **[The implementation brief](../specifics.md)**: the master design document,
  covering scope, the code constraints (less code over more, kebab-case files,
  types in `.d.ts`, file-routed CLI commands, the dependency policy), and the
  [cuts discussion](../specifics.md) explaining what we deliberately don't build.
  Read this before proposing anything large; a feature already cut or deferred
  there needs that conversation reopened first.

## Sending a change

```bash
bun test          # unit + integration suites
bun run check     # typecheck, lint, format gate
```

Both must pass. A couple of house rules worth knowing up front:

- **Docs ship with the code.** A feature without docs is an unfinished feature;
  update the relevant `/docs` page in the same change.
- **Dependencies are precious.** Anything beyond the pinned runtime set (ink,
  react, portless) needs a written justification in the change that adds it.
- **Added a CLI command?** It's a file route under `src/cli/commands/`; run
  `bun scripts/generate-manifest.ts` so the compiled binary can find it.

Then open a pull request describing the change and how you verified it.

## Bugs and feature requests

Found a bug, or have an idea? **Open an issue.** For bugs, include what you ran,
what you expected, and what happened (and the daemon log if it's relevant,
`~/.local/share/outrider/daemon.log`). For features, a short description of the
problem you're trying to solve is more useful than a proposed implementation;
it lets us weigh it against the [cuts discussion](../specifics.md) and find the
smallest thing that helps. Either way, open an issue before a large pull request.
