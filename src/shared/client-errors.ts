import { PROTOCOL_VERSION } from './version'

export class DaemonUnreachableError extends Error {
  constructor(readonly socket: string) {
    super(`outrider daemon is not running (no socket at ${socket})`)
  }
}

export class ProtocolMismatchError extends Error {
  constructor(daemonProtocol: number) {
    super(
      `daemon speaks protocol v${daemonProtocol}, this client speaks v${PROTOCOL_VERSION}; ` +
        'restart the daemon with "outrider off && outrider on"',
    )
  }
}

export class ApiCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
