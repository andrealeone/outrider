// Compile the single-executable outrider binary. One binary contains the
// CLI, the TUI, and the daemon (`outrider daemon run` is the same file).
//
//   bun scripts/build.ts            → dist/outrider for the host platform
//   bun scripts/build.ts --all      → all four release targets

import { $ } from 'bun'

// `bun build --compile` embeds the *running* Bun as the binary's runtime, so a
// stale host Bun silently ships a stale runtime. The client talks to the daemon
// over a unix-socket WebSocket using the `ws+unix://` scheme, which older Bun
// runtimes reject with "Wrong url scheme for WebSocket". Refuse to compile a
// binary that couldn't talk to its own daemon. Keep in sync with package.json's
// `engines.bun`.
const MIN_BUN = [1, 3, 10],
  have = Bun.version.split('.').map((n) => parseInt(n, 10) || 0)

// Lexicographic compare of [major, minor, patch]: first differing field decides.
const tooOld = MIN_BUN.reduce<number>((cmp, min, i) => cmp || (have[i] ?? 0) - min, 0) < 0

if (tooOld) {
  console.error(
    `outrider needs Bun >= ${MIN_BUN.join('.')} to compile (found ${Bun.version}); ` +
      `the embedded runtime would not support the ws+unix:// event stream. Run \`bun upgrade\`.`,
  )

  process.exit(1)
}

const TARGETS = ['bun-darwin-arm64', 'bun-darwin-x64', 'bun-linux-x64', 'bun-linux-arm64'] as const,
  all = process.argv.includes('--all'),
  targets = all ? [...TARGETS] : [undefined]

for (const target of targets) {
  const suffix = target === undefined ? '' : `-${target.replace('bun-', '')}`,
    outfile = `dist/outrider${suffix}`,
    args = [
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
