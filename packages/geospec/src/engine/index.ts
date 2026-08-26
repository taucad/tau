/**
 * The substrate/engine seam and the machine-readable matcher registry.
 *
 * `@taucad/geospec-engine` (or any conforming engine) imports this subpath to
 * register itself; consumers import it to discover what the active engine can
 * execute.
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
  geoSpecEngineProtocolVersion,
  geoSpecMatcherRegistryVersion,
  isGeoSpecJsonValue,
  toGeoSpecProtocolJson,
  type GeoSpecCancelRequest,
  type GeoSpecCancelResult,
  type GeoSpecClaim,
  type GeoSpecClaimId,
  type GeoSpecClaimResult,
  type GeoSpecDeterminismClass,
  type GeoSpecEngineProtocol,
  type GeoSpecExecutionOptions,
  type GeoSpecIngestSubjectRequest,
  type GeoSpecIngestSubjectResult,
  type GeoSpecInitializeRequest,
  type GeoSpecInitializeResult,
  type GeoSpecProtocolCapability,
  type GeoSpecProtocolEvent,
  type GeoSpecProtocolProvenance,
  type GeoSpecReleaseSubjectRequest,
  type GeoSpecReleaseSubjectResult,
  type GeoSpecRequestId,
  type GeoSpecSubjectFrame,
  type GeoSpecSubjectId,
  type GeoSpecSubjectReference,
  type GeoSpecSubmitClaimsRequest,
  type GeoSpecSubmitClaimsResult,
} from '#engine/protocol.js';

export {
  clearGeoSpecEngine,
  describeGeoSpecEngine,
  geoSpecEngineGlobalKey,
  geoSpecEngineUnavailableCode,
  geoSpecEngineUnavailableDiagnostic,
  GeoSpecEngineUnavailableError,
  getGeoSpecEngine,
  getGeoSpecEngineHostBinding,
  getGeoSpecEngineProtocol,
  registerGeoSpecEngine,
  requireGeoSpecEngineHostBinding,
  type GeoSpecEngineCapability,
  type GeoSpecEngineDescriptor,
  type GeoSpecEngineHostBindings,
  type GeoSpecEngineImplementation,
} from '#engine/seam.js';
