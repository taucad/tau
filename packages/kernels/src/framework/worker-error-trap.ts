/**
 * Unhandled Rejection Trap for Kernel Workers
 *
 * Catches unhandled promise rejections that occur during async operations
 * in the worker thread. Some third-party libraries (e.g. Emscripten's pthread
 * infrastructure) throw errors inside fire-and-forget promises that never
 * propagate to the caller, causing awaited operations to hang forever.
 *
 * This module provides `raceWithErrorTrap()` — a utility that races a promise
 * against a global unhandled-rejection listener so such errors surface
 * immediately instead of causing silent hangs.
 *
 * Works isomorphically across Node.js and browser/worker environments.
 */

import { isNode } from '#framework/environment.js';

/**
 * The return type of a trapped promise. Contains a cleanup function that
 * MUST be called (typically in a `finally` block) to remove the listener.
 */
type ErrorTrap = {
  promise: Promise<never>;
  cleanup: () => void;
};

/**
 * Race a promise against an unhandled rejection trap.
 *
 * Installs a temporary `unhandledrejection` (browser/worker) or
 * `unhandledRejection` (Node.js) listener for the duration of the
 * operation. If an unhandled rejection fires while the operation is
 * in-flight, the returned promise rejects with that error.
 *
 * @param operation - The promise to race against unhandled rejections
 * @returns The resolved value of the operation
 * @throws The original error from the operation, or an Error wrapping
 *         an unhandled rejection that fired during the operation
 *
 * @example
 * ```typescript
 * const result = await raceWithErrorTrap(
 *   someEmscriptenModule({ locateFile: ... })
 * );
 * ```
 */
export async function raceWithErrorTrap<T>(operation: Promise<T>): Promise<T> {
  const { promise: trapPromise, cleanup } = createErrorTrap();
  try {
    return await Promise.race([operation, trapPromise]);
  } finally {
    cleanup();
  }
}

/**
 * Create a low-level error trap. Prefer `raceWithErrorTrap()` for most
 * use cases. This is exposed for the dispatcher which needs to wrap
 * more complex control flows (e.g. streaming render progress callbacks).
 *
 * The caller MUST call `cleanup()` when the guarded operation completes.
 */
export function createErrorTrap(): ErrorTrap {
  let rejectTrap: ((error: Error) => void) | undefined;

  const promise = new Promise<never>((_resolve, reject) => {
    rejectTrap = reject;
  });

  const onRejection = (reason: unknown): void => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    rejectTrap?.(new Error(`Unhandled rejection in worker: ${error.message}`));
  };

  if (isNode()) {
    return createNodeTrap(promise, onRejection);
  }

  return createBrowserTrap(promise, onRejection);
}

function createBrowserTrap(promise: Promise<never>, onRejection: (reason: unknown) => void): ErrorTrap {
  const handler = (event: PromiseRejectionEvent): void => {
    event.preventDefault();
    onRejection(event.reason);
  };

  globalThis.addEventListener('unhandledrejection', handler);

  return {
    promise,
    cleanup() {
      globalThis.removeEventListener('unhandledrejection', handler);
    },
  };
}

function createNodeTrap(promise: Promise<never>, onRejection: (reason: unknown) => void): ErrorTrap {
  const handler = (reason: unknown): void => {
    onRejection(reason);
  };

  // eslint-disable-next-line n/prefer-global/process -- guarded by isNode()
  process.on('unhandledRejection', handler);

  return {
    promise,
    cleanup() {
      // eslint-disable-next-line n/prefer-global/process -- guarded by isNode()
      process.off('unhandledRejection', handler);
    },
  };
}
