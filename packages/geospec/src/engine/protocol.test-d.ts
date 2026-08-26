import type { GeoSpecClaim, GeoSpecIngestSubjectRequest, GeoSpecSubmitClaimsRequest } from '#engine/protocol.js';

const validClaim: GeoSpecClaim = {
  claimId: 'claim-1',
  capability: 'toHaveVolume',
  subjectIds: ['subject-1'],
  payload: { expected: 10 },
  workUnitBudget: 1,
};

void validClaim;

const functionPayload: GeoSpecClaim = {
  claimId: 'claim-2',
  capability: 'toHaveVolume',
  subjectIds: [],
  // @ts-expect-error Contract B rejects functions.
  payload: { callback: () => undefined },
  workUnitBudget: 1,
};

const mapPayload: GeoSpecClaim = {
  claimId: 'claim-3',
  capability: 'toHaveVolume',
  subjectIds: [],
  // @ts-expect-error Contract B rejects Map.
  payload: new Map<string, string>(),
  workUnitBudget: 1,
};

const regexpPayload: GeoSpecClaim = {
  claimId: 'claim-4',
  capability: 'inspectGeometry',
  subjectIds: [],
  // @ts-expect-error RegExp must use the explicit pattern/flags representation.
  payload: /face/gu,
  workUnitBudget: 1,
};

const callbackIngest: GeoSpecIngestSubjectRequest = {
  requestId: 'request-1',
  contentHash: 'sha256:1',
  format: 'glb',
  frame: { coordinateSystem: 'z-up', sourceUnit: 'm', targetUnit: 'mm' },
  provenance: {},
  // @ts-expect-error Progress callbacks are host concerns, not protocol DTOs.
  options: { onProgress: () => undefined },
};

const invalidBatch: GeoSpecSubmitClaimsRequest = {
  requestId: 'request-2',
  registryVersion: 1,
  // @ts-expect-error Claims cross as canonical bytes, not live claim objects.
  claims: [validClaim],
};

void functionPayload;
void mapPayload;
void regexpPayload;
void callbackIngest;
void invalidBatch;
