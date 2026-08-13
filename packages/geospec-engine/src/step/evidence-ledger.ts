/**
 * The lazy BRep facet ledger.
 *
 * `BrepEvidence` is published as five memoizing facets over one retained AP242
 * read. Reading any field of a facet runs its owning coarse native call once,
 * synchronously (§18: one coarse call per claim, never per-field streaming);
 * every other field of that facet is then already materialized.
 *
 * Rules the ledger holds (register row "Lazy BRep facet ledger", A12/D-10):
 * - a facet that fails memoizes `undefined` plus a per-facet diagnostic, so a
 *   failure costs one native call, not one per read;
 * - `toJSON` serializes only facets that actually materialized — an unread
 *   facet must never be forced by serialization;
 * - after the owning handle is disposed, a first read memoizes the failure
 *   diagnostic instead of crossing into freed memory.
 *
 * @module
 */

import { deriveHolePatterns, deriveRevolvedChamfers, maxPartOccurrences } from '#step/features.js';
import type { FaceFact } from '#step/features.js';
import { readEvidenceJson, writeEvidenceJson } from '#cache/evidence-cache.js';
import { forensicSpan } from '#runner/forensic.js';
import type { ForensicSink, GeoSpecForensicSpan } from '#runner/forensic.js';
import type { BrepEvidence, GeometryDiagnostic } from '#mesh/types.js';
import type { GeoSpecNativeXdeReadResult } from '#step/types.js';

/**
 * The five lazily materialized facets.
 *
 * @public
 */
export type BrepFacetName = 'summary' | 'massProperties' | 'validity' | 'faceFeatures' | 'wallThickness';

/** Facet → the evidence fields it owns. Order is the read order of a field. */
const facetFields = {
  summary: ['topologyCounts', 'boundingBox'],
  massProperties: ['massProperties'],
  validity: ['validity'],
  faceFeatures: [
    'planarFaces',
    'cylindricalFaces',
    'circularHoles',
    'circularHolePatterns',
    'chamferFeatures',
    'filletFeatures',
  ],
  wallThickness: ['minimumWallThickness'],
} as const satisfies Record<BrepFacetName, ReadonlyArray<keyof BrepEvidence>>;

const facetNames = Object.keys(facetFields) as BrepFacetName[];

/** One forensic bucket per facet: the wall-thickness one is the D-12 lesson. */
const facetSpans = {
  summary: 'brep.facet.summary',
  massProperties: 'brep.facet.massProperties',
  validity: 'brep.facet.validity',
  faceFeatures: 'brep.facet.faceFeatures',
  wallThickness: 'brep.facet.wallThickness',
} as const satisfies Record<BrepFacetName, GeoSpecForensicSpan>;

/**
 * The retained read a ledger reads through, plus its disposal state. Disposal
 * is observed rather than trusted: a raw embind handle has no idempotency
 * guard, so double-deleting one aborts the whole wasm instance (D-10).
 *
 * @public
 */
export type BrepLedgerHandle = {
  readonly native: GeoSpecNativeXdeReadResult;
  readonly occurrenceCount: number;
  disposed: boolean;
};

/**
 * Options a ledger passes to the native facet calls.
 *
 * @public
 */
export type CreateBrepEvidenceLedgerOptions = {
  handle: BrepLedgerHandle;
  /** Serialized options for the validity and wall-thickness facets. */
  facetOptionsJson: string;
  /**
   * Subject content hash. Present ⇒ materialized facets persist under the
   * `brep-facet` family, so a warm load answers a facet without touching the
   * native read at all (which is the whole point of R8's lazy proxy: the 199-second
   * wall-thickness class never runs twice for the same bytes).
   */
  contentHash?: string;
};

const diagnosticsByEvidence = new WeakMap<BrepEvidence, Map<BrepFacetName, GeometryDiagnostic>>();
const configureForensics = new WeakMap<BrepEvidence, (sink?: ForensicSink) => void>();

/** Attach observation to one live lazy ledger without changing its evidence identity. @internal */
export const setBrepEvidenceForensicSink = (brep: BrepEvidence, sink?: ForensicSink): (() => void) => {
  const configure = configureForensics.get(brep);
  configure?.(sink);
  return () => configure?.();
};

const facetDiagnostic = (facet: BrepFacetName, message: string, details?: unknown): GeometryDiagnostic => ({
  code: 'GEOSPEC_FACET_FAILED',
  severity: 'warning',
  message: `GeoSpec could not materialize the '${facet}' BRep evidence facet: ${message}`,
  suggestion:
    'Re-run the claim with a subject whose STEP read succeeded, or raise the facet work-unit budget; do not delete the test.',
  details: { facet, ...(details === undefined ? {} : { native: details }) },
});

type FacetPayload = Partial<BrepEvidence>;

/**
 * Read one facet's diagnostic.
 *
 * @param brep - The subject's BRep evidence.
 * @param facet - Facet name.
 * @returns The recorded diagnostic, or `undefined` when the facet materialized
 * or was never demanded.
 * @public
 */
export const getBrepFacetDiagnostic = (brep: BrepEvidence, facet: BrepFacetName): GeometryDiagnostic | undefined =>
  diagnosticsByEvidence.get(brep)?.get(facet);

/**
 * Create the lazy BRep evidence ledger for one retained read.
 *
 * @param options - The handle and the facet options.
 * @returns Evidence whose fields materialize on first read.
 * @public
 */
