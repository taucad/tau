/**
 * Contract B: the language-neutral GeoSpec engine protocol.
 *
 * Requests and responses contain only JSON values, opaque string identifiers,
 * and the explicitly allowed byte lanes. Live TypeScript objects belong to a
 * host adapter or to the engine subject store; they never appear here.
 *
 * @module
 */

import type { JSONValue } from '@taucad/runtime/types';

/** Contract-B protocol version spoken by this substrate. @public */
export const geoSpecEngineProtocolVersion = 2;

/** Registry version consumed by the Wave-1 matcher vocabulary. @public */
export const geoSpecMatcherRegistryVersion = 3;

/** Opaque request identifier. @public */
export type GeoSpecRequestId = string;
/** Opaque claim identifier. @public */
export type GeoSpecClaimId = string;
/** Opaque engine-owned subject identifier. @public */
export type GeoSpecSubjectId = string;

/** Determinism class negotiated during initialization (DL6). @public */
export type GeoSpecDeterminismClass = 'reference-wasm' | 'bit-parity-verified' | 'defers-to-reference';

/** Client half of the Contract-B initialization handshake. @public */
export type GeoSpecInitializeRequest = {
  readonly protocolVersion: number;
  readonly client: {
    readonly name: string;
    readonly version: string;
  };
};

/** One capability honestly advertised by an engine build. @public */
export type GeoSpecProtocolCapability = {
  readonly name: string;
  readonly registryVersion: number;
};

/** Serializable build provenance returned by initialization. @public */
export type GeoSpecProtocolProvenance = {
  readonly engineDigest?: string;
  readonly build?: JSONValue;
  readonly license?: string;
};

/** Engine half of the Contract-B initialization handshake. @public */
export type GeoSpecInitializeResult = {
  readonly protocolVersion: number;
  readonly engine: {
    readonly name: string;
    readonly version: string;
  };
  readonly determinism: GeoSpecDeterminismClass;
  readonly capabilities: readonly GeoSpecProtocolCapability[];
  readonly provenance: GeoSpecProtocolProvenance;
};

/** Canonical frame attached to bytes entering the engine. @public */
export type GeoSpecSubjectFrame = {
  readonly coordinateSystem: 'z-up';
  readonly sourceUnit: string;
  readonly targetUnit: 'mm';
};

/** Metadata lane for subject ingestion; bytes travel separately. @public */
export type GeoSpecIngestSubjectRequest = {
  readonly requestId: GeoSpecRequestId;
  readonly contentHash: string;
  readonly format: 'glb' | 'gltf' | 'step' | 'stp';
  readonly frame: GeoSpecSubjectFrame;
  readonly provenance: JSONValue;
  readonly options: JSONValue;
};

/** Opaque subject handle returned after ingestion. @public */
export type GeoSpecSubjectReference = {
  readonly kind: 'geometry-subject-reference';
  readonly subjectId: GeoSpecSubjectId;
  readonly contentHash: string;
};

/** Subject-ingestion response. @public */
export type GeoSpecIngestSubjectResult = {
  readonly requestId: GeoSpecRequestId;
  readonly subject: GeoSpecSubjectReference;
};

/** Canonical JSON payload encoded into one claim byte lane. @public */
export type GeoSpecClaim = {
  readonly claimId: GeoSpecClaimId;
  readonly capability: string;
  readonly subjectIds: readonly GeoSpecSubjectId[];
  readonly payload: JSONValue;
  readonly workUnitBudget: number;
};

/** Resolved operational controls carried outside canonical claim bytes. @public */
export type GeoSpecExecutionOptions = {
  readonly forensic: boolean;
  readonly matcherWallBackstop: number;
};

/** A canonical claim batch. The engine parses but never re-canonicalizes it. @public */
export type GeoSpecSubmitClaimsRequest = {
  readonly requestId: GeoSpecRequestId;
  readonly registryVersion: number;
  readonly execution: GeoSpecExecutionOptions;
  readonly claims: ReadonlyArray<Uint8Array<ArrayBuffer>>;
};

/** One serializable claim result. @public */
export type GeoSpecClaimResult = {
  readonly claimId: GeoSpecClaimId;
  readonly status: 'passed' | 'failed' | 'refused' | 'cancelled';
  readonly diagnostics: readonly JSONValue[];
  readonly evidence?: JSONValue;
  readonly provenance: JSONValue;
};

/** Claim-batch response. @public */
export type GeoSpecSubmitClaimsResult = {
  readonly requestId: GeoSpecRequestId;
  readonly results: readonly GeoSpecClaimResult[];
};

/** Per-request or per-claim cancellation. @public */
export type GeoSpecCancelRequest = {
  readonly requestId: GeoSpecRequestId;
  readonly claimId?: GeoSpecClaimId;
};

