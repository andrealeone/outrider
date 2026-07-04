import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { $ } from 'bun'

// scripts/install.sh maps `uname -ms` to a release asset name the same way
// this test maps process.platform/arch, so the test targets whatever
// platform it actually runs on rather than hard-coding one.
const os = process.platform === 'darwin' ? 'darwin' : 'linux',
  arch = process.arch === 'arm64' ? 'arm64' : 'x64',
  target = `${os}-${arch}`,
  asset = `outrider-${target}`,
  fixtureBody = '#!/bin/sh\necho fixture-binary\n',
  scriptPath = join(import.meta.dir, '../../../scripts/install.sh')

let server: ReturnType<typeof Bun.serve>

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname

      if (
        path === `/andrealeone/outrider/releases/latest/download/${asset}` ||
        path === `/andrealeone/outrider/releases/download/v9.9.9/${asset}`
      ) {
        return new Response(fixtureBody)
      }

      return new Response('not found', { status: 404 })
    },
  })
})

afterAll(async () => {
  await server.stop(true)
})

const run = async (args: string[], env: Record<string, string>) =>
  $`bash ${scriptPath} ${args}`
    .env({ ...process.env, ...env })
    .nothrow()
    .quiet()

describe('scripts/install.sh', () => {
  test('downloads the latest release asset and installs it executable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outrider-install-'))

    try {
      const result = await run([], {
        GITHUB: server.url.origin,
        OUTRIDER_INSTALL: dir,
        PATH: '/usr/bin:/bin',
      })
      const exe = join(dir, 'bin', 'outrider')

      expect(result.exitCode).toBe(0)
      expect(await Bun.file(exe).text()).toBe(fixtureBody)
      expect((await stat(exe)).mode & 0o777).toBe(0o755)
      expect(result.stdout.toString()).toContain(`installed to ${exe}`)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('installs a pinned tag instead of latest', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outrider-install-'))

    try {
      const result = await run(['v9.9.9'], {
        GITHUB: server.url.origin,
        OUTRIDER_INSTALL: dir,
        PATH: '/usr/bin:/bin',
      })

      expect(result.exitCode).toBe(0)
      expect(await Bun.file(join(dir, 'bin', 'outrider')).text()).toBe(fixtureBody)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('hints to add the install dir to PATH when it is missing from it', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outrider-install-'))

    try {
      const result = await run([], {
        GITHUB: server.url.origin,
        OUTRIDER_INSTALL: dir,
        PATH: '/usr/bin:/bin',
      })

      expect(result.stdout.toString()).toContain('add')
      expect(result.stdout.toString()).toContain('your PATH')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('confirms next steps when the install dir is already on PATH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outrider-install-')),
      binDir = join(dir, 'bin')

    try {
      const result = await run([], {
        GITHUB: server.url.origin,
        OUTRIDER_INSTALL: dir,
        PATH: `${binDir}:/usr/bin:/bin`,
      })

      expect(result.stdout.toString()).toContain("run 'outrider on'")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  test('fails without installing when the release asset does not exist', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'outrider-install-'))

    try {
      const result = await run(['v0.0.1-missing'], {
        GITHUB: server.url.origin,
        OUTRIDER_INSTALL: dir,
        PATH: '/usr/bin:/bin',
      })

      expect(result.exitCode).not.toBe(0)
      expect(await Bun.file(join(dir, 'bin', 'outrider')).exists()).toBe(false)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
