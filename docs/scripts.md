# Scripts

Every file under `scripts/` is a standalone Bun (or shell) script, run directly
rather than imported. Some are wrapped by a `package.json` command (see
[developing outrider](develop.md#scripts-and-workflow) for those); others you
invoke by path. Here's what each one does.

### `build.ts`

Compiles the single-executable outrider binary (CLI, TUI, and daemon in one
file). `bun scripts/build.ts` builds for the host platform into
`dist/bin/outrider`; `bun scripts/build.ts --all` cross-compiles one binary per
release target (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`) into
`dist/bin/outrider-<target>`. It first checks the running Bun version against a
minimum (kept in sync with `engines.bun` in `package.json`), since
`bun build --compile` embeds the running Bun as the binary's runtime and a
stale one can't speak the daemon's `ws+unix://` socket scheme. This is what
`bun run compile` and `release.ts` call.

### `generate-manifest.ts`

Regenerates `src/cli/manifest.ts` by walking `src/cli/commands/` and turning
each file path into a command path (e.g. `commands/daemon/run.ts` →
`"daemon run"`). Run it with `bun scripts/generate-manifest.ts` any time you
add or remove a command file; see
[adding a CLI command](develop.md#adding-a-cli-command). The manifest is
generated rather than discovered at runtime so `bun build --compile` can
bundle every command into the binary statically.

### `install.sh`

The end-user install script, fetched and run with
`curl -fsSL .../scripts/install.sh | bash`. It maps `uname -ms` to a release
asset name, downloads the matching binary from the latest (or a given) GitHub
release, and installs it to `~/.local/bin` (or `$OUTRIDER_INSTALL/bin`). It's a
shell script rather than a Bun one deliberately: it has to run before the user
has Bun, or outrider, installed at all. Covered from the user side in
[install.md](install.md#installing).

### `release.ts`

Cuts a GitHub release: reads the version from `package.json`, runs
`sync-version.ts` and `build.ts --all`, hashes each resulting binary with
Bun's built-in SHA-256 hasher into `checksums.txt`, then calls
`gh release create` to tag `v<version>` and attach the binaries plus
checksums. This is what `bun run release` calls; it's also what `install.sh`
ultimately downloads from.

### `sync-version.ts`

The single source of truth for outrider's version is `package.json`; this
script stamps that version into `export const APP_VERSION` in
`src/shared/version.ts`. Run it (or one of the `bun run version:*` commands,
which call it automatically after bumping `package.json`) after any manual
version change so the compiled binary reports the right version.
