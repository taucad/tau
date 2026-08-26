import { syncChannelError, syncSlotIndex, syncSlotInt32Length, syncSlotState } from '#sync/protocol.js';

/** Result metadata for one synchronous bounded request. @public */
export type SyncRequestResult = Readonly<{
  requestId: number;
  errorCode: number;
  payloadLength: number;
}>;

/** Single-slot synchronous request client. @public */
export type SyncRequestClient = Readonly<{
  perform(createMessage: (requestId: number) => unknown): SyncRequestResult;
  dispose(): void;
}>;

/**
 * Create a bounded synchronous request client.
 * @param options - Shared slot, destination port, and optional timeout.
 * @returns A disposable single-slot request client.
 * @public
 */
export const createSyncRequestClient = (options: {
  port: Pick<MessagePort, 'postMessage'>;
  slotSab: SharedArrayBuffer;
  /** Milliseconds. */
  requestTimeout?: number;
}): SyncRequestClient => {
  const slot = new Int32Array(options.slotSab, 0, syncSlotInt32Length);
  /** Milliseconds. */
  const requestTimeout = options.requestTimeout ?? 30_000;
  let requestId = 0;
  let disposed = false;

  return {
    perform: (createMessage) => {
      if (disposed) {
        throw new Error('sync-channel: client disposed');
      }
      if (Atomics.load(slot, syncSlotIndex.state) !== syncSlotState.idle) {
        throw new Error('sync-channel: slot busy');
      }
      const currentRequestId = ++requestId;
      Atomics.store(slot, syncSlotIndex.requestId, currentRequestId);
      Atomics.store(slot, syncSlotIndex.errorCode, syncChannelError.ok);
      Atomics.store(slot, syncSlotIndex.payloadLength, 0);
      Atomics.store(slot, syncSlotIndex.state, syncSlotState.pending);
      options.port.postMessage(createMessage(currentRequestId));

      const waitResult = Atomics.wait(slot, syncSlotIndex.state, syncSlotState.pending, requestTimeout);
      if (waitResult === 'timed-out') {
        const previous = Atomics.compareExchange(slot, syncSlotIndex.state, syncSlotState.pending, syncSlotState.idle);
        if (previous === syncSlotState.pending) {
          throw new Error(`sync-channel: request ${currentRequestId} timed out`);
        }
      }
      while (Atomics.load(slot, syncSlotIndex.state) === syncSlotState.claimed) {
        Atomics.wait(slot, syncSlotIndex.state, syncSlotState.claimed);
      }
      if (Atomics.load(slot, syncSlotIndex.state) !== syncSlotState.ready) {
        Atomics.store(slot, syncSlotIndex.state, syncSlotState.idle);
        throw new Error('sync-channel: request completed without a response');
      }
      if (Atomics.load(slot, syncSlotIndex.requestId) !== currentRequestId) {
        Atomics.store(slot, syncSlotIndex.state, syncSlotState.idle);
        throw new Error('sync-channel: stale request completion');
      }
      const result = {
        requestId: currentRequestId,
        errorCode: Atomics.load(slot, syncSlotIndex.errorCode),
        payloadLength: Atomics.load(slot, syncSlotIndex.payloadLength),
      };
      Atomics.store(slot, syncSlotIndex.state, syncSlotState.idle);
      return result;
    },
    dispose: () => {
      disposed = true;
      if (
        Atomics.compareExchange(slot, syncSlotIndex.state, syncSlotState.pending, syncSlotState.claimed) ===
        syncSlotState.pending
      ) {
        Atomics.store(slot, syncSlotIndex.errorCode, syncChannelError.aborted);
        Atomics.store(slot, syncSlotIndex.payloadLength, 0);
        Atomics.store(slot, syncSlotIndex.state, syncSlotState.ready);
        Atomics.notify(slot, syncSlotIndex.state, 1);
      }
    },
  };
};
