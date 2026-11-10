/**
 * Fixed-capacity ring buffer for log entries.
 *
 * O(1) push (newest at index 0), O(1) indexed access, no array copies on insert.
 * When capacity is reached, the oldest entry is silently overwritten.
 *
 * The `version` counter increments on every mutation, enabling cheap change
 * detection in React selectors without comparing array contents.
 */
export class LogRingBuffer<T> {
  // oxlint-disable-next-line @typescript-eslint/parameter-properties -- erasableSyntaxOnly forbids parameter properties
  private readonly capacity: number;
  private readonly items: Array<T | undefined>;
  private head = 0;
  private _size = 0;
  private _version = 0;

  public constructor(capacity: number) {
    this.capacity = capacity;
    this.items = Array.from<T | undefined>({ length: capacity }).fill(undefined);
  }

  public push(item: T): void {
    this.head = (this.head - 1 + this.capacity) % this.capacity;
    this.items[this.head] = item;
    if (this._size < this.capacity) {
      this._size++;
    }

    this._version++;
  }

  public get(index: number): T | undefined {
    if (index < 0 || index >= this._size) {
      return undefined;
    }

    return this.items[(this.head + index) % this.capacity];
  }

  public get size(): number {
    return this._size;
  }

  public get version(): number {
    return this._version;
  }

  public clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this._size = 0;
    this._version++;
  }

  public *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this._size; i++) {
      yield this.items[(this.head + i) % this.capacity] as T;
    }
  }

  public toArray(): T[] {
    const result = Array.from<T>({ length: this._size });
    for (let i = 0; i < this._size; i++) {
      result[i] = this.items[(this.head + i) % this.capacity] as T;
    }

    return result;
  }
}
