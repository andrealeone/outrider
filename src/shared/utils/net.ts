const ROUTE_PORT_MIN = 4000
const ROUTE_PORT_MAX = 4999
const ALLOCATION_ATTEMPTS = 50

/** Whether a TCP port can be bound on loopback right now. */
const isPortFree = (port: number): boolean => {
  try {
    const listener = Bun.listen({ hostname: '127.0.0.1', port, socket: { data() {} } })
    listener.stop(true)
    return true
  } catch {
    return false
  }
}

/** Ask the OS for a free ephemeral TCP port. */
const ephemeralPort = (): number => {
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
  const { port } = listener
  listener.stop(true)
  return port
}

/**
 * Pick a free port for a routed service. Kept in the conventional 4000-4999
 * random-free range so firewall rules and muscle memory stay meaningful;
 * falls back to any free ephemeral port if that range is saturated.
 */
export const freePort = (): number => {
  for (let attempt = 0; attempt < ALLOCATION_ATTEMPTS; attempt++) {
    const port = ROUTE_PORT_MIN + Math.floor(Math.random() * (ROUTE_PORT_MAX - ROUTE_PORT_MIN + 1))
    if (isPortFree(port)) return port
  }
  return ephemeralPort()
}
