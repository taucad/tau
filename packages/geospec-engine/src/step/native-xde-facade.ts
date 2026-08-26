/**
 * The lazy native XDE proxy (R8).
 *
 * Every consumer of a STEP subject speaks to the AP242 read through this
 * façade rather than the raw embind handle, for two reasons.
 *
 * **Disposal safety (D-10).** A raw embind handle has no idempotency guard, so
 * a second `delete` aborts the whole wasm instance. The façade's `delete` is
 * idempotent and flips a disposed flag the facet ledger observes, so a read
 * after disposal records a diagnostic instead of touching freed memory.
 *
 * **Laziness (R8/B15).** When the evidence cache already holds the read's
 * result, the native read is not performed at all. The façade answers
 * `isSuccess`/`resultJson` from the cached payload — a stored entry exists only
 * because the read succeeded, so those answers are exact — and materializes the
 * real read on the first call that genuinely needs geometry. A warm run whose
 * claims never touch geometry therefore performs zero reader work. Optional
 * members are installed from the *materialized* handle's probed capabilities,
 * so presence-as-a-capability-signal survives the laziness.
 *
 * `delete` never materializes: disposing a read that never happened must not
 * cause it to happen.
 *
 * @module
 */

import type { GeoSpecNativeXdeReadResult } from '#step/types.js';
import type { BrepLedgerHandle } from '#step/evidence-ledger.js';

/**
 * Options for {@link createNativeXdeFacade}.
 *
 * @public
 */
export type CreateNativeXdeFacadeOptions = {
  /** Performs the AP242 read. Called at most once. */
  read: () => GeoSpecNativeXdeReadResult;
  /** Occurrence count, known from the read result on both paths. */
  occurrenceCount: number;
  /**
   * The reader's result JSON when it is already known from the cache. Its
   * presence is what keeps the read deferred.
   */
  cachedResultJson?: string;
};

/**
 * A façade over one AP242 read plus the ledger handle that shares its disposal
 * state.
 *
 * @public
 */
export type NativeXdeFacade = {
  /** The 16-method surface every consumer sees. */
  readonly facade: GeoSpecNativeXdeReadResult;
  /** The handle the BRep facet ledger reads through. */
  readonly handle: BrepLedgerHandle;
  /** Force the read now (the eager, cache-miss path). */
  materialize: () => GeoSpecNativeXdeReadResult;
  /** Whether the native read has actually run. */
  materialized: () => boolean;
};

/**
 * Build the native XDE façade.
 *
 * @param options - Read thunk, occurrence count, and any cached result JSON.
 * @returns The façade, its ledger handle, and its materialization controls.
 * @public
 */
export const createNativeXdeFacade = (options: CreateNativeXdeFacadeOptions): NativeXdeFacade => {
  const { read, cachedResultJson } = options;
  let native: GeoSpecNativeXdeReadResult | undefined;

  const handle: BrepLedgerHandle = {
    get native(): GeoSpecNativeXdeReadResult {
      return facade;
    },
    occurrenceCount: options.occurrenceCount,
    disposed: false,
  };

  const materialize = (): GeoSpecNativeXdeReadResult => {
    native ??= read();
    return native;
  };

  const facade: GeoSpecNativeXdeReadResult = {
    // Answered from the cache when the read is still deferred: an entry only
    // exists because the read succeeded.
    isSuccess: () => (native ? native.isSuccess() : cachedResultJson !== undefined),
    resultJson: () =>
      native === undefined && cachedResultJson !== undefined ? cachedResultJson : materialize().resultJson(),
    // oxlint-disable-next-line max-params -- The four-argument shape is the kernel's embind signature.
    extrema: (occurrenceA, faceA, occurrenceB, faceB) => materialize().extrema(occurrenceA, faceA, occurrenceB, faceB),
    classifyPoints: (occurrence, pointsJson) => materialize().classifyPoints(occurrence, pointsJson),
    commonVolume: (occurrenceA, occurrenceB) => materialize().commonVolume(occurrenceA, occurrenceB),
    faceFacts: (occurrence) => materialize().faceFacts(occurrence),
    analysisSummaryJson: () => materialize().analysisSummaryJson(),
    analysisMassPropertiesJson: () => materialize().analysisMassPropertiesJson(),
    analysisFaceFeaturesJson: () => materialize().analysisFaceFeaturesJson(),
    analysisValidityJson: (json) => materialize().analysisValidityJson(json),
    analysisWallThicknessJson: (json) => materialize().analysisWallThicknessJson(json),
    meshTriangles: (json) => materialize().meshTriangles(json),
    meshTrianglePointer: () => materialize().meshTrianglePointer(),
    meshTriangleCount: () => materialize().meshTriangleCount(),
    occurrenceMeshTriangles: (occurrence, json) => materialize().occurrenceMeshTriangles(occurrence, json),
    delete: () => {
      // Idempotent, and never a materialization trigger: disposing a read that
      // never happened must not cause it to happen.
      if (handle.disposed) {
        return;
      }
      handle.disposed = true;
      native?.delete?.();
    },
  };

  return { facade, handle, materialize, materialized: () => native !== undefined };
};
