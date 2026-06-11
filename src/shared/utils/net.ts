/** Ask the OS for a free ephemeral TCP port. */
export const freePort = (): number => {
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
  const { port } = listener
  listener.stop(true)
  return port
}
