/**
 * Helpers for transfer-tier delivery.
 *
 * Structured-clone transfer detaches the sender's `ArrayBuffer`. Runtime
 * geometry and export bytes are ordinary reusable values, so the transport
 * must transfer only wire-owned copies.
 *
 * @internal
 */

import type { Geometry } from '@taucad/types';
import type { EncodedGeometry } from '#transport/runtime-transport.types.js';
import type { BinaryEncoder } from '#transport/_internal/runtime-worker-dispatcher.js';

const cloneBytes = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

export const encodeGeometryAsOwnedTransfer = (geometry: Geometry): EncodedGeometry => {
  if (geometry.format !== 'gltf') {
    return { value: geometry, transferables: [], tier: 'copy' };
  }

  const bytes = cloneBytes(geometry.content);
  return {
    value: {
      format: 'gltf',
      content: { delivery: 'inline', bytes },
      hash: geometry.hash,
    },
    transferables: [bytes.buffer],
    tier: 'transfer',
  };
};

export const encodeGeometryAsOwnedCopy = (geometry: Geometry): EncodedGeometry => {
  if (geometry.format !== 'gltf') {
    return { value: geometry, transferables: [], tier: 'copy' };
  }

  return {
    value: {
      format: 'gltf',
      content: { delivery: 'inline', bytes: cloneBytes(geometry.content) },
      hash: geometry.hash,
    },
    transferables: [],
    tier: 'copy',
  };
};

/**
 * Copy binary output for transports that cannot transfer ArrayBuffers.
 * @param _key - Publication key, unused by copy delivery.
 * @param source - Binary output owned by the runtime.
 * @returns Inline wire bytes with no transferables.
 */
export const encodeBinaryAsOwnedCopy: BinaryEncoder = (_key, source) => ({
  value: { delivery: 'inline', bytes: cloneBytes(source) },
  transferables: [],
  tier: 'copy',
});
