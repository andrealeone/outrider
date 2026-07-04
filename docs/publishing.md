# Publishing to GitHub Packages

outrider ships a compiled Bun executable, not a Node package, so distributing
it through npm needs one layer of indirection. This page covers that layer:
the package layout, what each build/release script does, and the steps to cut
a release. It's a maintainer document; end users just want
[`npm install -g @andrealeone/outrider`](setup.md#installing-from-npm).

Packages publish to **GitHub Packages** (`npm.pkg.github.com`) under the
`@andrealeone` scope, not the public npmjs registry. That means installers
need a GitHub personal access token with `read:packages` and a scoped
`.npmrc` entry — see [setup.md](setup.md#installing-from-npm) for the
consumer-facing steps.

## Why not a single package

`bun build --compile` embeds the target's runtime into the binary, so there is
no single artefact that runs on every platform: one binary per
architecture, same as `scripts/build.ts --all` already produces for the
from-source workflow. A single npm package can only carry one binary without
either bloating every install with all four, or needing a postinstall script
that downloads the right one over the network (worse offline, behind
proxies, and for registry integrity).

The standard fix, used by esbuild, swc, turbo, and oxlint (already a
`devDependency` here), is **one binary-only package per platform plus a tiny
JS launcher package**, wired together with `optionalDependencies`. npm reads
each candidate's `os`/`cpu` fields at install time and silently skips the ones
that don't match, so a user's `npm install -g @andrealeone/outrider` only ever
downloads the one binary relevant to their machine.

## Package layout

```
dist/
├── bin/                                    raw compiled binaries, git-ignored
│   ├── outrider                             host build (`bun scripts/build.ts`)
│   ├── outrider-darwin-arm64                 cross-compiled targets
│   ├── outrider-darwin-x64                   (`bun scripts/build.ts --all`)
│   ├── outrider-linux-x64
│   └── outrider-linux-arm64
├── outrider/                    published as `@andrealeone/outrider`
│   ├── package.json              bin + optionalDependencies (the four below)
│   └── bin/outrider.js           launcher: resolves and execs the right binary
├── outrider-darwin-arm64/        published as `@andrealeone/outrider-darwin-arm64`
│   └── package.json               os: darwin, cpu: arm64, no bin/ tracked in git
├── outrider-darwin-x64/          same shape, os: darwin, cpu: x64
├── outrider-linux-x64/           same shape, os: linux, cpu: x64
└── outrider-linux-arm64/         same shape, os: linux, cpu: arm64
```

Raw compiled binaries live under `dist/bin/` (git-ignored) until the moment
they're published: `scripts/publish.ts` stages each one into its package's
`bin/outrider` right before `npm publish`, then deletes it again straight
after. The `dist/outrider*/` package directories hold nothing but tracked
package manifests and the launcher script between releases, never a 60+ MB
binary, so there's no risk of one ending up in a commit.

The `outrider` package carries no binary at all, only `bin/outrider.js`, a
small Node script that:

1. maps `${process.platform}-${process.arch}` to the matching platform
   package name,
2. `require.resolve`s that package's `bin/outrider` (the one npm actually
   installed, per the `os`/`cpu` match),
3. `spawnSync`s it with inherited stdio, forwarding argv and exit code.

Windows has no platform package and isn't in the launcher's map, matching
[setup.md's requirements](setup.md#requirements): out of scope for v1.

## Registry configuration

Every `dist/outrider*/package.json` carries:

```json
"publishConfig": { "registry": "https://npm.pkg.github.com" }
```

which is what actually routes `npm publish` to GitHub Packages instead of
the default npmjs registry. Authentication comes from the repo-root
`.npmrc`:

```
@andrealeone:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Publishing (locally or from CI) requires a `GITHUB_TOKEN` env var with
`write:packages` scope in the environment running `npm publish`.

## Scripts

- **`bun scripts/build.ts --all`**: cross-compiles all four targets into
  `dist/bin/outrider-<target>`, the same `dist/bin/` the from-source build
  already uses. Cross-compilation runs from any single host (arm64 macOS in
  practice); no per-arch CI runner is needed.
- **`bun scripts/sync-version.ts`**: stamps this repo's own `package.json`
  version into `src/shared/version.ts`'s `APP_VERSION` and every
  `dist/outrider*/package.json`, including the `optionalDependencies` version
  pins in `dist/outrider/package.json`. The root `package.json` version is
  the single source of truth; bump it there and run this script.
- **`bun scripts/publish.ts`**: for each platform target: copies
  `dist/bin/outrider-<target>` into `dist/outrider-<target>/bin/outrider`, runs
  `npm publish` from that package directory, then deletes the staged binary;
  finally publishes `outrider` last. Order matters: its
  `optionalDependencies` must point at versions that already exist on the
  registry, or the install fails on a version npm can't find.
- **`bun run release`**: the one-shot version of all three, in order
  (`sync-version` → `build --all` → `publish`).

## Cutting a release

```bash
# 1. bump the version
vim package.json                 # bump "version"

# 2. sync it everywhere, build, and publish (needs GITHUB_TOKEN in the env)
bun run release
```

## Verifying a package locally before publishing

`npm publish` is not reversible in the way most git operations are (a
published version can be deprecated but not deleted), so pack and install from
a local tarball first. Since `scripts/publish.ts` is the only thing that
copies a binary into `dist/outrider-<target>/bin/`, stage one by hand to test:

```bash
bun scripts/build.ts --all
cp dist/bin/outrider-darwin-arm64 dist/outrider-darwin-arm64/bin/outrider
chmod +x dist/outrider-darwin-arm64/bin/outrider

cd dist/outrider-darwin-arm64 && npm pack --pack-destination /tmp && cd -
cd dist/outrider && npm pack --pack-destination /tmp && cd -
rm dist/outrider-darwin-arm64/bin/outrider   # done staging, keep dist/outrider* binary-free

mkdir /tmp/outrider-smoke-test && cd /tmp/outrider-smoke-test
npm init -y
npm install /tmp/andrealeone-outrider-darwin-arm64-*.tgz /tmp/andrealeone-outrider-*.tgz
./node_modules/.bin/outrider --version
```

Swap the platform package for whichever one matches the machine you're
testing on.
