/**
 * Helpers for transfer-tier delivery.
 *
 * Structured-clone transfer detaches the sender's `ArrayBuffer`. Runtime
 * geometry and export bytes are ordinary reusable values, so the transport
 * must transfer only wire-owned copies.
 *
 * @internal
 */

import type { BinaryEncoder } from '#transport/_internal/runtime-channel-bindings.js';

const cloneBytes = (bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

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
