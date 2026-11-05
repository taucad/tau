/**
 * Per-path accounting of how content bytes cross the filesystem bridge (I2).
 *
 * Invariant I2 allows each byte of authored content to cross a process boundary
 * at most once per consumer, and only as a transfer where the transport can
 * transfer. The bridge itself decides at two seams whether a path's bytes are
 * handed over (the buffer is detached on this side) or copied first:
 *
 * - the client, preparing write arguments: a copy, unless the caller marked the
 *   bytes `consumableBytes`;
 * - the host, answering `readMany` and `readRange`: a transfer of the buffer
 *   the read produced, unless that buffer is shared with something else (a view
 *   onto a larger buffer), when only the view's bytes are copied out.
 *
 * Nothing is recorded unless an observer is open, so production pays one empty
 * set check per crossing. Observers live in the realm that records: a test with
 * both ends in one realm sees both seams.
 */

/**
 * How one path's bytes crossed the bridge while an observer was open.
 *
 * @public
 */
export type FileSystemBridgeCrossings = {
  /** Buffers handed over without a copy. */
  readonly transfers: number;
  /** Buffers copied before they crossed. */
  readonly copies: number;
  /** Content bytes that crossed, either way. */
  readonly bytes: number;
};

/**
 * An open observer of bridge byte crossings.
 *
 * @public
 */
export type FileSystemBridgeCrossingsObserver = {
  /** Crossings per path since the observer opened. */
  snapshot(): ReadonlyMap<string, FileSystemBridgeCrossings>;
  /** Stop recording. Idempotent. */
  stop(): void;
};

type MutableCrossings = { transfers: number; copies: number; bytes: number };

const observers = new Set<Map<string, MutableCrossings>>();

/**
 * Record that one path's bytes crossed the bridge.
 *
 * @param path - The path whose bytes crossed.
 * @param kind - Whether the buffer was handed over or copied first.
 * @param bytes - How many content bytes crossed.
 */
export const recordFileSystemBridgeCrossing = (path: string, kind: 'transfer' | 'copy', bytes: number): void => {
  for (const ledger of observers) {
    const entry = ledger.get(path) ?? { transfers: 0, copies: 0, bytes: 0 };
    if (kind === 'transfer') {
      entry.transfers += 1;
    } else {
      entry.copies += 1;
    }
    entry.bytes += bytes;
    ledger.set(path, entry);
  }
};

/**
 * Count, per path, how content bytes cross the filesystem bridge from now on
 * (I2). Used by tests and the measurement harness; production opens none.
 *
 * @returns The open observer.
 * @public
 */
export const observeFileSystemBridgeCrossings = (): FileSystemBridgeCrossingsObserver => {
  const ledger = new Map<string, MutableCrossings>();
  observers.add(ledger);
  return {
    snapshot: () => new Map([...ledger].map(([path, entry]) => [path, { ...entry }])),
    stop() {
      observers.delete(ledger);
    },
  };
};

/**
 * Hand over a read's bytes when this side owns their whole buffer, otherwise
 * copy just the view out, and record which one happened for `path`.
 *
 * @param path - The path the bytes belong to.
 * @param data - The bytes a read produced.
 * @returns Bytes whose whole buffer may be transferred.
 */
export const ownedForTransfer = (path: string, data: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => {
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    recordFileSystemBridgeCrossing(path, 'transfer', data.byteLength);
    return data;
  }
  recordFileSystemBridgeCrossing(path, 'copy', data.byteLength);
  return new Uint8Array(data);
};
