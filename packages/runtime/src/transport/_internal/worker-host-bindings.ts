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
  EncodedBinary,
  EncodedGeometry,
  HostInitializeBindings,
  RuntimeInitializeMemoryHandle,
} from '#transport/runtime-transport.types.js';

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

  const publishBytes = (key: string, source: Uint8Array<ArrayBuffer>): EncodedBinary => {
    if (geometryPool?.publish(key, source)) {
      return { value: { delivery: 'pooled', key }, transferables: [], tier: 'pool' };
    }
    const bytes = new Uint8Array(source);
    return { value: { delivery: 'inline', bytes }, transferables: [bytes.buffer], tier: 'transfer' };
  };

  const publishGeometry = (geometry: Geometry): EncodedGeometry => {
    if (geometry.format !== 'gltf') {
      return { value: geometry, transferables: [], tier: 'copy' };
    }
    const encoded = publishBytes(geometry.hash, geometry.content);
    return {
      value: { format: 'gltf', content: encoded.value, hash: geometry.hash },
      transferables: encoded.transferables,
      tier: encoded.tier,
    };
  };

  return {
    geometryDelivery: {
      publish: publishGeometry,
      publishBytes,
      acknowledge: (key) => geometryPool?.acknowledge(key),
      tier: geomTier,
    },
  };
};
