import { createHash } from 'node:crypto';
import type { GeoSpecEvidenceStore } from '#cache/evidence-cache.js';

/**
 * In-memory evidence store for cache gates: a live `engineDigest` (so the
 * cache installs), content-addressed digests, a Map backing get/put, plus
 * direct entry access so tests can prove read-through (replace an entry and
 * observe the consumer see it) and enumerate written families.
 *
 * @internal
 */
export type MemoryEvidenceStore = GeoSpecEvidenceStore & {
  entries: Map<string, Uint8Array<ArrayBuffer>>;
  families(): string[];
};

/**
 * Create a fresh in-memory evidence store.
 *
 * @internal
 */
export const createMemoryEvidenceStore = (): MemoryEvidenceStore => {
  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  const sha = (input: string | Uint8Array<ArrayBuffer>): string =>
    createHash('sha256')
      .update(typeof input === 'string' ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength))
      .digest('hex');
  return {
    entries,
    get: (family, keyDigest) => entries.get(`${family}:${keyDigest}`),
    put: (family, keyDigest, value) => {
      entries.set(`${family}:${keyDigest}`, value);
    },
    engineDigest: () => 'test-engine-v1',
    hashBytes: (bytes) => sha(bytes),
    digestKey: (canonicalKey) => sha(canonicalKey),
    families: () => [...new Set([...entries.keys()].map((key) => key.split(':')[0]!))],
  };
};