/** Idempotent cancellation acknowledgement. @public */
export type GeoSpecCancelResult = {
  readonly requestId: GeoSpecRequestId;
  readonly cancelled: boolean;
};

/** Idempotent subject-release request. @public */
export type GeoSpecReleaseSubjectRequest = {
  readonly requestId: GeoSpecRequestId;
  readonly subjectId: GeoSpecSubjectId;
};

/** Subject-release acknowledgement. @public */
export type GeoSpecReleaseSubjectResult = {
  readonly requestId: GeoSpecRequestId;
  readonly released: boolean;
};

/** Advisory event; events never affect a verdict. @public */
export type GeoSpecProtocolEvent =
  | { readonly requestId: GeoSpecRequestId; readonly kind: 'progress'; readonly payload: JSONValue }
  | { readonly requestId: GeoSpecRequestId; readonly kind: 'forensic-span'; readonly payload: JSONValue }
  | { readonly requestId: GeoSpecRequestId; readonly kind: 'cache'; readonly payload: JSONValue };

/**
 * First TypeScript binding of Contract B.
 *
 * The methods are transport operations; every data type they exchange is a
 * protocol DTO above. `Uint8Array` is the one ratified bulk lane.
 *
 * @public
 */
export type GeoSpecEngineProtocol = {
  initialize(request: GeoSpecInitializeRequest): GeoSpecInitializeResult;
  ingestSubject(
    request: GeoSpecIngestSubjectRequest,
    bytes: Uint8Array<ArrayBuffer>,
  ): Promise<GeoSpecIngestSubjectResult>;
  submitClaims(request: GeoSpecSubmitClaimsRequest): GeoSpecSubmitClaimsResult | Promise<GeoSpecSubmitClaimsResult>;
  cancel(request: GeoSpecCancelRequest): GeoSpecCancelResult;
  releaseSubject(request: GeoSpecReleaseSubjectRequest): GeoSpecReleaseSubjectResult;
  on<Kind extends GeoSpecProtocolEvent['kind']>(
    event: Kind,
    handler: (event: Extract<GeoSpecProtocolEvent, { kind: Kind }>) => void,
  ): () => void;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/** Runtime JSON-value guard used at every protocol trust boundary. @public */
export const isGeoSpecJsonValue = (value: unknown, ancestors = new Set<WeakKey>()): value is JSONValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (!Array.isArray(value) && !isPlainObject(value)) {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => isGeoSpecJsonValue(entry, ancestors))
    : isPlainObject(value) && Object.values(value).every((entry) => isGeoSpecJsonValue(entry, ancestors));
  ancestors.delete(value);
  return valid;
};

/** Reject a non-wire value rather than letting JSON.stringify erase it. @public */
export const assertGeoSpecJsonValue: (value: unknown) => asserts value is JSONValue = (value) => {
  if (!isGeoSpecJsonValue(value)) {
    throw new TypeError('GeoSpec protocol values must contain only finite JSON data.');
  }
};

const canonicalizeJson = (value: JSONValue): JSONValue => {
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalizeJson(entry));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalizeJson(entry)]),
    );
  }
  return value;
};

/** Encode client-owned canonical claim bytes. @public */
export const encodeGeoSpecCanonicalJson = (value: JSONValue): Uint8Array<ArrayBuffer> => {
  assertGeoSpecJsonValue(value);
  return new TextEncoder().encode(JSON.stringify(canonicalizeJson(value)));
};

/** Parse and validate canonical bytes without re-canonicalizing them. @public */
export const decodeGeoSpecCanonicalJson = (bytes: Uint8Array<ArrayBuffer>): JSONValue => {
  const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
  assertGeoSpecJsonValue(value);
  return value;
};

/**
 * Convert an authoring value to protocol JSON, including the two explicit
 * bindings the TypeScript client needs: regex data and opaque subject refs.
 * Unsupported live objects fail before a request reaches the engine.
 *
 * @public
 */
export const toGeoSpecProtocolJson = (value: unknown, ancestors = new Set<WeakKey>()): JSONValue => {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('GeoSpec claims cannot contain non-finite numbers.');
    }
    return value;
  }
  if (value instanceof RegExp) {
    return { type: 'regexp', pattern: value.source, flags: value.flags };
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw new TypeError('GeoSpec claims cannot contain functions, symbols, bigint values, or cycles.');
  }
  const subjectId: unknown = Reflect.get(value, 'subjectId');
  if (typeof subjectId === 'string') {
    return { type: 'subject-reference', subjectId };
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry) => toGeoSpecProtocolJson(entry, ancestors));
    ancestors.delete(value);
    return result;
  }
  if (!isPlainObject(value)) {
    throw new TypeError('GeoSpec claims cannot contain class instances.');
  }
  const result: Record<string, JSONValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = toGeoSpecProtocolJson(entry, ancestors);
    }
  }
  ancestors.delete(value);
  return result;
};
