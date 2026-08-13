/**
 * Profile-counter shapes and constructors.
 *
 * The substrate declares these shapes as `@internal` types on modules it does
 * not publish, so the engine mirrors them here. They are structural, so an
 * engine-built profile satisfies every substrate signature that mentions one.
 *
 * Counters are opt-in observation, never a verdict input: nothing in a matcher
 * may branch on them.
 *
 * @module
 */

/**
 * Model-load cache counters.
 *
 * @public
 */
export type GeoSpecModelLoadCacheStats = {
  hits: number;
  misses: number;
  bypasses: number;
  failures: number;
};

/**
 * Overlap-cache counters, including the CR1 pair-outcome census and the
 * R14-lite pre-filter tally.
 *
 * @public
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
 * Disposable-resource counters for one module or aggregate run.
 *
 * @public
 */
export type GeoSpecResourceScopeProfile = {
  trackedSubjects: number;
  registeredDisposables: number;
  disposedScopes: number;
  disposedResources: number;
  overlap: GeoSpecOverlapCacheProfile;
};

/**
 * Counters collected for one GeoSpec run invocation.
 *
 * @public
 */
export type GeoSpecRunProfile = {
  aggregateModelLoadCache: GeoSpecModelLoadCacheStats;
  moduleModelLoadCache: GeoSpecModelLoadCacheStats;
  resourceScope: GeoSpecResourceScopeProfile;
};

/**
 * A zeroed model-load cache counter set.
 *
 * @returns The counters.
 * @public
 */
export const createGeoSpecModelLoadCacheStats = (): GeoSpecModelLoadCacheStats => ({
  hits: 0,
  misses: 0,
  bypasses: 0,
  failures: 0,
});

/**
 * A zeroed overlap-cache counter set.
 *
 * @returns The counters.
 * @public
 */
export const createGeoSpecOverlapCacheProfile = (): GeoSpecOverlapCacheProfile => ({
  cacheCreations: 0,
  cacheDisposals: 0,
  preparedComponentHits: 0,
  preparedComponentMisses: 0,
  pairVolumeHits: 0,
  pairVolumeMisses: 0,
  prefilterProven: 0,
  prefilterFallthrough: 0,
  outcomeSeparated: 0,
  outcomeTouching: 0,
  outcomeContainment: 0,
  outcomeTransversal: 0,
  invalidDiagnosticHits: 0,
  invalidDiagnosticMisses: 0,
});

/**
 * A zeroed resource-scope counter set.
 *
 * @returns The counters.
 * @public
 */
export const createGeoSpecResourceScopeProfile = (): GeoSpecResourceScopeProfile => ({
  trackedSubjects: 0,
  registeredDisposables: 0,
  disposedScopes: 0,
  disposedResources: 0,
  overlap: createGeoSpecOverlapCacheProfile(),
});

/**
 * A zeroed run profile.
 *
 * @returns The counters.
 * @public
 */
export const createGeoSpecRunProfile = (): GeoSpecRunProfile => ({
  aggregateModelLoadCache: createGeoSpecModelLoadCacheStats(),
  moduleModelLoadCache: createGeoSpecModelLoadCacheStats(),
  resourceScope: createGeoSpecResourceScopeProfile(),
});
