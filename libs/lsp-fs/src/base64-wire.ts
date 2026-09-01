import { base64ToUint8Array, uint8ArrayToBase64 } from 'uint8array-extras';

/**
 * Base64 encode/decode for `fs/content` wire payloads.
 *
 * Implemented with `uint8array-extras` (workspace-endorsed replacement for `btoa`/`atob` /
 * deprecated globals per ESLint `no-restricted-globals`). When runtimes ship stable
 * `Uint8Array` Stage 4 base64 helpers universally, this module can delegate to them first.
 *
 * @public
 */
export function bytesToBase64Wire(bytes: Uint8Array<ArrayBuffer>): string {
  return uint8ArrayToBase64(bytes);
}

/** @public */
export function base64WireToBytes(dataBase64: string): Uint8Array<ArrayBuffer> {
  return base64ToUint8Array(dataBase64);
}
