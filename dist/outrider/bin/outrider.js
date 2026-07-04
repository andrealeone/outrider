#!/usr/bin/env node

// Launcher for the `outrider` npm package: outrider ships as a compiled Bun
// executable, one binary per platform, distributed as separate optional
// dependencies (see docs/publishing.md). This script resolves the one that
// npm actually installed for the current machine and execs it, forwarding
// argv, stdio, and exit code.

const { spawnSync } = require('node:child_process')
const path = require('node:path')

const PLATFORM_PACKAGES = {
  'darwin-arm64': '@andrealeone/outrider-darwin-arm64',
  'darwin-x64': '@andrealeone/outrider-darwin-x64',
  'linux-x64': '@andrealeone/outrider-linux-x64',
  'linux-arm64': '@andrealeone/outrider-linux-arm64',
}

const key = `${process.platform}-${process.arch}`
const pkg = PLATFORM_PACKAGES[key]

if (!pkg) {
  console.error(`outrider: unsupported platform ${key}`)
  process.exit(1)
}

let binary
try {
  binary = path.join(path.dirname(require.resolve(`${pkg}/package.json`)), 'bin', 'outrider')
} catch {
  console.error(
    `outrider: platform package ${pkg} is not installed. ` +
      `npm should have installed it automatically as an optionalDependency for ${key}.`,
  )
  process.exit(1)
}

const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' })

if (result.error) throw result.error
process.exit(result.status ?? 1)
