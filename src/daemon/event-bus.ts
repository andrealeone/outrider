import type { DaemonEvent } from '../shared/types/protocol'

type Listener = (event: DaemonEvent) => void

/** In-process fan-out for daemon events; the API mirrors it onto WebSockets. */
export class EventBus {
  private readonly listeners = new Set<Listener>()

  on(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(event: DaemonEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}
