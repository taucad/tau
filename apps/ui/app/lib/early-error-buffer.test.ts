// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

/** A fresh page: the buffer starts as its module evaluates. */
const load = async () => {
  vi.resetModules();
  return import('#lib/early-error-buffer.js');
};

const throwAtWindow = (error: unknown): void => {
  globalThis.dispatchEvent(new ErrorEvent('error', { error }));
};

describe('early error buffer', () => {
  it('should keep what reaches window before reporting starts, oldest first, at most the limit', async () => {
    const { drainEarlyErrors, earlyErrorLimit } = await load();
    const errors = Array.from({ length: earlyErrorLimit + 5 }, (_, index) => new Error(`early ${String(index)}`));
    for (const error of errors) {
      throwAtWindow(error);
    }

    expect(drainEarlyErrors()).toStrictEqual(errors.slice(0, earlyErrorLimit));
  });

  it('should keep an unhandled rejection by its reason, and an error event without a value by its message', async () => {
    const { drainEarlyErrors } = await load();
    const rejection = new Event('unhandledrejection') as PromiseRejectionEvent;
    Object.defineProperty(rejection, 'reason', { value: 'rejected' });
    globalThis.dispatchEvent(rejection);
    globalThis.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }));

    expect(drainEarlyErrors()).toStrictEqual(['rejected', 'Script error.']);
  });

  it('should remove its listeners once drained, and hand over nothing twice', async () => {
    const { drainEarlyErrors } = await load();
    const removed = vi.spyOn(globalThis, 'removeEventListener');
    throwAtWindow(new Error('early'));

    expect(drainEarlyErrors()).toHaveLength(1);
    expect(removed.mock.calls.map(([type]) => type)).toStrictEqual(['error', 'unhandledrejection']);
    // Handled here, so the test environment does not report it as uncaught.
    globalThis.addEventListener(
      'error',
      (event) => {
        event.preventDefault();
      },
      { once: true },
    );
    throwAtWindow(new Error('late'));
    expect(drainEarlyErrors()).toStrictEqual([]);
    removed.mockRestore();
  });
});
