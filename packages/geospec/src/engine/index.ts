/**
 * The machine-readable matcher registry and the canonical JSON helpers.
 *
 * Every GeoSpec matcher is described here once; the authoring surface, the
 * native assertion client and tooling read the same registry. The compiled
 * `@taucad/geospec-engine-native` core evaluates the claims, so nothing
 * registers into this subpath.
 *
 * @module
 */

export {
  geoSpecMatcherDescriptors,
  normalizeGeoSpecExpected,
  type GeoSpecMatcherDescriptor,
  type GeoSpecMatcherExpectedShape,
  type GeoSpecMatcherMode,
  type GeoSpecMatcherName,
} from '#engine/matchers.js';

export {
  assertGeoSpecJsonValue,
  decodeGeoSpecCanonicalJson,
  encodeGeoSpecCanonicalJson,
  isGeoSpecJsonValue,
  toGeoSpecProtocolJson,
} from '#engine/protocol.js';
