import {
  decodeGeoSpecCanonicalJson,
  geoSpecEngineProtocolVersion,
  geoSpecMatcherRegistryVersion,
} from '#engine/protocol.js';
import type {
  GeoSpecClaimResult,
  GeoSpecEngineProtocol,
  GeoSpecSubmitClaimsRequest,
  GeoSpecSubmitClaimsResult,
} from '#engine/protocol.js';

type TestProtocolOptions = {
  capabilities?: readonly string[];
  engine?: string;
  version?: string;
  submitClaims?: (
    request: GeoSpecSubmitClaimsRequest,
  ) => GeoSpecSubmitClaimsResult | Promise<GeoSpecSubmitClaimsResult>;
};

/** Minimal Contract-B implementation for substrate unit tests. */
export const createTestGeoSpecEngineProtocol = (options: TestProtocolOptions = {}): GeoSpecEngineProtocol => ({
  initialize: () => ({
    protocolVersion: geoSpecEngineProtocolVersion,
    engine: { name: options.engine ?? 'test-engine', version: options.version ?? '1.0.0' },
    determinism: 'reference-wasm',
    capabilities: (options.capabilities ?? []).map((name) => ({
      name,
      registryVersion: geoSpecMatcherRegistryVersion,
    })),
    provenance: {},
  }),
  async ingestSubject(request) {
    return {
      requestId: request.requestId,
      subject: {
        kind: 'geometry-subject-reference',
        subjectId: request.contentHash,
        contentHash: request.contentHash,
      },
    };
  },
  submitClaims:
    options.submitClaims ??
    ((request) => {
      const results: GeoSpecClaimResult[] = request.claims.map((bytes) => {
        const claim = decodeGeoSpecCanonicalJson(bytes);
        const claimId =
          typeof claim === 'object' && claim !== null && !Array.isArray(claim) && typeof claim['claimId'] === 'string'
            ? claim['claimId']
            : 'invalid-claim';
        return { claimId, status: 'passed', diagnostics: [], provenance: {} };
      });
      return { requestId: request.requestId, results };
    }),
  cancel: (request) => ({ requestId: request.requestId, cancelled: true }),
  releaseSubject: (request) => ({ requestId: request.requestId, released: true }),
  on: () => () => undefined,
});
