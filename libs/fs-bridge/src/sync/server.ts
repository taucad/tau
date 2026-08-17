import { syncChannelError, syncSlotIndex, syncSlotState } from '#sync/protocol.js';

/**
 * Inputs used to complete one bounded synchronous request.
 *
 * @public
 */
export type CompleteSyncResponseOptions = Readonly<{
  slot: Int32Array;
  arena: Uint8Array<ArrayBuffer>;
  requestId: number;
  errorCode?: number;
  payload?: Uint8Array<ArrayBuffer>;
  payloadLength?: number;
}>;

/**
 * Complete only the still-pending matching request; stale or late replies are discarded.
 *
 * @param options - Shared slot, arena, identity, and response payload.
 * @returns Whether the matching pending request was completed.
 * @public
 */
export const completeSyncResponse = ({
  slot,
  arena,
  requestId,
  errorCode = syncChannelError.ok,
  payload,
  payloadLength = payload?.byteLength ?? 0,
}: CompleteSyncResponseOptions): boolean => {
  if (
    Atomics.compareExchange(slot, syncSlotIndex.state, syncSlotState.pending, syncSlotState.claimed) !==
    syncSlotState.pending
  ) {
    return false;
  }
  if (Atomics.load(slot, syncSlotIndex.requestId) !== requestId) {
    Atomics.store(slot, syncSlotIndex.state, syncSlotState.pending);
    return false;
  }
  if (payloadLength > arena.byteLength) {
    Atomics.store(slot, syncSlotIndex.errorCode, syncChannelError.tooLarge);
    Atomics.store(slot, syncSlotIndex.payloadLength, 0);
  } else {
    if (payload) {
      arena.set(payload);
    }
    Atomics.store(slot, syncSlotIndex.errorCode, errorCode);
    Atomics.store(slot, syncSlotIndex.payloadLength, payloadLength);
  }
  Atomics.store(slot, syncSlotIndex.state, syncSlotState.ready);
  Atomics.notify(slot, syncSlotIndex.state, 1);
  return true;
};
