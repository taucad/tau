import { createModelLoadCacheStats } from '#runner/model-load-cache.js';
import type { GeoSpecModelLoadCacheStats } from '#runner/model-load-cache.js';

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

/**
 * Create empty overlap-cache counters.
 *
 * @returns Mutable overlap-cache counters for one profile.
 * @internal
 */
export const createGeoSpecOverlapCacheProfile = (): GeoSpecOverlapCacheProfile => ({
  cacheCreations: 0,
  cacheDisposals: 0,
  preparedComponentHits: 0,
  preparedComponentMisses: 0,
  pairVolumeHits: 0,
  pairVolumeMisses: 0,
  invalidDiagnosticHits: 0,
  invalidDiagnosticMisses: 0,
});

/**
 * Create empty resource-scope counters.
 *
 * @returns Mutable resource-scope counters for one profile.
 * @internal
 */
export const createGeoSpecResourceScopeProfile = (): GeoSpecResourceScopeProfile => ({
  trackedSubjects: 0,
  registeredDisposables: 0,
  disposedScopes: 0,
  disposedResources: 0,
  overlap: createGeoSpecOverlapCacheProfile(),
});

/**
 * Create an empty GeoSpec run profile.
 *
 * @returns Mutable profile counters for one runner or CLI invocation.
 * @internal
 */
export const createGeoSpecRunProfile = (): GeoSpecRunProfile => ({
  aggregateModelLoadCache: createModelLoadCacheStats(),
  moduleModelLoadCache: createModelLoadCacheStats(),
  resourceScope: createGeoSpecResourceScopeProfile(),
});
