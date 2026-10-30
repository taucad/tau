/**
 * Golden vectors for the files link contract (`vectors.json`).
 *
 * Computed once with Node's `createHmac`, independently of this library, and
 * checked by the library, the API signer and the Worker's tests alike: a change
 * to the canonical message or the URL format fails all three. The keys are
 * test keys and sign nothing real.
 */

import vectors from '#vectors.json' with { type: 'json' };
import type { FileLinkLocation } from '#path.js';

/** One test key generation. @public */
export type FileLinkVectorKey = Readonly<{ generation: number; kid: string; keyBase64: string }>;

/** One golden link: inputs, the exact message, signature and URL. @public */
export type FileLinkVector = Readonly<{
  name: string;
  kid: string;
  baseUrl: string;
  audience: string;
  location: FileLinkLocation;
  size: number;
  expiresAt: number;
  path: string;
  objectKey: string;
  message: string;
  signature: string;
  url: string;
}>;

/** The golden vectors. @public */
export const fileLinkVectors = vectors as Readonly<{
  keys: readonly FileLinkVectorKey[];
  links: readonly FileLinkVector[];
}>;
