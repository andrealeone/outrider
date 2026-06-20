# Developing outrider

This is the guide for working *on* outrider rather than *with* it: getting the
codebase running, finding your way around it, and keeping your changes healthy.
It leans on the user-facing docs rather than repeating them — [setup](setup.md)
for installing and building, [contributing](contributing.md) for opening issues
and sending pull requests.

## Getting set up

The prerequisites and the supported Bun version live in [setup](setup.md#requirements);
once you have them, getting a working checkout is three commands:

```bash
git clone <repo> && cd outrider
bun install
bun run check        # verify the toolchain is happy
```

That's it — there's no build step for development. You run outrider straight
from source, so your changes take effect the moment you save them.

### Running from source

All three entry points run from source through the same file:

```bash
bun src/main.ts                    # open the dashboard
bun src/main.ts on                 # start the daemon (installs the service unit)
bun src/main.ts daemon run         # run the daemon entrypoint directly
```

The first `bun src/main.ts on` installs a launchd agent (macOS) or systemd user
unit (Linux) pointing at your source, so the daemon you're iterating on is the
one that's running. Restart it with `outrider off && outrider on` to pick up
daemon-side changes.

## Understanding the codebase

### Philosophy: clarity over cleverness

outrider is deliberately built to be approachable. A few principles run through
every part of it, and they double as the spirit behind the harder rules in the
[implementation brief](../specifics.md):

**Single responsibility.** Each module does one job — the registry holds state,
the reconciler enforces desired state, the supervisor manages processes. When
you go looking for something, there's usually one obvious place it lives.

**Type safety as documentation.** TypeScript is used rigorously, not for
ceremony but because a type signature tells you what a function takes, returns,
and can fail on before you read a line of its body.

**No hidden layers.** Code paths are direct — no magic middleware, no implicit
conventions waiting to trip you. If you want to know how something works, follow
the call stack and it will tell you.

**Naming for humans first.** `reconcileDesiredState` beats `rec`; `ServiceEntry`
beats `Svc`. Readable names help people and AI assistants alike.

For the architecture behind these modules, start with the
[overview](architecture/overview.md) and follow the per-component notes from
there.

### Layout: where things live

```
src/
├── cli/                    # one-shot commands (outrider start, outrider stop, …)
├── tui/                    # Ink dashboard — React on the terminal
├── daemon/                 # control plane: registry, reconciler, supervisor, router
├── shared/                 # types and socket client shared by all three
└── main.ts                 # entry router: CLI, TUI, or daemon, by arguments
```

The [architecture overview](architecture/overview.md) maps these onto the
running system; the docs tree itself is laid out in the
[documentation index](readme.md).

### The layering rule

The one boundary worth internalising early: **CLI and TUI never import daemon
internals.** Both speak only the [shared protocol](cli-reference.md#socket-api-the-contract-behind-every-command)
over a unix socket. It's load-bearing — it's why the TUI can render an offline
snapshot with no daemon running, and why you can script the daemon over the API
without a dashboard. If you catch yourself reaching across that line, pause and
ask whether the thing you need belongs in the shared protocol instead. The
[overview](architecture/overview.md) explains the reasoning in full.

### Working with AI: Claude-friendly by design

outrider is **Claude-friendly**. The structure, naming, type definitions, and
architecture docs are all chosen to work well with AI-assisted development.

In practice, that means you can:

- ask Claude Code (or Claude via the Claude API) to explain an unfamiliar module
  or trace how data flows through it,
- have it sketch an implementation or sanity-check your approach before you
  commit to it,
- run the `/code-review` skill for automated feedback on a change,
- lean on it to jump between related files and spot the existing patterns.

The codebase reads clearly to humans and models alike, so pairing with Claude
works well: you hold the decisions, it handles the boilerplate and the
pattern-matching.

## Scripts and workflow

`package.json` defines a small set of commands that keep the code healthy.
Here's what each one is for.

### `bun run check`

The one every contribution must pass:

```bash
bun run check
```

It runs [fallow](https://github.com/getfallback/fallow), a health checker for
TypeScript projects, which bundles several standards into one pass:

- **Type checking** — full strict-mode type safety, catching errors before they
  ship.
- **Linting** with [Oxlint](https://oxc-project.github.io/) — fast, actionable
  reports on unused variables, unreachable code, and logic mistakes.
- **Health thresholds** — minimum test coverage, no stray `console.log()` in the
  daemon (logging belongs in the logger), and similar guards against regressions.

Read any failure carefully; the output is written to point you straight at the
fix.

### `bun run fix`

Many of the issues `check` finds have an unambiguous fix:

```bash
bun run fix          # fallow fix — apply automatic resolutions
```

Run `bun run check` again afterwards to confirm everything's clean.

### `bun test`

```bash
bun test                       # run everything (discovers tests/ recursively)
bun test tests/shared/sync     # run one directory or file
bun test --watch               # watch mode during active development
```

outrider uses [Bun's native test runner](https://bun.sh/docs/test/overview).
Tests live under `tests/` at the repository root, in a tree that mirrors `src/`
so a module and its test are easy to pair up — see [test coverage](test-coverage.md)
for the full map of what's exercised and where the gaps are. Both unit and
integration suites run here; add tests when you add behaviour, and cover the
edge cases, not just the happy path.

### `bun run format`

```bash
bun run format                 # format everything
bun run format src/daemon      # format a directory
bun run format:check           # verify formatting without changing files (CI)
```

Formatting runs [oxfmt](https://oxc-project.github.io/) and is non-negotiable.
`format:check` is the read-only variant for CI and pre-commit hooks.

### `bun run lint`

```bash
bun run lint                   # show lint issues only
bun run lint:fix               # apply lint fixes
```

These are the lower-level tools `bun run check` already invokes — handy when you
want to focus purely on lint without the rest of the health pass.

### `bun run compile`

When you want to exercise your changes as a real installed binary:

```bash
bun run compile
```

It builds `dist/outrider`, replaces `~/.local/bin/outrider`, and cycles the
daemon (`outrider off && outrider on`) so the fresh binary takes over. For most
work, `bun src/main.ts` is faster; reach for `compile` when you specifically need
the installed-binary experience. The build itself is covered in
[setup](setup.md#building-from-source).

A note on strict mode while you're in here: TypeScript runs stricter than its
defaults — every value has a known type, functions declare their returns,
optionals must be checked before use, and exhaustiveness is enforced. `bun run
check` is what surfaces all of it.

## Common development tasks

### Adding a CLI command

Commands are file routes under `src/cli/commands/` — the file path *is* the
command path:

1. Create the file: `commands/start.ts` → `outrider start`,
   `commands/daemon/run.ts` → `outrider daemon run`.
2. Export a `description` string and a `run(args: string[]): Promise<void>`.
3. Regenerate the manifest: `bun scripts/generate-manifest.ts` (required so
   `bun build --compile` can find the command).

The [CLI reference](cli-reference.md#adding-a-command) covers this from the
command-surface side.

### Adding a daemon component

To add a component to the daemon:

1. Create the module under `src/daemon/`, e.g. `src/daemon/newfeature.ts`.
2. Export a class or factory.
3. Wire it into the composition root (`src/daemon/daemon.ts`), where every
   component is instantiated and connected.
4. Add its test under `tests/daemon/` (the tree mirrors `src/`), e.g.
   `tests/daemon/newfeature.test.ts`.
5. Write a short architecture note at `docs/architecture/newfeature.md` — it's
   how the next person (and future you) understands the design.

### Adding a TUI feature

TUI features are React components built on [Ink](https://github.com/vadimdemedes/ink),
living in `src/tui/components/`. The code is event-driven — components react to
user input and to daemon events over the socket. Read a couple of existing
components first; the patterns are consistent, so follow them.

### Updating documentation

Docs ship with the code — a feature without docs isn't finished. Each kind of
doc has a home:

- [`setup.md`](setup.md) — installing, building, first run
- [`usage.md`](usage.md) — day-to-day workflows
- [`features/`](features/readme.md) — capability deep-dives for end users
- [`architecture/`](architecture/overview.md) — how components work, for contributors
- [`guides/`](guides/) — step-by-step walkthroughs
- [`glossary.md`](glossary.md) — the project's vocabulary
- `develop.md` — this guide

Write for a reader who's sharp but new to the code: explain the concept, show an
example, link onwards. Prose is British English, code is American English
(`behaviour` in a sentence, `color` in a CSS-ish token). Markdown filenames
follow the same kebab-case rule as the source.

## Sending a change

The mechanics of opening issues and pull requests — and the etiquette around
review — live in the [contributing guide](contributing.md). The local loop
before you get there is short:

1. Branch with a descriptive name: `fix/daemon-restart-race`, not `update`.
2. Make the change, with tests where it adds behaviour.
3. Run it for real: the tests, the source directly, and the compiled binary if
   the change touches packaging.
4. `bun run check` must pass; `bun run format` if anything's unformatted.
5. Commit with a message that says what changed and why.

For anything substantial, open an issue first to talk through the approach.

## Debugging and troubleshooting

A few things that come up often:

- **The daemon won't start.** Read the daemon log:
  `less ~/.local/share/outrider/daemon.log`. The error usually names itself.
- **Changes aren't showing up.** Restart the daemon after daemon-side edits
  (`outrider off && outrider on`); reopen the dashboard after TUI edits.
- **A test fails.** The test name and output almost always point at the cause;
  if not, open the test and trace it.
- **A type error.** `bun run check` shows it — terse but precise, pointing at the
  exact line.

## Getting help

Stuck? In rough order of speed:

- **Read the [architecture notes](architecture/overview.md)** for the big picture.
- **Search the codebase** for a similar pattern — someone has likely solved a
  near-identical problem already.
- **Ask Claude** to explain a confusing path or suggest an approach.
- **Open an issue** describing what you're trying to do and where you got stuck.
- **Look at past pull requests** for how similar changes landed.

---

Happy hacking! 🚀
