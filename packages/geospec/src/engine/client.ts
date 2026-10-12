/** Host-side helpers for issuing one protocol-3 claim to the native core. @module */

import type { JSONValue } from '@taucad/runtime/types';
import { assertGeoSpecJsonValue, toGeoSpecProtocolJson } from '#engine/protocol.js';
import { geoSpecMatcherDescriptors } from '#engine/matchers.js';
import type { GeoSpecFixedMatcherName } from '#engine/matchers.js';

const nativeProtocolVersion = 3;
const nativeRegistryVersion = 5;
const nativeCanonicalProfile = 'geospec-jcs-v1';
const maximumSafeWorkUnitLimit = 9_007_199_254_740_991;

/**
 * Exact core bytes of one claim evaluated in one engine call: the canonical plan, its one
 * canonical claim and the canonical result, as fresh bytes the client retains without copying.
 * @public
 */
export type GeoSpecNativeClaimEvaluation = {
  readonly canonicalClaim: Uint8Array<ArrayBuffer>;
  readonly canonicalPlan: Uint8Array<ArrayBuffer>;
  readonly canonicalResult: Uint8Array<ArrayBuffer>;
};

/** Byte-only engine surface consumed by the runner-independent assertion client. @public */
export type GeoSpecNativeEngine = {
  evaluateClaim(request: Uint8Array<ArrayBuffer>): GeoSpecNativeClaimEvaluation;
  processRequest(request: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
};

/** Content-addressed subject accepted by a protocol-3 assertion plan. @public */
export type GeoSpecNativeSubject = {
  readonly contentHash?: string;
  readonly subjectHash?: string;
};

/** Polarity evaluated exactly once by the native core. @public */
export type GeoSpecClaimPolarity = 'negative' | 'positive';

/** Canonical claim status returned by the native core. @public */
export type GeoSpecCanonicalClaimStatus =
  | 'cancelled'
  | 'engine-error'
  | 'failed'
  | 'invalid'
  | 'passed'
  | 'refused'
  | 'unsupported'
  | (string & {});

/** Full native assertion result with the exact core-owned bytes retained. @public */
export type GeoSpecCanonicalClaimReport = {
  readonly canonicalClaim: Uint8Array<ArrayBuffer>;
  readonly canonicalPlan: Uint8Array<ArrayBuffer>;
  readonly canonicalResult: Uint8Array<ArrayBuffer>;
  readonly claim: Readonly<Record<string, JSONValue>>;
  readonly claimId: string;
  readonly diagnostics: readonly JSONValue[];
  readonly evidence?: JSONValue;
  readonly polarity: GeoSpecClaimPolarity;
  readonly result: Readonly<Record<string, JSONValue>>;
  readonly status: GeoSpecCanonicalClaimStatus;
};

/**
 * Success-evidence profile a product selects for its plans (PERF-OUTPUT-01).
 * `complete`, the default, keeps every evidence field. `bounded` keeps verdicts
 * and drops evidence that grows with the subject on success: component gaps
 * (nearest-neighbour gaps on failure), a closed mesh's per-primitive rows,
 * undeclared duplicate faces, and all but the first matching circular hole.
 * @public
 */
export type GeoSpecNativeEvidenceProfile = 'bounded' | 'complete';

type GeoSpecNativeClaimContext = {
  readonly claimId: string;
  readonly engine: GeoSpecNativeEngine;
  readonly evidenceProfile?: GeoSpecNativeEvidenceProfile;
  readonly polarity: GeoSpecClaimPolarity;
  readonly subject: GeoSpecNativeSubject;
  readonly subjectSlot: string;
  readonly workUnitLimit: number;
};

/** One authored matcher call lowered and evaluated by Rust in one engine call. @public */
export type GeoSpecNativeClaimOptions = GeoSpecNativeClaimContext &
  (
    | {
        readonly arguments: readonly unknown[];
        readonly capability: GeoSpecFixedMatcherName;
      }
    | {
        readonly arguments: readonly unknown[];
        readonly capability: string;
        readonly kind: string;
      }
  );

const geoSpecQueryCapabilities = [
  'analyzeMesh',
  'analyzeBrep',
  'inspectGeometry',
  'analyzeMeshOverlap',
  'queryPmi',
  'minimumDistance',
] as const;

/** Existing positive-only ancillary operations owned by the native core. @public */
export type GeoSpecQueryCapability = Exclude<(typeof geoSpecQueryCapabilities)[number], 'minimumDistance'>;

/**
 * Flat native query transport options. Payloads use the existing authoring
 * serializer, including ordinary RegExp values; omitted payloads encode null.
 * The core validates selectors, pairs and all operation-specific constraints.
 * @public
 */
export type GeoSpecNativeQueryOptions = Omit<
  GeoSpecNativeClaimOptions,
  'arguments' | 'capability' | 'kind' | 'polarity'
> & {
  readonly capability: GeoSpecQueryCapability | 'minimumDistance';
  readonly payload?: unknown;
};

type NativePayloadOptions = GeoSpecNativeClaimContext & {
  readonly capability: string;
  readonly payload: JSONValue;
};

const decodeNativeJson = (bytes: Uint8Array<ArrayBuffer>): JSONValue => {
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  assertGeoSpecJsonValue(value);
  return value;
};

const nativeInitializeRequest = new TextEncoder().encode(
  '{"canonicalProfile":"geospec-jcs-v1","method":"initialize","protocolVersion":3,"registryVersion":5,"requestId":"configuration"}',
);
const nativeDefaultWorkUnitLimits = new WeakMap<GeoSpecNativeEngine, number>();
const nativeMinimumDistanceSupport = new WeakMap<GeoSpecNativeEngine, boolean>();

const jsonRecord = (value: JSONValue, label: string): Record<string, JSONValue> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`GeoSpec engine returned a malformed ${label}.`);
  }
  return value;
};

