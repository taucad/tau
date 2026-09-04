/**
 * The GeoSpec matcher registry: the language-neutral description of every
 * matcher the DSL exposes, and the TypeScript binding of the matcher half of
 * the engine protocol (DL13 / split-doc D-S0).
 *
 * The registry is **data**: `geoSpecMatcherDescriptors` is a frozen,
 * JSON-serializable table that a non-TypeScript client can emit verbatim. The
 * substrate owns it; an engine supplies the bodies through
 * {@link import('./seam.js').registerGeoSpecEngine}.
 *
 * @module
 */

import type { GeoSpecAssertion, GeoSpecMatcher } from '#runner/types.js';

/**
 * Every matcher name exposed by `expectGeo(...)`.
 *
 * @public
 */
export type GeoSpecMatcherName = keyof GeoSpecMatcher;

/**
 * How the substrate derives an assertion's recorded `expected` value from the
 * arguments the spec author passed. Data, not code, so the registry stays
 * emittable to non-TypeScript clients (DL13).
 *
 * - `first` — the first argument verbatim.
 * - `first-or-empty` — the first argument, defaulting to `{}`.
 * - `bounds` — `(min, max)` pairs collapse to `{ min, max }`; a lone object
 *   argument passes through.
 * - `true` — nullary matchers record the literal `true`.
 *
 * @public
 */
export type GeoSpecMatcherExpectedShape = 'first' | 'first-or-empty' | 'bounds' | 'true';

/**
 * Whether a matcher settles synchronously (throwing its
 * `GeoSpecAssertionError` inside the `it()` body) or asynchronously (settled
 * before the test completes). Part of the contract: it decides whether the
 * deterministic work-unit budget (R13) brackets the evaluation.
 *
 * @public
 */
export type GeoSpecMatcherMode = 'sync' | 'async';

/**
 * One matcher's contract entry.
 *
 * @public
 */
export type GeoSpecMatcherDescriptor = {
  readonly kind: GeoSpecAssertion['kind'];
  readonly expected: GeoSpecMatcherExpectedShape;
  readonly mode: GeoSpecMatcherMode;
};

/**
 * The 24-entry matcher registry. Insertion order is contract: it fixes
 * `geoSpecMatcherNames`, which `libs/api-extractor` and the LLM prompt
 * pipeline consume.
 *
 * @public
 */
export const geoSpecMatcherDescriptors: Readonly<Record<GeoSpecMatcherName, GeoSpecMatcherDescriptor>> = Object.freeze({
  toHaveBoundingBox: { kind: 'boundingBox', expected: 'bounds', mode: 'sync' },
  toHaveConnectedComponents: { kind: 'connectedComponents', expected: 'first', mode: 'sync' },
  toBeWatertight: { kind: 'watertight', expected: 'true', mode: 'sync' },
  toHaveNoComponentInterference: { kind: 'componentInterference', expected: 'first-or-empty', mode: 'async' },
  toHaveAssemblyOccurrences: { kind: 'assemblyOccurrences', expected: 'first', mode: 'sync' },
  toHaveSpatialRelationships: { kind: 'spatialRelationships', expected: 'first', mode: 'async' },
  toHaveMeshIntegrity: { kind: 'meshIntegrity', expected: 'first', mode: 'sync' },
  toHaveNoDiagnostics: { kind: 'noDiagnostics', expected: 'first-or-empty', mode: 'sync' },
  toHaveSurfaceArea: { kind: 'surfaceArea', expected: 'first', mode: 'sync' },
  toHaveVolume: { kind: 'volume', expected: 'first', mode: 'sync' },
  toHaveMass: { kind: 'mass', expected: 'first', mode: 'sync' },
  toHaveCenterOfMass: { kind: 'centerOfMass', expected: 'first', mode: 'sync' },
  toBeValidBrep: { kind: 'validBrep', expected: 'first-or-empty', mode: 'sync' },
  toHaveTopologyCounts: { kind: 'topologyCounts', expected: 'first', mode: 'sync' },
  toHaveStepUnits: { kind: 'stepUnits', expected: 'first', mode: 'sync' },
  toHaveProductStructure: { kind: 'productStructure', expected: 'first', mode: 'sync' },
  toHavePlanarFace: { kind: 'planarFace', expected: 'first', mode: 'sync' },
  toHaveCylindricalFace: { kind: 'cylindricalFace', expected: 'first', mode: 'sync' },
  toHaveCircularHole: { kind: 'circularHole', expected: 'first', mode: 'sync' },
  toHaveCircularHolePattern: { kind: 'circularHolePattern', expected: 'first', mode: 'sync' },
  toHaveChamferFeature: { kind: 'chamferFeature', expected: 'first', mode: 'sync' },
  toHaveFilletFeature: { kind: 'filletFeature', expected: 'first', mode: 'sync' },
  toHaveMinimumWallThickness: { kind: 'minimumWallThickness', expected: 'first', mode: 'sync' },
  toHaveVoidContinuity: { kind: 'voidContinuity', expected: 'first', mode: 'sync' },
});

/**
 * Derive the `expected` value an assertion records from the call arguments.
 *
 * @param shape - Normalization shape from the matcher's registry entry.
 * @param callArguments - Arguments the spec author passed, in order.
 * @returns The value recorded as the assertion's `expected`.
 * @public
 */
export const normalizeGeoSpecExpected = (
  shape: GeoSpecMatcherExpectedShape,
  callArguments: readonly unknown[],
): unknown => {
  switch (shape) {
    case 'true': {
      return true;
    }
    case 'first-or-empty': {
      return callArguments[0] ?? {};
    }
    case 'bounds': {
      return callArguments[1] === undefined ? callArguments[0] : { min: callArguments[0], max: callArguments[1] };
    }
    default: {
      return callArguments[0];
    }
  }
};
