export type RafCoalescer<T> = {
  schedule: (value: T) => void;
  /** Delivers a value still waiting for its frame now, and cancels that frame. */
  flush: () => void;
  /** Drops a value still waiting for its frame, and cancels that frame. */
  cancel: () => void;
};

export function createRafCoalescer<T>(callback: (value: T) => void): RafCoalescer<T> {
  let frameId: number | undefined;
  let pendingValue: T | undefined;

  const deliver = (): void => {
    frameId = undefined;
    const value = pendingValue;
    pendingValue = undefined;
    if (value !== undefined) {
      callback(value);
    }
  };

  return {
    schedule(value) {
      pendingValue = value;
      if (frameId !== undefined) {
        return;
      }

      frameId = requestAnimationFrame(deliver);
    },
    flush() {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }

      deliver();
    },
    cancel() {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }

      frameId = undefined;
      pendingValue = undefined;
    },
  };
}
