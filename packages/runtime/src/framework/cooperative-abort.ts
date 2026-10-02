/**
 * Cooperative Abort Mechanism — INTERNAL kernel-side primitive.
 *
 * Kernel proxies check the operation AbortSignal and the document's atomic
 * shared state before each native API call. A changed state throws
 * {@link RenderAbortedError} to unwind synchronous native work.
 *
 * Lifecycle:
 * 1. `setAbortContext(context)` — called before document evaluation, view,
 *    or export native work.
 * 2. Kernel proxy calls `checkAbort()` on every API call (~1 ns overhead).
 * 3. `clearAbortContext()` — called in the operation's `finally` block.
 *
 * Not part of the `@taucad/runtime` public surface. Kernel authors must import
 * from `#framework/cooperative-abort.js` only when implementing a custom kernel
 * proxy. End-user `RuntimeClient` consumers never touch these helpers — abort
 * signalling is an internal worker-side concern.
 *
 * @internal
 */

import { RenderAbortedError } from '#framework/runtime-operation-errors.js';
import { documentAbortReason } from '#framework/document-abort-state.js';

let localAbortSignal: AbortSignal | undefined;
let onSharedAbort: ((reason: number) => void) | undefined;
let documentSignalView: BigInt64Array | undefined;
let documentSignalState: bigint | undefined;

/** Document-operation cooperative abort context. @internal @public */
export type AbortContext = {
  readonly signal: AbortSignal;
  readonly onSharedAbort?: (reason: number) => void;
  readonly documentSignalView?: BigInt64Array;
  readonly documentSignalState?: bigint;
};

/**
 * Configure the abort context before native work.
 * The proxy checks this before every OC call (~1ns overhead per call).
 *
 * @internal
 * @public
 * @param context - Operation signal and optional document shared-memory state.
 */
export function setAbortContext(context: AbortContext): void {
  localAbortSignal = context.signal;
  onSharedAbort = context.onSharedAbort;
  documentSignalView = context.documentSignalView;
  documentSignalState = context.documentSignalState;
}

/**
 * Clear the abort context after an operation completes or is aborted.
 * @internal
 * @public
 */
export function clearAbortContext(): void {
  localAbortSignal = undefined;
  onSharedAbort = undefined;
  documentSignalView = undefined;
  documentSignalState = undefined;
}

/**
 * Check whether the current native operation has been aborted.
 * Throws {@link RenderAbortedError} when the document's atomic state changes.
 * @internal
 * @public
 */
export function checkAbort(): void {
  localAbortSignal?.throwIfAborted();
  if (documentSignalView && documentSignalState !== undefined) {
    const current = Atomics.load(documentSignalView, 0);
    if (current !== documentSignalState) {
      onSharedAbort?.(documentAbortReason(current));
      throw new RenderAbortedError();
    }
  }
}
