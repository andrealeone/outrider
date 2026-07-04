// Publish the npm packages, platform binaries first: `npm/outrider`'s
// optionalDependencies must resolve to versions that already exist on the
// registry, or `npm install outrider` fails on a version that isn't there yet.
//
// `npm/outrider-<target>/bin/outrider` is never committed: this script stages
// the binary in from `dist/` (built by `scripts/build.ts --all`) right before
// publishing that package, then removes it again so `npm/` only ever holds
// tracked package manifests and the launcher script.
//
//   bun scripts/build.ts --all && bun scripts/sync-version.ts && bun scripts/publish.ts

import { $ } from 'bun'

const TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']

for (const target of TARGETS) {
  const src = `dist/outrider-${target}`,
    dest = `npm/outrider-${target}/bin/outrider`

  await Bun.write(dest, Bun.file(src))
  await $`chmod +x ${dest}`

  await $`npm publish --access public`.cwd(`npm/outrider-${target}`)
  console.log(`published outrider-${target}`)

  await $`rm ${dest}`
}

await $`npm publish --access public`.cwd('npm/outrider')
console.log('published outrider')
