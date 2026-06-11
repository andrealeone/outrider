/** Fixed-capacity FIFO over a circular array; oldest entries fall off. */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[]
  private head = 0
  private count = 0

  constructor(readonly capacity: number) {
    this.items = new Array<T | undefined>(capacity)
  }

  push(item: T): void {
    this.items[(this.head + this.count) % this.capacity] = item
    if (this.count < this.capacity) this.count += 1
    else this.head = (this.head + 1) % this.capacity
  }

  /** Last `n` items in insertion order (all items when n is omitted). */
  tail(n = this.count): T[] {
    const take = Math.min(n, this.count)
    const out: T[] = []
    for (let i = this.count - take; i < this.count; i++) {
      out.push(this.items[(this.head + i) % this.capacity] as T)
    }
    return out
  }

  get size(): number {
    return this.count
  }
}
