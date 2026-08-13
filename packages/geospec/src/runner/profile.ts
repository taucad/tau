/**
 * Internal profile counter shapes for one GeoSpec run invocation.
 *
 * @module
 */

/**
 * Internal model-load cache counters.
 *
 * @internal
 */
export type GeoSpecModelLoadCacheStats = {
  hits: number;
  misses: number;
  bypasses: number;
  failures: number;
};

/**
 * Internal overlap-cache counters used by opt-in profiling and lifecycle
 * tests. This is not part of the authored GeoSpec API.
 *
 * @internal
 */
export type GeoSpecOverlapCacheProfile = {
  cacheCreations: number;
  cacheDisposals: number;
  preparedComponentHits: number;
  preparedComponentMisses: number;
  pairVolumeHits: number;
  pairVolumeMisses: number;
  /** R14-lite: pairs whose zero volume the disjointness pre-filter proved. */
  prefilterProven: number;
  /** R14-lite: pairs the pre-filter could not prove — fell to the boolean. */
  prefilterFallthrough: number;
  /** CR1 census: computed booleans whose intersection volume was exactly 0. */
  outcomeSeparated: number;
  /** CR1 census: positive intersections at or below the tolerance³ epsilon. */
  outcomeTouching: number;
  /** CR1 census: intersections equal to the smaller participant (nesting). */
  outcomeContainment: number;
  /** CR1 census: genuine transversal positive-volume crossings. */
  outcomeTransversal: number;
  invalidDiagnosticHits: number;
  invalidDiagnosticMisses: number;
};

/**
 * Internal disposable-resource counters for one module or aggregate run.
 *
 * @internal
 */
export type GeoSpecResourceScopeProfile = {
  trackedSubjects: number;
  registeredDisposables: number;
  disposedScopes: number;
  disposedResources: number;
  overlap: GeoSpecOverlapCacheProfile;
};

/**
 * Internal runner profile collected for one GeoSpec run invocation.
 *
 * @internal
 */
export type GeoSpecRunProfile = {
  aggregateModelLoadCache: GeoSpecModelLoadCacheStats;
  moduleModelLoadCache: GeoSpecModelLoadCacheStats;
  resourceScope: GeoSpecResourceScopeProfile;
};
