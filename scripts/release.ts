// Cut a GitHub release: cross-compile all four platform binaries and attach
// them to a release tagged with this repo's own `package.json` version, so
// `scripts/install.sh` (and anyone else) can fetch them from
// `github.com/andrealeone/outrider/releases`.
//
//   bun scripts/release.ts

import { $ } from 'bun'

const { version } = (await Bun.file('package.json').json()) as { version: string },
  tag = `v${version}`

const TARGETS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64']

await $`bun scripts/sync-version.ts`
await $`bun scripts/build.ts --all`

const assets = TARGETS.map((target) => `dist/bin/outrider-${target}`)

// Bun's built-in hasher, rather than shelling out to sha256sum/shasum, which
// aren't guaranteed present under the same name on every build host.
const checksums = (
  await Promise.all(
    assets.map(
      async (path) =>
        `${new Bun.CryptoHasher('sha256').update(await Bun.file(path).bytes()).digest('hex')}  ${path.split('/').pop()}`,
    ),
  )
).join('\n')

await Bun.write('dist/bin/checksums.txt', `${checksums}\n`)

await $`gh release create ${tag} ${assets} dist/bin/checksums.txt --title ${tag} --generate-notes`

console.log(`released ${tag} with ${TARGETS.length} platform binaries`)
