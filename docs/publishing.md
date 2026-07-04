# Publishing to npm

outrider ships a compiled Bun executable, not a Node package, so distributing
it through npm needs one layer of indirection. This page covers that layer:
the package layout, what each build/release script does, and the steps to cut
a release. It's a maintainer document; end users just want
[`npm install -g outrider`](setup.md#installing-from-npm).

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
that don't match, so a user's `npm install -g outrider` only ever downloads
the one binary relevant to their machine.

## Package layout

```
npm/
├── outrider/                    published as `outrider`
│   ├── package.json              bin + optionalDependencies (the four below)
│   └── bin/outrider.js           launcher: resolves and execs the right binary
├── outrider-darwin-arm64/        published as `outrider-darwin-arm64`
│   └── package.json               os: darwin, cpu: arm64, no bin/ tracked in git
├── outrider-darwin-x64/          same shape, os: darwin, cpu: x64
├── outrider-linux-x64/           same shape, os: linux, cpu: x64
└── outrider-linux-arm64/         same shape, os: linux, cpu: arm64
```

Every binary lives under `dist/` (git-ignored, same as the from-source
build) until the moment it's published: `scripts/publish.ts` stages each one
into its package's `bin/outrider` right before `npm publish`, then deletes it
again straight after. `npm/` on disk between releases holds nothing but
tracked package manifests and the launcher script, never a 60+ MB binary, so
there's no risk of one ending up in a commit.

The `outrider` package carries no binary at all, only `bin/outrider.js`, a
small Node script that:

1. maps `${process.platform}-${process.arch}` to the matching platform
   package name,
2. `require.resolve`s that package's `bin/outrider` (the one npm actually
   installed, per the `os`/`cpu` match),
3. `spawnSync`s it with inherited stdio, forwarding argv and exit code.

Windows has no platform package and isn't in the launcher's map, matching
[setup.md's requirements](setup.md#requirements): out of scope for v1.

## Scripts

- **`bun scripts/build.ts --all`**: cross-compiles all four targets into
  `dist/outrider-<target>`, the same `dist/` the from-source build already
  uses. Cross-compilation runs from any single host (arm64 macOS in
  practice); no per-arch CI runner is needed.
- **`bun scripts/sync-version.ts`**: stamps this repo's own `package.json`
  version into `src/shared/version.ts`'s `APP_VERSION` and every
  `npm/*/package.json`, including the `optionalDependencies` version pins in
  `npm/outrider/package.json`. The root `package.json` version is the single
  source of truth; bump it there and run this script.
- **`bun scripts/publish.ts`**: for each platform target: copies
  `dist/outrider-<target>` into `npm/outrider-<target>/bin/outrider`, runs
  `npm publish --access public` from that package directory, then deletes the
  staged binary; finally publishes `outrider` last. Order matters: its
  `optionalDependencies` must point at versions that already exist on the
  registry, or the install fails on a version npm can't find.
- **`bun run release`**: the one-shot version of all three, in order
  (`sync-version` → `build --all` → `publish`).

## Cutting a release

```bash
# 1. bump the version
vim package.json                 # bump "version"

# 2. sync it everywhere, build, and publish
bun run release
```

## Verifying a package locally before publishing

`npm publish` is not reversible in the way most git operations are (a
published version can be deprecated but not deleted), so pack and install from
a local tarball first. Since `scripts/publish.ts` is the only thing that
copies a binary into `npm/outrider-<target>/bin/`, stage one by hand to test:

```bash
bun scripts/build.ts --all
cp dist/outrider-darwin-arm64 npm/outrider-darwin-arm64/bin/outrider
chmod +x npm/outrider-darwin-arm64/bin/outrider

cd npm/outrider-darwin-arm64 && npm pack --pack-destination /tmp && cd -
cd npm/outrider && npm pack --pack-destination /tmp && cd -
rm npm/outrider-darwin-arm64/bin/outrider   # done staging, keep npm/ binary-free

mkdir /tmp/outrider-smoke-test && cd /tmp/outrider-smoke-test
npm init -y
npm install /tmp/outrider-darwin-arm64-*.tgz /tmp/outrider-*.tgz
./node_modules/.bin/outrider --version
```

Swap the platform package for whichever one matches the machine you're
testing on.