export const createBrepEvidenceLedger = (options: CreateBrepEvidenceLedgerOptions): BrepEvidence => {
  const { handle, facetOptionsJson, contentHash } = options;
  // The key carries everything that could change the payload: the bytes, the
  // facet, and the options the native call reads. An engine or schema change
  // rotates the whole family through `engineDigest` (C5).
  const facetKey = (facet: BrepFacetName): Record<string, unknown> | undefined =>
    contentHash === undefined ? undefined : { contentHash, facet, facetOptionsJson };
  const evidence: BrepEvidence = {};
  const diagnostics = new Map<BrepFacetName, GeometryDiagnostic>();
  const materialized = new Set<BrepFacetName>();
  let forensic: ForensicSink | undefined;
  diagnosticsByEvidence.set(evidence, diagnostics);
  configureForensics.set(evidence, (sink) => {
    forensic = sink;
  });

  const readFacet = (facet: BrepFacetName): FacetPayload => {
    const key = facetKey(facet);
    if (key) {
      const cached = readEvidenceJson<FacetPayload>('brep-facet', key);
      if (cached) {
        return cached;
      }
    }
    return persist(
      facet,
      key,
      forensicSpan(facetSpans[facet], () => readFacetUncached(facet), forensic),
    );
  };

  /** A facet that materialized is evidence; a facet that failed never is (C5). */
  const persist = (
    facet: BrepFacetName,
    key: Record<string, unknown> | undefined,
    payload: FacetPayload,
  ): FacetPayload => {
    if (key && !diagnostics.has(facet)) {
      writeEvidenceJson('brep-facet', key, payload);
    }
    return payload;
  };

  const readFacetUncached = (facet: BrepFacetName): FacetPayload => {
    if (handle.disposed) {
      diagnostics.set(facet, facetDiagnostic(facet, 'the native read was already disposed.'));
      return {};
    }
    let json: string;
    try {
      json = runFacet(facet, handle, facetOptionsJson);
    } catch (error) {
      diagnostics.set(facet, facetDiagnostic(facet, error instanceof Error ? error.message : String(error)));
      return {};
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(json) as Record<string, unknown>;
    } catch {
      diagnostics.set(facet, facetDiagnostic(facet, 'the native call returned malformed JSON.'));
      return {};
    }
    if (parsed['error'] !== undefined) {
      diagnostics.set(facet, facetDiagnostic(facet, JSON.stringify(parsed['error'])));
      return {};
    }
    if (parsed['budgetExceeded'] !== undefined) {
      diagnostics.set(
        facet,
        facetDiagnostic(facet, 'the deterministic work-unit budget was exhausted.', parsed['budgetExceeded']),
      );
      return {};
    }
    return facet === 'faceFeatures' ? faceFeaturePayload(parsed, handle) : (parsed as FacetPayload);
  };

  // Called only from a facet getter, and its first act is to replace every
  // getter of that facet with a value — so it runs at most once per facet and
  // needs no re-entry guard of its own.
  const force = (facet: BrepFacetName): void => {
    materialized.add(facet);
    const payload = readFacet(facet);
    for (const field of facetFields[facet]) {
      Object.defineProperty(evidence, field, {
        value: payload[field],
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
  };

  for (const facet of facetNames) {
    for (const field of facetFields[facet]) {
      Object.defineProperty(evidence, field, {
        get: () => {
          force(facet);
          return (evidence as Record<string, unknown>)[field];
        },
        enumerable: true,
        configurable: true,
      });
    }
  }

  Object.defineProperty(evidence, 'toJSON', {
    value: () => {
      const out: Record<string, unknown> = {};
      for (const facet of materialized) {
        for (const field of facetFields[facet]) {
          out[field] = (evidence as Record<string, unknown>)[field];
        }
      }
      return out;
    },
    enumerable: false,
    configurable: true,
  });

  return evidence;
};

const runFacet = (facet: BrepFacetName, handle: BrepLedgerHandle, facetOptionsJson: string): string => {
  switch (facet) {
    case 'summary': {
      return handle.native.analysisSummaryJson();
    }
    case 'massProperties': {
      return handle.native.analysisMassPropertiesJson();
    }
    case 'validity': {
      return handle.native.analysisValidityJson(facetOptionsJson);
    }
    case 'faceFeatures': {
      return handle.native.analysisFaceFeaturesJson();
    }
    default: {
      return handle.native.analysisWallThicknessJson(facetOptionsJson);
    }
  }
};

const faceFeaturePayload = (parsed: Record<string, unknown>, handle: BrepLedgerHandle): FacetPayload => {
  const payload = parsed as FacetPayload;
  const factsByOccurrence: FaceFact[][] = [];
  for (let occurrence = 0; occurrence < Math.min(handle.occurrenceCount, maxPartOccurrences); occurrence++) {
    const facts = JSON.parse(handle.native.faceFacts(occurrence)) as { faces?: FaceFact[] };
    factsByOccurrence.push(facts.faces ?? []);
  }
  return {
    ...payload,
    chamferFeatures: [...(payload.chamferFeatures ?? []), ...deriveRevolvedChamfers(factsByOccurrence)],
    circularHolePatterns: deriveHolePatterns(payload.circularHoles ?? []),
  };
};
