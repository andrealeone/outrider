export class RegistryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}
