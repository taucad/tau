/**
 * Cooperative-abort signalling helpers used by every bundled
 * transport. The native document operation publishes an exact shared token;
 * client cancellation can signal only that token.
 *
 * @internal
 */

/* oxlint-disable unicorn/prefer-math-trunc, no-bitwise -- cancellation generations require ECMAScript ToUint32 wrap semantics. */

import type { abortReason } from '#types/runtime-wire.types.js';
import {
  documentAbortGeneration,
  documentAbortReason,
  documentAbortSequence,
  documentAbortState,
  documentAbortView,
} from '#framework/document-abort-state.js';

/** Abort only the native document operation whose generation is still current. */
// oxlint-disable-next-line max-params -- the shared buffer and exact operation token, generation and reason form one CAS.
export const signalDocumentAbort = (
  signalBuffer: SharedArrayBuffer | undefined,
  evaluationId: string,
  expectedGeneration: number | undefined,
  reason: (typeof abortReason)['superseded' | 'timeout'],
): boolean => {
  if (!signalBuffer) {
    return false;
  }
  const view = documentAbortView(signalBuffer);
  if (!view) {
    return false;
  }
  const sequence = Number(evaluationId);
  if (!Number.isSafeInteger(sequence) || sequence <= 0 || sequence > 4_294_967_295) {
    return false;
  }
  const current = Atomics.load(view, 0);
  const generation = documentAbortGeneration(current);
  if (expectedGeneration !== undefined && expectedGeneration !== generation) {
    return false;
  }
  if (documentAbortSequence(current) !== sequence) {
    return false;
  }
  if (documentAbortReason(current) !== 0) {
    return false;
  }
  // One 64-bit CAS publishes ownership and reason together. A native check
  // cannot observe a changed generation with the previous operation's reason.
  const aborted = documentAbortState(sequence, generation, reason);
  return Atomics.compareExchange(view, 0, current, aborted) === current;
};
