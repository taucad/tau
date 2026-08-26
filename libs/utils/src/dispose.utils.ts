/**
 * Execute a cleanup function, swallowing any errors to ensure
 * subsequent cleanup steps in a disposal chain are not blocked.
 *
 * Use in teardown paths where multiple resources must be released
 * and one failure must not prevent the rest from being cleaned up.
 *
 * @public
 * @param cleanupFunction - Cleanup function to execute (no-ops if undefined)
 *
 * @example <caption>Safely terminating a worker</caption>
 * ```typescript
 * import { safeDispose } from '@taucad/utils/dispose';
 *
 * const worker = new Worker('/worker.js');
 * safeDispose(() => worker.terminate());
 * ```
 */
export function safeDispose(cleanupFunction: (() => void) | undefined): void {
  try {
    cleanupFunction?.();
  } catch (error) {
    console.error('Failed to dispose:', error);
    // Intentionally swallowed — disposal errors must not break the cleanup chain.
  }
}