const nativeSubjectBinding = (subject: GeoSpecNativeSubject, slot: string): JSONValue => {
  const { contentHash, subjectHash } = subject;
  if ((contentHash === undefined) === (subjectHash === undefined)) {
    throw new TypeError('A native GeoSpec subject requires exactly one of contentHash or subjectHash.');
  }
  const hash = contentHash ?? subjectHash!;
  if (!/^[0-9a-f]{64}$/u.test(hash)) {
    throw new TypeError('A native GeoSpec subject hash must contain 64 lowercase hexadecimal characters.');
  }
  return contentHash === undefined ? { slot, subjectHash: hash } : { slot, contentHash: hash };
};

const assertNativeWorkUnitLimit = (workUnitLimit: number): void => {
  if (!Number.isSafeInteger(workUnitLimit) || workUnitLimit <= 0 || workUnitLimit > maximumSafeWorkUnitLimit) {
    throw new TypeError('GeoSpec workUnitLimit must be a positive exact safe integer.');
  }
};

const assertNativeClaimOptions = (options: NativePayloadOptions): void => {
  if (options.claimId.length === 0 || options.subjectSlot.length === 0) {
    throw new TypeError('GeoSpec claim IDs and subject slots must be non-empty strings.');
  }
  assertNativeWorkUnitLimit(options.workUnitLimit);
};

/**
 * Resolve the caller override or the engine-owned default work-unit budget.
 *
 * The initialize response is requested at most once for each engine object.
 * Every submitted plan still receives an explicit workUnitBudget.
 *
 * @param engine - Native engine that owns the selected entry profile.
 * @param override - Optional caller-selected positive exact budget.
 * @returns The explicit work-unit budget for a claim.
 * @public
 */
export const resolveGeoSpecNativeWorkUnitLimit = (engine: GeoSpecNativeEngine, override?: number): number => {
  if (override !== undefined) {
    assertNativeWorkUnitLimit(override);
    return override;
  }
  const cached = nativeDefaultWorkUnitLimits.get(engine);
  if (cached !== undefined) {
    return cached;
  }
  const envelope = jsonRecord(
    decodeNativeJson(Uint8Array.from(engine.processRequest(Uint8Array.from(nativeInitializeRequest)))),
    'initialize response envelope',
  );
  if (envelope['requestId'] !== 'configuration') {
    throw new TypeError('GeoSpec engine returned an initialize response with the wrong requestId.');
  }
  const result = jsonRecord(envelope['result']!, 'initialize result');
  if (
    result['canonicalProfile'] !== nativeCanonicalProfile ||
    result['protocolVersion'] !== nativeProtocolVersion ||
    result['registryVersion'] !== nativeRegistryVersion
  ) {
    throw new TypeError('GeoSpec engine returned an initialize response for an incompatible protocol profile.');
  }
  const configuration = jsonRecord(result['configuration']!, 'initialize configuration');
  const { capabilities } = result;
  const advertised = Array.isArray(capabilities)
    ? capabilities.filter(
        (entry): entry is Record<string, JSONValue> =>
          entry !== null && typeof entry === 'object' && !Array.isArray(entry) && entry['name'] === 'minimumDistance',
      )
    : [];
  nativeMinimumDistanceSupport.set(
    engine,
    advertised.length === 1 &&
      advertised.every(
        (entry) =>
          entry['profile'] === 'geospec-minimum-distance-v1' &&
          entry['implementation'] === 'implemented' &&
          entry['registryVersion'] === nativeRegistryVersion,
      ),
  );
  if (configuration['configurationProfile'] !== 'geospec-entry-config-v1') {
    throw new TypeError('GeoSpec engine returned an unsupported configuration profile.');
  }
  const defaultWorkUnitLimit = configuration['defaultWorkUnitBudget'];
  if (typeof defaultWorkUnitLimit !== 'number') {
    throw new TypeError('GeoSpec engine initialize configuration omitted defaultWorkUnitBudget.');
  }
  assertNativeWorkUnitLimit(defaultWorkUnitLimit);
  nativeDefaultWorkUnitLimits.set(engine, defaultWorkUnitLimit);
  return defaultWorkUnitLimit;
};

