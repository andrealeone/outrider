// Single source of truth for outrider's version: this repo's own
// `package.json`. Run after bumping it, before publishing, to stamp the same
// version into `src/shared/version.ts` and every npm/* package manifest
// (including the optionalDependencies pins in npm/outrider/package.json).
//
//   bun scripts/sync-version.ts

import { readdir } from 'node:fs/promises'

type PackageManifest = {
  version: string
  optionalDependencies?: Record<string, string>
}

const { version } = (await Bun.file('package.json').json()) as PackageManifest

await Bun.write(
  'src/shared/version.ts',
  (await Bun.file('src/shared/version.ts').text()).replace(
    /^export const APP_VERSION = '.*'$/m,
    `export const APP_VERSION = '${version}'`,
  ),
)

for (const name of await readdir('npm')) {
  const path = `npm/${name}/package.json`,
    pkg = (await Bun.file(path).json()) as PackageManifest

  pkg.version = version

  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) pkg.optionalDependencies[dep] = version
  }

  await Bun.write(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

console.log(`synced version ${version} to src/shared/version.ts and npm/*/package.json`)
