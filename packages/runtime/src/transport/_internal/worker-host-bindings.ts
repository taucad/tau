/**
 * Worker-side host bindings factory.
 *
 * Builds the SAB-pool-aware {@link HostInitializeBindings} from the
 * inbound `memoryHandle` so the worker bundle's dispatcher can encode
 * geometry payloads via the highest tier the wire allows
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
  EncodedGeometry,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
} from '#transport/runtime-transport.types.js';
import { encodeGeometryAsOwnedTransfer } from '#transport/_internal/owned-transfer-bytes.js';

/**
 * Construct {@link HostInitializeBindings} from an inbound memory
 * handle. Geometry delivery defaults to `transfer` tier when
 * no SAB pool is supplied; when SABs are present the encoders write
 * payloads into the pool and emit `delivery: 'pooled'` descriptors
 * referencing the entry's stable hash.
 */
export const createWorkerHostBindings = (handle: RuntimeInitializeMemoryHandle): HostInitializeBindings => {
  let geometryPool: SharedPool | undefined;
  if (handle.geometryPoolBuffer) {
    try {
      geometryPool = new SharedPool(handle.geometryPoolBuffer, {});
    } catch {
      geometryPool = undefined;
    }
  }
  const geomTier: 'pool' | 'transfer' = geometryPool ? 'pool' : 'transfer';

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

  return {
    geometryDelivery: { publish: publishGeometry, tier: geomTier },
  };
};