/** Whether this engine explicitly advertises the complete minimum/witness profile. @public */
export const supportsGeoSpecNativeMinimumDistance = (engine: GeoSpecNativeEngine): boolean => {
  resolveGeoSpecNativeWorkUnitLimit(engine);
  return nativeMinimumDistanceSupport.get(engine) === true;
};

/**
 * Submit one authored matcher call through protocol 3.
 *
 * JavaScript only serializes authored arguments and transport identity. Rust
 * owns argument lowering, defaults, budgets, geometry, polarity and final
 * canonical bytes.
 *
 * @param options - Flat assertion transport options.
 * @returns The parsed claim and exact canonical claim, plan and result bytes.
 * @public
 */
export const evaluateGeoSpecNativeClaim = (options: GeoSpecNativeClaimOptions): GeoSpecCanonicalClaimReport => {
  if (options.capability === 'toSatisfyRationalPlate' || options.capability === 'toSatisfyParallelPlaneDistance') {
    if (options.arguments.length > 0) {
      throw new TypeError(`GeoSpec matcher ${options.capability} does not accept arguments.`);
    }
    return evaluateNativePayload({
      ...options,
      payload: { contract: geoSpecMatcherDescriptors[options.capability].contract },
    });
  }
  if (!('kind' in options)) {
    throw new TypeError('This GeoSpec matcher requires its canonical kind.');
  }
  return evaluateNativePayload({
    ...options,
    payload: {
      kind: options.kind,
      arguments: options.arguments.map((argument) => toGeoSpecProtocolJson(argument)),
    },
  });
};

/**
 * Submit an ancillary query with positive polarity through the native core.
 *
 * Queries return full reports even when failed or refused. Protocol errors
 * propagate unchanged. Rust owns defaults, validation and canonical encoding.
 *
 * @param options - Query identity, subject and authored payload.
 * @returns The complete report with exact canonical claim, plan and result bytes.
 * @public
 */
export const evaluateGeoSpecNativeQuery = (options: GeoSpecNativeQueryOptions): GeoSpecCanonicalClaimReport => {
  if (!geoSpecQueryCapabilities.includes(options.capability)) {
    throw new TypeError('GeoSpec query capability must name an ancillary operation.');
  }
  return evaluateNativePayload({
    ...options,
    payload: toGeoSpecProtocolJson(options.payload),
    polarity: 'positive',
  });
};

const evaluateNativePayload = (options: NativePayloadOptions): GeoSpecCanonicalClaimReport => {
  assertNativeClaimOptions(options);
  const request: JSONValue = {
    method: 'submitClaims',
    requestId: options.claimId,
    protocolVersion: nativeProtocolVersion,
    registryVersion: nativeRegistryVersion,
    canonicalProfile: nativeCanonicalProfile,
    plan: {
      subjects: [nativeSubjectBinding(options.subject, options.subjectSlot)],
      claims: [
        {
          claimId: options.claimId,
          capability: options.capability,
          subjectSlots: [options.subjectSlot],
          payload: options.payload,
          polarity: options.polarity,
          workUnitBudget: options.workUnitLimit,
        },
      ],
      ...(options.evidenceProfile === undefined ? {} : { evidenceProfile: options.evidenceProfile }),
    },
  };
  const { canonicalClaim, canonicalPlan, canonicalResult } = options.engine.evaluateClaim(
    new TextEncoder().encode(JSON.stringify(request)),
  );
  const claim = jsonRecord(decodeNativeJson(canonicalClaim), 'canonical claim');
  if (claim['claimId'] !== options.claimId) {
    throw new TypeError(`GeoSpec engine returned a malformed canonical claim for '${options.claimId}'.`);
  }
  const envelope = jsonRecord(decodeNativeJson(canonicalResult), 'canonical result envelope');
  const { results } = envelope;
  if (!Array.isArray(results) || results.length !== 1) {
    throw new TypeError('GeoSpec engine returned a canonical result envelope without exactly one result.');
  }
  const [resultValue] = results;
  const result = jsonRecord(resultValue!, 'canonical claim result');
  const { claimId, diagnostics, status } = result;
  if (claimId !== options.claimId || typeof status !== 'string' || !Array.isArray(diagnostics)) {
    throw new TypeError(`GeoSpec engine returned a malformed result for claim '${options.claimId}'.`);
  }
  return {
    canonicalClaim,
    canonicalPlan,
    canonicalResult,
    claim,
    claimId,
    diagnostics,
    ...(result['evidence'] === undefined ? {} : { evidence: result['evidence'] }),
    polarity: options.polarity,
    result,
    status,
  };
};
