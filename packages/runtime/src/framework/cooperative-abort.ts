/**
 * Cooperative Abort Mechanism — INTERNAL kernel-side primitive.
 *
 * Provides a SharedArrayBuffer-based abort signal that kernel proxies (e.g. the
 * OC Proxy in replicad) check before every WASM API call. When the abort
 * generation in the SAB no longer matches the generation set at render start,
 * `checkAbort()` throws a {@link RenderAbortedError} to unwind the synchronous
 * WASM call stack.
 *
 * Lifecycle:
 * 1. `setAbortContext(view, generation)` — called by `KernelWorker.executeRender`
 *    before handing control to the kernel.
 * 2. Kernel proxy calls `checkAbort()` on every API call (~1 ns overhead).
 * 3. `clearAbortContext()` — called in the `finally` block of `executeRender`.
 *
 * Not part of the `@taucad/runtime` public surface. Kernel authors must import
 * from `#framework/cooperative-abort.js` only when implementing a custom kernel
 * proxy. End-user `RuntimeClient` consumers never touch these helpers — abort
 * signalling is an internal worker-side concern.
 *
 * @internal
 */

/* oxlint-disable unicorn/prefer-math-trunc, no-bitwise -- cancellation generations use ECMAScript ToUint32 wrap semantics. */

import { RenderAbortedError } from '#framework/runtime-worker-client.js';
import { signalSlot } from '#types/runtime-protocol.types.js';

let abortSignalView: Int32Array | undefined;
let abortGeneration = 0;
let localAbortSignal: AbortSignal | undefined;
let onSharedAbort: ((reason: number) => void) | undefined;

/** Render-owned cooperative abort context. @internal */
export type AbortContext = {
  readonly signal: AbortSignal;
  readonly signalView?: Int32Array;
  readonly generation: number;
  readonly onSharedAbort?: (reason: number) => void;
};

/**
 * Configure the abort context before starting a render cycle.
 * The proxy checks this before every OC call (~1ns overhead per call).
 *
 * @internal
 * @param context - Render-owned signal, generation, and optional shared-memory polling context.
 */
export function setAbortContext(context: AbortContext): void {
  localAbortSignal = context.signal;
  abortSignalView = context.signalView;
  abortGeneration = context.generation >>> 0;
  onSharedAbort = context.onSharedAbort;
}

/**
 * Clear the abort context after a render cycle completes or is aborted.
 * @internal
 */
export function clearAbortContext(): void {
  abortSignalView = undefined;
  abortGeneration = 0;
  localAbortSignal = undefined;
  onSharedAbort = undefined;
}

/**
 * Check whether the current render has been aborted.
 * Throws {@link RenderAbortedError} when the SAB abort generation no longer
 * matches the generation stored by `setAbortContext`.
 * @internal
 */
export function checkAbort(): void {
  localAbortSignal?.throwIfAborted();
  if (abortSignalView && Atomics.load(abortSignalView, signalSlot.abortGeneration) >>> 0 !== abortGeneration) {
    onSharedAbort?.(Atomics.load(abortSignalView, signalSlot.abortReason));
    throw new RenderAbortedError();
  }
}
