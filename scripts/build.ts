// Compile the single-executable outrider binary. One binary contains the
// CLI, the TUI, and the daemon (`outrider daemon run` is the same file).
//
//   bun scripts/build.ts            → dist/outrider for the host platform
//   bun scripts/build.ts --all      → all four release targets

import { $ } from 'bun'

const TARGETS = ['bun-darwin-arm64', 'bun-darwin-x64', 'bun-linux-x64', 'bun-linux-arm64'] as const

const all = process.argv.includes('--all')
const targets = all ? [...TARGETS] : [undefined]

for (const target of targets) {
  const suffix = target === undefined ? '' : `-${target.replace('bun-', '')}`
  const outfile = `dist/outrider${suffix}`
  const args = [
    'build',
    '--compile',
    '--minify',
    '--define',
    'process.env.NODE_ENV="production"',
    ...(target === undefined ? [] : ['--target', target]),
    'src/main.ts',
    '--outfile',
    outfile,
  ]
  await $`bun ${args}`.quiet()
  console.log(`built ${outfile}`)
}
