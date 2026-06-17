// Synthesise a docker/podman-based process from a container spec. The command
// is dynamically built to support port injection and the portless route.

import type { PortlessExtension, ProcessConfig } from '../shared/types/process-compose'
import type { ServiceDefinition, ContainerSpec as ContainerSpecProto } from '../shared/types/protocol'

import { RegistryError } from './registry'

class ContainerError extends RegistryError {
  constructor(message: string) {
    super('invalid', message)
  }
}

interface ContainerRuntime {
  bin: string
  available: boolean
}

const runtimes: Record<string, () => ContainerRuntime> = {
  docker: () => ({
    bin: 'docker',
    available: Bun.which('docker') !== null,
  }),
  podman: () => ({
    bin: 'podman',
    available: Bun.which('podman') !== null,
  }),
}

const detectRuntime = (requested?: string): string => {
  if (requested) {
    const rtFn = runtimes[requested]
    if (!rtFn) throw new ContainerError(`unknown runtime "${requested}"`)
    const { available, bin } = rtFn()
    if (!available) throw new ContainerError(`runtime "${bin}" not found on PATH`)
    return bin
  }
  for (const name of ['docker', 'podman']) {
    const rtFn = runtimes[name]
    if (rtFn) {
      const { available, bin } = rtFn()
      if (available) return bin
    }
  }
  throw new ContainerError(
    'neither docker nor podman found on PATH; install one to run containers',
  )
}

/** Synthesise the `docker run` command from a container spec and a route. */
const synthCommand = (id: string, spec: ContainerSpecProto, route?: PortlessExtension): string => {
  const bin = detectRuntime(spec.runtime)
  const args: string[] = [
    bin,
    'run',
    '--rm',
    '--name',
    `outrider-${id}`,
  ]

  if (route?.alias && route.port) {
    args.push('-p', `${route.port}:${spec.containerPort}`)
  } else if (route) {
    args.push('-p', `$PORT:${spec.containerPort}`)
  } else if (spec.hostPort) {
    args.push('-p', `${spec.hostPort}:${spec.containerPort}`)
  }

  if (spec.env) {
    for (const [k, v] of Object.entries(spec.env)) {
      args.push('-e', `${k}=${v}`)
    }
  }

  args.push(spec.image)
  if (spec.args?.length) args.push(...spec.args)

  return args.join(' ')
}

/**
 * Build a process config from a container spec. The command is the docker/podman
 * invocation; the shutdown command is `docker stop <id>`.
 */
export const containerConfig = (
  id: string,
  spec: ContainerSpecProto,
  route?: PortlessExtension,
): ProcessConfig => {
  if (!spec.image?.trim()) throw new ContainerError('container image is required')
  if (!Number.isInteger(spec.containerPort) || spec.containerPort < 1 || spec.containerPort > 65535) {
    throw new ContainerError('containerPort must be an integer between 1 and 65535')
  }
  if (spec.hostPort !== undefined) {
    if (!Number.isInteger(spec.hostPort) || spec.hostPort < 1 || spec.hostPort > 65535) {
      throw new ContainerError('hostPort must be an integer between 1 and 65535')
    }
  }

  detectRuntime(spec.runtime)

  const config: ProcessConfig = {
    command: synthCommand(id, spec, route),
    shutdown: {
      command: `${detectRuntime(spec.runtime)} stop outrider-${id}`,
      timeout_seconds: 10,
    },
    is_daemon: false,
  }

  return config
}

/**
 * Lift a container service definition into a full entry: validate the spec,
 * synthesise the config, and set up the route (alias if hostPort, else managed).
 */
export const entryFromContainer = (
  id: string,
  spec: ContainerSpecProto,
): { config: ProcessConfig; route?: PortlessExtension } => {
  let route: PortlessExtension | undefined

  if (spec.hostPort !== undefined) {
    route = {
      route: id,
      alias: true,
      port: spec.hostPort,
    }
  } else {
    route = {
      route: id,
      alias: false,
    }
  }

  const config = containerConfig(id, spec, route)
  return { config, route }
}

export { ContainerError }
