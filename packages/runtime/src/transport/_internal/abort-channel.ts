/**
 * Cooperative-abort signalling helpers used by every bundled
 * transport. Reservations advance the optional SAB generation and timeout
 * triggers target one admitted render over both the SAB and wire paths.
 *
 * @internal
 */

/* oxlint-disable unicorn/prefer-math-trunc, no-bitwise -- cancellation generations require ECMAScript ToUint32 wrap semantics. */

import type { Channel } from '@taucad/rpc';
import { signalSlot, abortReason } from '#types/runtime-protocol.types.js';
import {
  documentAbortGeneration,
  documentAbortReason,
  documentAbortSequence,
  documentAbortState,
  documentAbortView,
} from '#framework/document-abort-state.js';
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import type {
  RuntimeTransportPreviewReservation,
  RuntimeTransportRenderTarget,
} from '#transport/runtime-transport.types.js';

/**
 * Reserve the next preview admission: advance the SAB abort generation
 * (marking every in-flight render superseded) and return the captured
 * generation. Wire-only transports have no SAB and reserve nothing.
 */
export const reservePreview = (signalBuffer: SharedArrayBuffer | undefined): RuntimeTransportPreviewReservation => {
  if (!signalBuffer) {
    return {};
  }
  const view = new Int32Array(signalBuffer);
  Atomics.store(view, signalSlot.abortReason, abortReason.superseded);
  const abortGeneration = (Atomics.add(view, signalSlot.abortGeneration, 1) + 1) >>> 0;
  Atomics.notify(view, signalSlot.abortGeneration);
  return { abortGeneration };
};

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

/** Signal a timeout for one render without allowing a stale timer to advance its successor. */
export const triggerRenderTimeout = (
  channel: Channel<RuntimeProtocol>,
  signalBuffer: SharedArrayBuffer | undefined,
  target: RuntimeTransportRenderTarget,
): void => {
  if (signalBuffer) {
    const view = new Int32Array(signalBuffer);
    const currentGeneration = Atomics.load(view, signalSlot.abortGeneration) >>> 0;
    if (target.abortGeneration === currentGeneration) {
      Atomics.store(view, signalSlot.abortReason, abortReason.timeout);
      Atomics.add(view, signalSlot.abortGeneration, 1);
      Atomics.notify(view, signalSlot.abortGeneration);
    }
  }
  channel.notify('abort', { renderId: target.renderId, reason: abortReason.timeout });
};

/** Signal a local document-operation timeout to the current worker. */
export const triggerDocumentTimeout = (
  channel: Channel<RuntimeDocumentProtocol>,
  signalBuffer: SharedArrayBuffer | undefined,
  target: RuntimeTransportRenderTarget,
): void => {
  if (signalBuffer) {
    const view = new Int32Array(signalBuffer);
    const currentGeneration = Atomics.load(view, signalSlot.abortGeneration) >>> 0;
    if (target.abortGeneration === currentGeneration) {
      Atomics.store(view, signalSlot.abortReason, abortReason.timeout);
      Atomics.add(view, signalSlot.abortGeneration, 1);
      Atomics.notify(view, signalSlot.abortGeneration);
    }
  }
  channel.notify('abort', { operationId: target.renderId, reason: abortReason.timeout });
};
