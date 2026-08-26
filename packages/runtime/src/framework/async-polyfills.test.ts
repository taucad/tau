import { describe, it, expect, vi, afterEach } from 'vitest';
import { waitForSlotChange, cooperativeYield } from '#framework/async-polyfills.js';
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

  it('should fall back to setTimeout(0) when scheduler.yield is unavailable', async () => {
    const originalScheduler = globalThis.scheduler;
    try {
      // @ts-expect-error -- Temporarily removing scheduler to test fallback
      globalThis.scheduler = undefined;

      await cooperativeYield();
    } finally {
      globalThis.scheduler = originalScheduler;
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
