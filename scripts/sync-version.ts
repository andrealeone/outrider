// Single source of truth for outrider's version: this repo's own
// `package.json`. Run after bumping it, before publishing, to stamp the same
// version into `src/shared/version.ts` and every dist/outrider* package
// manifest (including the optionalDependencies pins in
// dist/outrider/package.json).
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

// `dist/bin` holds raw compiled binaries, not a package; only `dist/outrider*`
// entries are the tracked package manifests this script keeps in sync.
const packageDirs = (await readdir('dist')).filter((name) => name.startsWith('outrider'))

for (const name of packageDirs) {
  const path = `dist/${name}/package.json`,
    pkg = (await Bun.file(path).json()) as PackageManifest

  pkg.version = version

  if (pkg.optionalDependencies) {
    for (const dep of Object.keys(pkg.optionalDependencies)) pkg.optionalDependencies[dep] = version
  }

  await Bun.write(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

console.log(`synced version ${version} to src/shared/version.ts and dist/outrider*/package.json`)
