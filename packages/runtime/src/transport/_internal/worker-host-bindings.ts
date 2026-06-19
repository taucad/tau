/**
 * Worker-side host bindings factory.
 *
 * Builds the SAB-pool-aware {@link HostInitializeBindings} from the
 * inbound `memoryHandle` so the worker bundle's dispatcher can encode
 * geometry / file payloads via the highest tier the wire allows
 * (`pool` > `transfer` > `copy`). Used uniformly by every worker-side
 * transport host (web-worker, node-worker): the
 * encoder logic is the same regardless of which wire delivered the
 * SABs.
 *
 * @internal
 */

import type { Geometry } from '@taucad/types';
import { SharedPool } from '@taucad/memory';
import type {
  EncodedFileBytes,
  EncodedGeometry,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
} from '#transport/runtime-transport.types.js';
import { adoptHostAbort } from '#transport/_internal/abort-channel.js';
import { encodeFileAsOwnedTransfer, encodeGeometryAsOwnedTransfer } from '#transport/_internal/owned-transfer-bytes.js';

/**
 * Construct {@link HostInitializeBindings} from an inbound memory
 * handle. Geometry / file deliveries default to `transfer` tier when
 * no SAB pool is supplied; when SABs are present the encoders write
 * payloads into the pool and emit `delivery: 'pooled'` descriptors
 * referencing the entry's stable hash.
 */
export const createWorkerHostBindings = (handle: RuntimeInitializeMemoryHandle): HostInitializeBindings => {
  const abortSurface = adoptHostAbort(handle.signalBuffer);

  let geometryPool: SharedPool | undefined;
  if (handle.geometryPoolBuffer) {
    try {
      geometryPool = new SharedPool(handle.geometryPoolBuffer, {});
    } catch {
      geometryPool = undefined;
    }
  }
  let filePool: SharedPool | undefined;
  if (handle.filePoolBuffer) {
    try {
      filePool = new SharedPool(handle.filePoolBuffer, {});
    } catch {
      filePool = undefined;
    }
  }

  const geomTier: 'pool' | 'transfer' = geometryPool ? 'pool' : 'transfer';
  const fileTier: 'pool' | 'transfer' = filePool ? 'pool' : 'transfer';

  const publishGeometry = (geometry: Geometry): EncodedGeometry => {
    if (geometry.format !== 'gltf') {
      return { value: geometry, transferables: [], tier: 'copy' };
    }
    if (geometryPool) {
      if (!geometryPool.has(geometry.hash)) {
        geometryPool.store(geometry.hash, geometry.content);
      }
      if (geometryPool.has(geometry.hash)) {
        return {
          value: {
            format: 'gltf',
            content: { delivery: 'pooled', key: geometry.hash },
            hash: geometry.hash,
          },
          transferables: [],
          tier: 'pool',
        };
      }
    }
    return encodeGeometryAsOwnedTransfer(geometry);
  };

  const publishFile = (file: Uint8Array<ArrayBuffer>): EncodedFileBytes => {
    if (filePool) {
      const hash = `inline-${file.byteLength}`;
      if (!filePool.has(hash)) {
        filePool.store(hash, file);
      }
      if (filePool.has(hash)) {
        return { value: { delivery: 'pooled', key: hash }, transferables: [], tier: 'pool' };
      }
    }
    return encodeFileAsOwnedTransfer(file);
  };

  return {
    abort: { signal: abortSurface.controller.signal, strategy: abortSurface.strategy },
    geometryDelivery: { publish: publishGeometry, tier: geomTier },
    fileDelivery: { publish: publishFile, tier: fileTier },
  };
};
