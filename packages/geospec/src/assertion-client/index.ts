/* oxlint-disable no-barrel-files/no-barrel-files -- public standalone assertion subpath */
/** Runner-independent GeoSpec assertion client. @module */

export {
  createGeoSpecAssertionClient,
  createGeoSpecMatcherMethods,
  GeoSpecAssertionError,
  type GeoSpecAssertionClient,
  type GeoSpecAssertionClientOptions,
  type GeoSpecAssertionMatchers,
  type GeoSpecAuthoringInvocation,
  type GeoSpecMatcherMethods,
  type GeoSpecQueryOptions,
  type MinimumDistanceFact,
  type MinimumDistanceQuery,
  type MinimumDistanceResult,
} from '#assertion-client/client.js';
export { evaluateGeoSpecNativeQuery } from '#engine/client.js';
export type { GeoSpecNativeQueryOptions, GeoSpecQueryCapability } from '#engine/client.js';
export type {
  GeoSpecPmiField,
  GeoSpecPmiRawEntity,
  GeoSpecPmiNumber,
  GeoSpecPmiFaceAssociation,
  GeoSpecPmiShapeReference,
  GeoSpecPmiLimits,
  GeoSpecPmiRecord,
  GeoSpecPmiInventory,
  GeoSpecPmiQueryPayload,
  GeoSpecPmiQueryValue,
} from '#engine/pmi.types.js';
export type {
  GeoSpecCanonicalClaimReport,
  GeoSpecNativeClaimEvaluation,
  GeoSpecNativeEngine,
  GeoSpecNativeEvidenceProfile,
  GeoSpecNativeSubject,
} from '#engine/client.js';
export { geoSpecMatcherDescriptors } from '#engine/matchers.js';
export type { GeoSpecFixedMatcherDescriptor, GeoSpecMatcherName } from '#engine/matchers.js';
