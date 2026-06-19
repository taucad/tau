/**
 * Cross-environment async polyfills for SharedArrayBuffer monitoring
 * and cooperative yielding.
 *
 * These utilities abstract over APIs that are widely available in modern
 * browsers and Node.js but may be missing in older environments or test
 * runners. Each function uses the native API when present and falls back
 * to a polling/timeout-based approach.
 */

import { waitAsyncPollInterval } from '#framework/runtime-framework.constants.js';

type SchedulerGlobal = typeof globalThis & {
  scheduler?: {
    yield?: () => Promise<void> | void;
  };
};

/**
 * Wait for a slot in a SharedArrayBuffer to change from an expected value.
 *
 * Uses `Atomics.waitAsync` when available (zero-cost, event-driven) and
 * falls back to polling via `setTimeout` at ~60 fps.
 *
 * @param view - Int32Array view over a SharedArrayBuffer
 * @param slot - index of the slot to watch
 * @param expectedValue - the value to compare against; resolves when the slot differs
 */
export async function waitForSlotChange(view: Int32Array, slot: number, expectedValue: number): Promise<void> {
  if (typeof Atomics.waitAsync === 'function') {
    const result = Atomics.waitAsync(view, slot, expectedValue);
    if (result.async) {
      await result.value;
    }
  } else {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, waitAsyncPollInterval);
    });
  }
}

/**
 * Cooperatively yield the current execution context to allow pending
 * microtasks, I/O callbacks, and abort checks to run.
 *
 * Uses `scheduler.yield()` when available (priority-preserving) and
 * falls back to `setTimeout(0)` which defers to the next macrotask.
 */
export async function cooperativeYield(): Promise<void> {
  const { scheduler } = globalThis as Pick<SchedulerGlobal, 'scheduler'>;
  const schedulerYield = scheduler?.yield;
  if (typeof schedulerYield === 'function') {
    await schedulerYield.call(scheduler);
  } else {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
