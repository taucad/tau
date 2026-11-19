/**
 * Async queue implementation for LSP message handling.
 */

import { createKclLogger } from '#lib/kcl-language/lsp/kcl-logs.js';

const log = createKclLogger('Queue');

export class Queue<T> {
  private readonly promises: Array<Promise<T>> = [];
  // eslint-disable-next-line tau-lint/no-handrolled-fanout -- Single-consumer FIFO waiters; enqueue shifts exactly one resolver.
  private readonly resolvers: Array<(item: T) => void> = [];
  private closed = false;

  public enqueue(item: T): void {
    log.debug('enqueue() called, closed:', this.closed, 'resolvers:', this.resolvers.length);
    if (!this.closed) {
      if (this.resolvers.length === 0) {
        this.addPromise();
      }

      const resolve = this.resolvers.shift();
      if (resolve) {
        log.debug('Resolving with item');
        resolve(item);
      }
    }
  }

  public async dequeue(): Promise<T> {
    log.debug('dequeue() called, promises:', this.promises.length);
    if (this.promises.length === 0) {
      this.addPromise();
    }

    const item = this.promises.shift();
    if (!item) {
      throw new Error('Queue is unexpectedly empty');
    }

    log.debug('dequeue() awaiting item...');
    const result = await item;
    log.debug('dequeue() got item');
    return result;
  }

  public isEmpty(): boolean {
    return this.promises.length === 0;
  }

  public isBlocked(): boolean {
    return this.resolvers.length > 0;
  }

  public get length(): number {
    return this.promises.length - this.resolvers.length;
  }

  public async next(): Promise<IteratorResult<T, void>> {
    log.debug('next() called');
    const value = await this.dequeue();
    log.debug('next() returning value');
    return { done: false, value };
  }

  public async return_(): Promise<IteratorResult<T, void>> {
    log.debug('return_() called');
    this.close();
    return { done: true, value: undefined };
  }

  public async throw_(error: Error): Promise<IteratorResult<T, void>> {
    log.debug('throw_() called');
    throw error;
  }

  public [Symbol.asyncIterator](): AsyncGenerator<T, void, void> {
    log.debug('[Symbol.asyncIterator] called');
    return {
      next: async () => this.next(),
      return: async () => ({ done: true, value: undefined }),
      throw: async () => ({ done: true, value: undefined }),
      [Symbol.asyncIterator]: () => this[Symbol.asyncIterator](),
      [Symbol.asyncDispose]: async () => {
        this.close();
      },
    };
  }

  public close(): void {
    log.debug('close() called');
    this.closed = true;
  }

  private addPromise(): void {
    log.debug('addPromise() called');
    this.promises.push(
      new Promise((resolve) => {
        this.resolvers.push(resolve);
      }),
    );
  }
}
