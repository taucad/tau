/**
 * Allocation helpers for the SAB-backed signal + geometry-pool
 * buffers used by every bundled transport. Centralised
 * so the in-process / web-worker / node-worker / electron transports
 * share one allocation strategy and one degradation path when
 * `SharedArrayBuffer` is unavailable (no cross-origin isolation).
 *
 * Returned record may have `signalBuffer` / `geometryPool` set to
 * `undefined`; consumers degrade to copy-tier
 * delivery when a slot is missing.
 *
 * @internal
 */

import { SharedPool } from '@taucad/memory';
import { signalBufferByteLength, signalBufferMaxByteLength } from '#framework/runtime-framework.constants.js';

/** */
export type AllocatedPools = {
  readonly signalBuffer: SharedArrayBuffer | undefined;
  readonly geometryPoolBuffer: SharedArrayBuffer | undefined;
  readonly geometryPool: SharedPool | undefined;
};

/** */
export type AllocatePoolsOptions = {
  readonly geometry?: { readonly bytes: number; readonly maxEntries?: number; readonly maxEntryBytes?: number };
};

const tryAllocateSab = (bytes: number, maxByteLength?: number): SharedArrayBuffer | undefined => {
  try {
    return maxByteLength === undefined ? new SharedArrayBuffer(bytes) : new SharedArrayBuffer(bytes, { maxByteLength });
  } catch {
    return undefined;
  }
};

export const allocatePools = (options: AllocatePoolsOptions): AllocatedPools => {
  const signalBuffer = tryAllocateSab(signalBufferByteLength, signalBufferMaxByteLength);

  let geometryPoolBuffer: SharedArrayBuffer | undefined;
  let geometryPool: SharedPool | undefined;
  if (options.geometry) {
    geometryPoolBuffer = tryAllocateSab(options.geometry.bytes);
    if (geometryPoolBuffer) {
      try {
        geometryPool = new SharedPool(geometryPoolBuffer, {
          maxEntries: options.geometry.maxEntries,
          maxEntryBytes: options.geometry.maxEntryBytes,
        });
      } catch {
        // Buffer too small for the requested arena layout — degrade
        // to copy-tier delivery rather than failing the transport.
        geometryPoolBuffer = undefined;
        geometryPool = undefined;
      }
    }
  }

  return {
    signalBuffer,
    geometryPoolBuffer,
    geometryPool,
  };
};
