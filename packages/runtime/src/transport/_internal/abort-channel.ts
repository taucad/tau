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
import type { RuntimeProtocol } from '#types/runtime-protocol.types.js';
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
