/**
 * The exact-BRep payload layer of the `relationship-verdict` family (R1).
 *
 * Every crossing into the kernel that a relationship proof makes — extrema,
 * point classification, boolean common volume — is a pure function of the
 * subject's bytes and the operands, so each one is replayable. They share one
 * family and are separated by a `kind` discriminator in the key.
 *
 * The key deliberately excludes tolerances (Register C5): contact and
 * clearance over the same face pair are the *same measurement* asked two
 * questions, so they must share one payload. The corollary is a rule, not a
 * preference: **a width-bound (tolerance-dependent) value can never be stored
 * under this key.**
 *
 * A failed crossing is not evidence and is never stored.
 *
 * @module
 */

import { chargeBudget } from 'geospec/runner';
import { forensicSpan } from '#runner/forensic.js';
import type { ForensicSink } from '#runner/forensic.js';
import { readEvidenceJson, writeEvidenceJson } from '#cache/evidence-cache.js';
import type { Vec3 } from '#mesh/types.js';

/** Exact minimum distance between two operands, with its witness pair. */
export type ExtremaPayload = { distance: number; pointA: Vec3; pointB: Vec3 };

/** Exact point-in-solid states, in the query's point order. */
export type ClassifyPayload = { states: Array<'in' | 'on' | 'out'> };

/** Exact boolean-common volume and its centroid. */
export type CommonVolumePayload = { volume: number; centroid: Vec3 };

/**
 * The four-method embind surface a relationship proof runs through. Narrower
 * than the retained read on purpose: a proof may measure, classify and
 * intersect, and nothing else.
 *
 * @public
 */
export type RelationshipProofNative = {
  faceFacts(occurrence: number): string;
  extrema(occurrenceA: number, faceA: number, occurrenceB: number, faceB: number): string;
  classifyPoints(occurrence: number, pointsJson: string): string;
  commonVolume(occurrenceA: number, occurrenceB: number): string;
};

/**
 * Read a stored payload, otherwise compute and store one.
 *
 * @param contentHash - Subject content hash; `undefined` disables persistence
 * (a subject with no provenance has no cache identity).
 * @param key - The claim key, minus the content hash.
 * @param compute - Produces the payload. Returning `undefined` means either
 * "the crossing failed" or — the CR4 peek-first idiom — "do not compute at
 * all"; neither ever writes.
 * @returns The payload, or `undefined`.
 * @public
 */
export const replayable = <Payload>(
  contentHash: string | undefined,
  key: Record<string, unknown>,
  compute: () => Payload | undefined,
): Payload | undefined => {
  const cacheKey = contentHash === undefined ? undefined : { contentHash, ...key };
  if (cacheKey) {
    const cached = readEvidenceJson<Payload>('relationship-verdict', cacheKey);
    if (cached) {
      return cached;
    }
  }
  const computed = compute();
  if (computed !== undefined && cacheKey) {
    writeEvidenceJson('relationship-verdict', cacheKey, computed);
  }
  return computed;
};

/**
 * {@link replayable}, with the R13 work-unit charge in front of it.
 *
 * The charge is a pure function of the REQUEST — points classified, one
 * extrema solve, one pair volume — and is paid before the store is consulted,
 * so an identical claim charges identical units in identical order whether the
 * evidence was computed or replayed. A budget that depended on cache state
 * would let a warm machine pass a claim a cold one abandons.
 *
 * @param units - Native work units this request represents.
 * @param contentHash - Subject content hash, or `undefined` for no persistence.
 * @param key - The claim key, minus the content hash.
 * @param compute - Produces the payload.
 * @returns The payload, or `undefined`.
 * @public
 */
// oxlint-disable-next-line eslint/max-params -- One positional wrapper over `replayable`, whose three parameters it forwards unchanged; an options object would obscure that it is the same call with a charge in front.
export const chargeAndReplay = <Payload>(
  units: number,
  contentHash: string | undefined,
  key: Record<string, unknown>,
  compute: () => Payload | undefined,
): Payload | undefined => {
  chargeBudget(units);
  return replayable<Payload>(contentHash, key, compute);
};

const parse = <Payload extends Record<string, unknown>>(json: string): Payload | undefined => {
  const value = JSON.parse(json) as Payload & { error?: string };
  // A native failure answers `{"error": ...}`; it is not evidence (C5).
  return value.error === undefined ? value : undefined;
};

/**
 * Exact minimum distance between two operands (occurrence solids, or single
 * located faces when the face index is non-negative).
 *
 * @param options - The native surface, the cache identity and the operands.
 * @returns The measured extrema, or `undefined` when the crossing failed.
 * @public
 */
export const measureExtrema = (options: {
  native: RelationshipProofNative;
  contentHash?: string;
  a: { occurrence: number; face: number };
  b: { occurrence: number; face: number };
  /** Peek-first: `false` skips the crossing and answers only from the store. */
  compute?: boolean;
  forensic?: ForensicSink;
}): ExtremaPayload | undefined =>
  chargeAndReplay<ExtremaPayload>(
    1,
    options.contentHash,
    { kind: 'extrema', a: [options.a.occurrence, options.a.face], b: [options.b.occurrence, options.b.face] },
    () =>
      options.compute === false
        ? undefined
        : parse<ExtremaPayload>(
            forensicSpan(
              'proof.extrema',
              () => options.native.extrema(options.a.occurrence, options.a.face, options.b.occurrence, options.b.face),
              options.forensic,
            ),
          ),
  );

/**
 * Exact point-in-solid classification of a batch of points.
 *
 * @param options - The native surface, the cache identity, the occurrence and
 * the points.
 * @returns The states in point order, or `undefined` when the crossing failed.
 * @public
 */
export const classifyPoints = (options: {
  native: RelationshipProofNative;
  contentHash?: string;
  occurrence: number;
  points: readonly Vec3[];
  forensic?: ForensicSink;
}): ClassifyPayload | undefined => {
  if (options.points.length === 0) {
    return { states: [] };
  }
  return chargeAndReplay<ClassifyPayload>(
    options.points.length,
    options.contentHash,
    { kind: 'classify', occurrence: options.occurrence, points: options.points },
    () =>
      parse<ClassifyPayload>(
        forensicSpan(
          'proof.classify',
          () => options.native.classifyPoints(options.occurrence, JSON.stringify(options.points)),
          options.forensic,
        ),
      ),
  );
};

/**
 * Exact boolean-common volume of two occurrence solids.
 *
 * @param options - The native surface, the cache identity and the operands.
 * @returns The common volume, or `undefined` when the crossing failed.
 * @public
 */
export const commonVolume = (options: {
  native: RelationshipProofNative;
  contentHash?: string;
  a: number;
  b: number;
  forensic?: ForensicSink;
}): CommonVolumePayload | undefined =>
  chargeAndReplay<CommonVolumePayload>(
    1,
    options.contentHash,
    { kind: 'common-volume', a: options.a, b: options.b },
    () =>
      parse<CommonVolumePayload>(
        forensicSpan('proof.commonVolume', () => options.native.commonVolume(options.a, options.b), options.forensic),
      ),
  );
