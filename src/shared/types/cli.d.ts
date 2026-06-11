export interface CommandModule {
  description: string
  /** Hidden commands are excluded from help output. */
  hidden?: boolean
  run(args: string[]): Promise<void>
}
