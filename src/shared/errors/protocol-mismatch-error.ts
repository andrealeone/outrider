import { PROTOCOL_VERSION } from '@/shared/version'

export class ProtocolMismatchError extends Error {
  constructor(daemonProtocol: number) {
    super(
      `daemon speaks protocol v${daemonProtocol}, this client speaks v${PROTOCOL_VERSION}; ` +
        'restart the daemon with "outrider off && outrider on"',
    )
  }
}
