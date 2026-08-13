/**
 * In-memory evidence store for tests.
 *
 * A real store from the core's point of view — live engine digest,
 * content-addressed key digests — but backed by a `Map` the test can inspect.
 * Differential suites compare the raw entries, so a proven zero and a computed
 * zero must be indistinguishable byte-for-byte.
 *
 * @module
 */

import { createHash } from 'node:crypto';
import type { GeoSpecEvidenceStore } from '#cache/evidence-cache.js';

/**
 * An inspectable in-memory store.
 *
 * @public
 */
export type MemoryEvidenceStore = GeoSpecEvidenceStore & {
  readonly entries: Map<string, Uint8Array<ArrayBuffer>>;
  /** The distinct families this store holds, sorted — a run's write footprint. */
  families(): string[];
};

const sha256 = (input: string | Uint8Array<ArrayBuffer>): string => createHash('sha256').update(input).digest('hex');

/**
 * Build an in-memory evidence store.
 *
 * @param engineDigest - Digest the store reports; `undefined` disables caching.
 * @returns The store with its backing map exposed.
 * @public
 */
export const createMemoryEvidenceStore = (engineDigest: string | undefined = 'test-engine-v1'): MemoryEvidenceStore => {
  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  return {
    entries,
    families: () => [...new Set([...entries.keys()].map((key) => key.slice(0, key.indexOf(':'))))].sort(),
    get: (family, keyDigest) => entries.get(`${family}:${keyDigest}`),
    put: (family, keyDigest, value) => {
      entries.set(`${family}:${keyDigest}`, value);
    },
    engineDigest: () => engineDigest,
    hashBytes: (bytes) => sha256(bytes),
    digestKey: (canonicalKey) => sha256(canonicalKey),
  };
};
