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
