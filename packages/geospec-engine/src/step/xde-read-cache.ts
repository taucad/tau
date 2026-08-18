/**
 * Persistence for the eager AP242 read.
 *
 * The read is the single evidence substrate of a STEP subject, and it is by far
 * the most expensive thing a cold load does. Its cache key is the read's
 * identity — content hash, reader options, streaming strategy — because any of
 * those could change the transferred structure (D-9: reader options are part of
 * the read identity, never an afterthought).
 *
 * The content hash is taken over **header-normalized** text: Part 21's
 * `FILE_NAME` timestamp is zeroed, so re-exporting an unchanged model does not
 * rotate the key. It is deliberately a different value from
 * `provenance.contentHash`, which stays the hash of the raw bytes the caller
 * actually supplied.
 *
 * The payload carries the reader's own `resultJson` and the triangle soup as
 * binary sections rather than JSON: a multi-hundred-MB soup must never
 * round-trip a string.
 *
 * @module
 */

import { sha256String } from '@taucad/runtime/kernel';
import { decodeSections, encodeSections, float32ToSection, sectionToFloat32 } from '#cache/section-codec.js';
import { readEvidenceBytes, writeEvidenceBytes } from '#cache/evidence-cache.js';

/** Exactly two sections: the reader payload, then the mesh positions. */
const resultJsonSection = 0;
const positionsSection = 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Zero the Part 21 `FILE_NAME` timestamp so a re-export of unchanged geometry
 * keeps its cache key.
 *
 * @param text - STEP part 21 text.
 * @returns The text with the timestamp argument blanked.
 * @public
 */
export const normalizeStepHeader = (text: string): string =>
  text.replace(/(FILE_NAME\s*\(\s*'(?:[^']|'')*'\s*,\s*)'(?:[^']|'')*'/iu, "$1''");

/**
 * The identity of one AP242 read.
 *
 * @public
 */
export type XdeReadCacheKey = {
  contentHash: string;
  readerOptionsJson: string;
  strategy: 'native-stream' | 'filesystem';
};

/**
 * Build the read's cache key.
 *
 * @param options - Source text, reader options, and strategy.
 * @returns The key.
 * @public
 */
export const xdeReadCacheKey = async (options: {
  text: string;
  readerOptionsJson: string;
  strategy: 'native-stream' | 'filesystem';
}): Promise<XdeReadCacheKey> => ({
  contentHash: `sha256:${await sha256String(normalizeStepHeader(options.text))}`,
  readerOptionsJson: options.readerOptionsJson,
  strategy: options.strategy,
});

/**
 * A persisted AP242 read.
 *
 * @public
 */
export type CachedXdeRead = {
  /** The reader's own result JSON, byte-identical to the native call's. */
  resultJson: string;
  /** Mesh positions, or `undefined` when the read produced no soup. */
  positions?: Float32Array<ArrayBuffer>;
  /** Triangle count matching {@link CachedXdeRead.positions}. */
  triangleCount: number;
};

/**
 * Read a persisted AP242 read.
 *
 * @param key - The read identity.
 * @returns The cached read, or `undefined` on a miss or an unreadable entry.
 * @public
 */
export const readCachedXdeRead = (key: XdeReadCacheKey): CachedXdeRead | undefined => {
  const bytes = readEvidenceBytes('xde-read', key);
  if (!bytes) {
    return undefined;
  }
  const decoded = decodeSections(bytes);
  // Exactly two sections, always: a frame of any other shape is foreign.
  if (decoded?.sections.length !== 2) {
    return undefined;
  }
  const header = decoded.header as { meshed?: boolean; triangleCount?: number };
  const resultJson = textDecoder.decode(decoded.sections[resultJsonSection]);
  return {
    resultJson,
    ...(header.meshed === true ? { positions: sectionToFloat32(decoded.sections[positionsSection]!) } : {}),
    triangleCount: header.triangleCount ?? 0,
  };
};

/**
 * Persist a successful AP242 read.
 *
 * Only ever called after the read succeeded and parsed: failures are never
 * evidence, which is exactly what lets a warm hit skip the parse (C5).
 *
 * @param key - The read identity.
 * @param value - The read payload.
 * @public
 */
export const writeCachedXdeRead = (key: XdeReadCacheKey, value: CachedXdeRead): void => {
  const positions = value.positions ?? new Float32Array(0);
  writeEvidenceBytes(
    'xde-read',
    key,
    encodeSections({ meshed: value.positions !== undefined, triangleCount: value.triangleCount }, [
      textEncoder.encode(value.resultJson),
      float32ToSection(positions),
    ]),
  );
};
