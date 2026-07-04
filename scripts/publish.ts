// Publish the npm packages to GitHub Packages, platform binaries first:
// `dist/outrider`'s optionalDependencies must resolve to versions that already
// exist on the registry, or `npm install @andrealeone/outrider` fails on a
// version that isn't there yet.
//
// `dist/outrider-<target>/bin/outrider` is never committed: this script stages
// the binary in from `dist/bin/` (built by `scripts/build.ts --all`) right
// before publishing that package, then removes it again so `dist/outrider-<target>`
// only ever holds tracked package manifests between releases.
//
//   bun scripts/build.ts --all && bun scripts/sync-version.ts && bun scripts/publish.ts

import { $ } from 'bun'

const TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']

for (const target of TARGETS) {
  const src = `dist/bin/outrider-${target}`,
    dest = `dist/outrider-${target}/bin/outrider`

  await Bun.write(dest, Bun.file(src))
  await $`chmod +x ${dest}`

  await $`npm publish`.cwd(`dist/outrider-${target}`)
  console.log(`published @andrealeone/outrider-${target}`)

  await $`rm ${dest}`
}

await $`npm publish`.cwd('dist/outrider')
console.log('published @andrealeone/outrider')
