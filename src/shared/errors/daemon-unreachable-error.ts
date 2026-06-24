export class DaemonUnreachableError extends Error {
  constructor(readonly socket: string) {
    super(`outrider daemon is not running (no socket at ${socket})`)
  }
}
