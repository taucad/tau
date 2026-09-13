/* oxlint-disable no-barrel-files/no-barrel-files -- public standalone assertion subpath */
/** Runner-independent GeoSpec assertion client. @module */

export {
  createGeoSpecAssertionClient,
  createGeoSpecMatcherMethods,
  createGeoSpecNativeMatcherMethods,
  GeoSpecAssertionError,
  type GeoSpecAssertionClient,
  type GeoSpecAssertionClientOptions,
  type GeoSpecAssertionMatchers,
  type GeoSpecAuthoringInvocation,
  type GeoSpecFixedNativeAuthoringInvocation,
  type GeoSpecMatcherMethods,
  type GeoSpecNativeAuthoringInvocation,
  type GeoSpecNativeMatcherMethods,
  type GeoSpecQueryOptions,
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
export type { GeoSpecCanonicalClaimReport, GeoSpecNativeEngine, GeoSpecNativeSubject } from '#engine/client.js';
export { geoSpecNativeMatcherDescriptors } from '#engine/matchers.js';
export type { GeoSpecFixedNativeMatcherDescriptor, GeoSpecNativeMatcherName } from '#engine/matchers.js';
