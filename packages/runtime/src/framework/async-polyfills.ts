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
  setImmediate?: (callback: () => void) => unknown;
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
 * Run `callback` on the host's cheapest macrotask, never on a timer.
 *
 * A zero-delay timer is the expensive way to reach the next task: Node clamps
 * `setTimeout(…, 0)` to at least a millisecond, which made the render lane's
 * single cooperative yield the largest item in the framework's per-render cost.
 * `setImmediate` (Node's check phase) and `MessageChannel` (a posted task in a
 * browser worker) reach the same point for ~1/15th of the cost and yield to
 * pending I/O and callbacks exactly as the timer did.
 *
 * @param callback - work to run once the current task completes
 */
export function scheduleMacrotask(callback: () => void): void {
  const { setImmediate: scheduleImmediate } = globalThis as Pick<SchedulerGlobal, 'setImmediate'>;
  if (typeof scheduleImmediate === 'function') {
    scheduleImmediate(callback);
    return;
  }
  if (typeof MessageChannel === 'function') {
    const channel = new MessageChannel();
    channel.port1.addEventListener(
      'message',
      () => {
        channel.port1.close();
        callback();
      },
      { once: true },
    );
    channel.port1.start();
    channel.port2.postMessage(undefined);
    return;
  }
  setTimeout(callback, 0);
}

/**
 * Cooperatively yield the current execution context to allow pending
 * microtasks, I/O callbacks, and abort checks to run.
 *
 * Uses `scheduler.yield()` when available (priority-preserving) and otherwise
 * defers to {@link scheduleMacrotask}.
 */
export async function cooperativeYield(): Promise<void> {
  const { scheduler } = globalThis as Pick<SchedulerGlobal, 'scheduler'>;
  const schedulerYield = scheduler?.yield;
  if (typeof schedulerYield === 'function') {
    await schedulerYield.call(scheduler);
    return;
  }
  await new Promise<void>((resolve) => {
    scheduleMacrotask(resolve);
  });
}
