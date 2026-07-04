// Single source of truth for outrider's version: this repo's own
// `package.json`. Run after bumping it to stamp the same version into
// `src/shared/version.ts`.
//
//   bun scripts/sync-version.ts

const { version } = (await Bun.file('package.json').json()) as { version: string }

await Bun.write(
  'src/shared/version.ts',
  (await Bun.file('src/shared/version.ts').text()).replace(
    /^export const APP_VERSION = '.*'$/m,
    `export const APP_VERSION = '${version}'`,
  ),
)

console.log(`synced version ${version} to src/shared/version.ts`)
