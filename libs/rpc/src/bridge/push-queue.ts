/**
 * Async push queue used by the server-side broadcast/watch async iterators.
 * Items pushed before a `next()` call are buffered; `close()` ends the stream.
 */
export type PushQueue<T> = {
  push: (value: T) => void;
  close: () => void;
  iterable: AsyncIterable<T>;
};

export const createPushQueue = <T>(): PushQueue<T> => {
  const buffer: T[] = [];
  const waiters: Array<(result: IteratorResult<T>) => void> = [];
  let closed = false;

  const push = (value: T): void => {
    if (closed) {
      return;
    }
    const waiter = waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
    } else {
      buffer.push(value);
    }
  };

  const close = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    for (const waiter of waiters.splice(0)) {
      waiter({ value: undefined as unknown as T, done: true });
    }
  };

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator]() {
      return {
        next: async (): Promise<IteratorResult<T>> => {
          if (buffer.length > 0) {
            const value = buffer.shift() as T;
            return { value, done: false };
          }
          if (closed) {
            return { value: undefined as unknown as T, done: true };
          }
          return new Promise<IteratorResult<T>>((resolve) => {
            waiters.push(resolve);
          });
        },
        return: async (): Promise<IteratorResult<T>> => {
          close();
          return { value: undefined as unknown as T, done: true };
        },
      };
    },
  };

  return { push, close, iterable };
};
