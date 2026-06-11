// The boundary around portless. Portless is pre-1.0 and warns its state
// format may change between releases; every call goes through this interface
// so a breaking change stays local to one implementation file.

export interface RouteBinding {
  route: string
  hostname: string
  port: number
  url: string
}

export interface RouterStatus {
  available: boolean
  proxyRunning: boolean
  routes: RouteBinding[]
}

export interface Router {
  /** Check, start, and repair the proxy; safe to call repeatedly. */
  ensureProxy(): Promise<boolean>
  /**
   * Bind a route to a port. When `alias` is true the route is a static alias
   * (pid 0) for an externally managed service, which portless never prunes;
   * otherwise it is tied to the daemon's lifetime.
   */
  register(route: string, port: number, alias?: boolean): Promise<RouteBinding>
  unregister(route: string): Promise<void>
  urlFor(route: string): string
  status(): Promise<RouterStatus>
}
