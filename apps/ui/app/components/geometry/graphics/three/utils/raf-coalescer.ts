export type RafCoalescer<T> = {
  schedule: (value: T) => void;
  cancel: () => void;
};

export function createRafCoalescer<T>(callback: (value: T) => void): RafCoalescer<T> {
  let frameId: number | undefined;
  let pendingValue: T | undefined;

  const flush = (): void => {
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

      frameId = requestAnimationFrame(flush);
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
