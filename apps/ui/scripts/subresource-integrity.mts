/**
 * Subresource Integrity for a built asset's bytes, shared by the scripts that publish and check them.
 */
import { createHash } from 'node:crypto';

/**
 * The SRI value (`sha384-…`) for `bytes`.
 *
 * @param bytes - The asset's bytes.
 * @returns Its integrity, as a browser checks it.
 */
export const sri = (bytes: Uint8Array<ArrayBuffer>): string =>
  `sha384-${createHash('sha384').update(bytes).digest('base64')}`;
