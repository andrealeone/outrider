import { describe, expect, test } from 'bun:test'

import type { ContainerSpec as ContainerSpecProto } from '../shared/types/protocol'

import { containerConfig, entryFromContainer } from './container'

const spec = (over: Partial<ContainerSpecProto> = {}): ContainerSpecProto => ({
  image: 'redis:latest',
  containerPort: 6379,
  ...over,
})

describe('container synthesis', () => {
  test('synthesises a managed-route container command', () => {
    const { config } = entryFromContainer('redis', spec())
    expect(config.command).toMatch(/docker run --rm --name outrider-redis/)
    expect(config.command).toMatch(/-p \$PORT:6379/)
    expect(config.command).toMatch(/redis:latest/)
  })

  test('detects available runtime (docker or podman)', () => {
    const { config } = entryFromContainer('pg', spec())
    expect(config.command).toMatch(/^(docker|podman) run/)
  })

  test('uses hostPort for a fixed-port alias route', () => {
    const { config, route } = entryFromContainer('redis', spec({ hostPort: 6380 }))
    expect(config.command).toMatch(/-p 6380:6379/)
    expect(route?.alias).toBe(true)
    expect(route?.port).toBe(6380)
    expect(route?.route).toBe('redis')
  })

  test('includes env vars and args from the spec', () => {
    const { config } = entryFromContainer('pg', spec({
      env: { PGDATA: '/var/lib/postgresql/data' },
      args: ['-v'],
    }))
    expect(config.command).toMatch(/-e PGDATA=\/var\/lib\/postgresql\/data/)
    expect(config.command).toMatch(/-v/)
  })

  test('sets a default shutdown command', () => {
    const { config } = entryFromContainer('redis', spec())
    expect(config.shutdown?.command).toMatch(/docker stop outrider-redis/)
  })

  test('rejects invalid containerPort', () => {
    expect(() => containerConfig('x', spec({ containerPort: -1 }))).toThrow(/containerPort/)
    expect(() => containerConfig('x', spec({ containerPort: 100000 }))).toThrow(/containerPort/)
  })

  test('rejects missing image', () => {
    expect(() => containerConfig('x', spec({ image: '' }))).toThrow(/image/)
  })
})
