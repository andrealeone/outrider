/**
 * The single shape for command replies, so every command stays coherent across
 * the scenarios a user can hit. Status lines go to stdout, failures to stderr,
 * and failure is signalled with `process.exitCode` rather than `process.exit` —
 * that lets buffered output flush and any in-flight Ink render tear down before
 * the process exits (`src/main.ts` just awaits `dispatch`, so the code sticks).
 */

/** A status reply the user asked for. Goes to stdout; leaves the exit code. */
export const reply = (message: string): void => {
  console.log(message)
}

/** A failure reply. Goes to stderr and marks the process as failed. */
export const fail = (message: string): void => {
  console.error(message)
  process.exitCode = 1
}
