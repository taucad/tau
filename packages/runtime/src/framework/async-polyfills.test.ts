import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForSlotChange, cooperativeYield, scheduleMacrotask } from '#framework/async-polyfills.js';
import { signalSlot } from '#types/runtime-protocol.types.js';

// ===================================================================
// waitForSlotChange
// ===================================================================

describe('waitForSlotChange', () => {
  it('should resolve via Atomics.waitAsync when available', async () => {
    const buffer = new SharedArrayBuffer(16);
    const view = new Int32Array(buffer);
    Atomics.store(view, signalSlot.abortGeneration, 0);

    const promise = waitForSlotChange(view, signalSlot.abortGeneration, 0);

    Atomics.store(view, signalSlot.abortGeneration, 1);
    Atomics.notify(view, signalSlot.abortGeneration);

    await promise;

    expect(Atomics.load(view, signalSlot.abortGeneration)).toBe(1);
  });

  it('should resolve immediately when the slot already differs from expectedValue', async () => {
    const buffer = new SharedArrayBuffer(16);
    const view = new Int32Array(buffer);
    Atomics.store(view, signalSlot.abortGeneration, 3);

    const start = performance.now();
    await waitForSlotChange(view, signalSlot.abortGeneration, 0);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(Atomics.load(view, signalSlot.abortGeneration)).toBe(3);
  });

  it('should fall back to setTimeout polling when Atomics.waitAsync is unavailable', async () => {
    const original = Atomics.waitAsync;
    try {
      // @ts-expect-error -- Temporarily removing waitAsync to test fallback
      Atomics.waitAsync = undefined;

      const buffer = new SharedArrayBuffer(16);
      const view = new Int32Array(buffer);
      Atomics.store(view, signalSlot.abortGeneration, 0);

      const start = performance.now();
      await waitForSlotChange(view, signalSlot.abortGeneration, 0);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(10);
    } finally {
      Atomics.waitAsync = original;
    }
  });
});

// ===================================================================
// cooperativeYield
// ===================================================================

describe('cooperativeYield', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should resolve without errors', async () => {
    await cooperativeYield();
  });

  it('should yield the event loop allowing synchronous code to run first', async () => {
    const order: number[] = [];

    const yieldPromise = (async () => {
      await cooperativeYield();
      order.push(2);
    })();

    order.push(1);

    await yieldPromise;

    expect(order).toEqual([1, 2]);
  });

  it('should never fall back to a zero-delay timer when scheduler.yield is unavailable', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'scheduler');
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      Object.defineProperty(globalThis, 'scheduler', { configurable: true, value: undefined });

      await cooperativeYield();

      // Node clamps `setTimeout(…, 0)` to >= 1 ms, which made this single yield the
      // largest item in the framework's per-render cost. It must reach the next task
      // through the check phase (`setImmediate`) or a posted message, never a timer.
      expect(timeoutSpy).not.toHaveBeenCalled();
    } finally {
      timeoutSpy.mockRestore();
      if (originalDescriptor === undefined) {
        Reflect.deleteProperty(globalThis, 'scheduler');
      } else {
        Object.defineProperty(globalThis, 'scheduler', originalDescriptor);
      }
    }
  });

  it('should call scheduler.yield with the native scheduler receiver', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'scheduler');
    const receiverToken = Symbol('scheduler-receiver');
    const observedReceivers: unknown[] = [];
    const scheduler = {
      receiverToken,
      async yield(this: unknown) {
        observedReceivers.push(this);
      },
    };

    try {
      Object.defineProperty(globalThis, 'scheduler', {
        configurable: true,
        value: scheduler,
      });

      await cooperativeYield();

      expect(observedReceivers).toEqual([scheduler]);
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'scheduler', originalDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'scheduler');
      }
    }
  });
});

// ===================================================================
// scheduleMacrotask
// ===================================================================

describe('scheduleMacrotask', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should reach the next task through the check phase in Node, not a timer', async () => {
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const immediateSpy = vi.spyOn(globalThis, 'setImmediate');

    await new Promise<void>((resolve) => {
      scheduleMacrotask(resolve);
    });

    expect(immediateSpy).toHaveBeenCalledOnce();
    expect(timeoutSpy).not.toHaveBeenCalled();
  });

  it('should post a message when the realm has no setImmediate, as a browser worker does', async () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'setImmediate');
    const timeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    try {
      Reflect.deleteProperty(globalThis, 'setImmediate');

      const order: number[] = [];
      const scheduled = new Promise<void>((resolve) => {
        scheduleMacrotask(() => {
          order.push(2);
          resolve();
        });
      });
      order.push(1);
      await scheduled;

      expect(order).toEqual([1, 2]);
      expect(timeoutSpy).not.toHaveBeenCalled();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(globalThis, 'setImmediate', originalDescriptor);
      }
    }
  });
});
