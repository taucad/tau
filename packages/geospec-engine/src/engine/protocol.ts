/** Contract-B implementation for the Wave-1 TypeScript engine. @module */

import type { JSONValue } from '@taucad/runtime/types';
import { sha256Bytes } from '@taucad/runtime/kernel';
import {
  assertGeoSpecJsonValue,
  decodeGeoSpecCanonicalJson,
  geoSpecEngineProtocolVersion,
  geoSpecMatcherDescriptors,
  geoSpecMatcherRegistryVersion,
} from 'geospec/engine';
import type {
  GeoSpecClaim,
  GeoSpecClaimResult,
  GeoSpecEngineProtocol,
  GeoSpecInitializeResult,
  GeoSpecProtocolEvent,
  GeoSpecSubmitClaimsRequest,
  GeoSpecSubmitClaimsResult,
} from 'geospec/engine';
import type { GeometryDiagnostic, GeometrySubject } from '#mesh/types.js';
import { loadMesh } from '#mesh/load-mesh.js';
import { analyzeMeshOverlap } from '#mesh/overlap.js';
import { geoSpecMatcherImplementations } from '#matchers/implementations.js';
import type { GeoSpecMatcherInvocation } from '#matchers/types.js';
import { inspectGeometry } from '#inspection/inspect.js';
import { loadStep } from '#step/load-step.js';
import { releaseEngineSubject, resolveEngineSubject, retainEngineSubject } from '#engine/subject-store.js';
import type { ForensicSink } from '#runner/forensic.js';

const isRecord = (value: JSONValue): value is Record<string, JSONValue> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const requiredString = (record: Record<string, JSONValue>, key: string): string => {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new TypeError(`GeoSpec claim '${key}' must be a string.`);
  }
  return value;
};

const requiredStringArray = (record: Record<string, JSONValue>, key: string): string[] => {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new TypeError(`GeoSpec claim '${key}' must be a string array.`);
  }
  return value;
};

export const decodeProtocolClaim = (bytes: Uint8Array<ArrayBuffer>): GeoSpecClaim => {
  const value = decodeGeoSpecCanonicalJson(bytes);
  if (!isRecord(value)) {
    throw new TypeError('GeoSpec claim bytes must encode an object.');
  }
  const { workUnitBudget } = value;
  if (typeof workUnitBudget !== 'number' || workUnitBudget <= 0) {
    throw new TypeError("GeoSpec claim 'workUnitBudget' must be a positive finite number.");
  }
  return {
    claimId: requiredString(value, 'claimId'),
    capability: requiredString(value, 'capability'),
    subjectIds: requiredStringArray(value, 'subjectIds'),
    payload: value['payload'] ?? null,
    workUnitBudget,
  };
};

type NumberTypedArray =
  | Int8Array<ArrayBuffer>
  | Uint8Array<ArrayBuffer>
  | Uint8ClampedArray<ArrayBuffer>
  | Int16Array<ArrayBuffer>
  | Uint16Array<ArrayBuffer>
  | Int32Array<ArrayBuffer>
  | Uint32Array<ArrayBuffer>
  | Float32Array<ArrayBuffer>
  | Float64Array<ArrayBuffer>;

const isNumberTypedArray = (value: unknown): value is NumberTypedArray =>
  value instanceof Int8Array ||
  value instanceof Uint8Array ||
  value instanceof Uint8ClampedArray ||
  value instanceof Int16Array ||
  value instanceof Uint16Array ||
  value instanceof Int32Array ||
  value instanceof Uint32Array ||
  value instanceof Float32Array ||
  value instanceof Float64Array;

export function protocolWireValue(
  value: Record<string, unknown>,
  ancestors?: WeakSet<WeakKey>,
): Record<string, JSONValue>;
export function protocolWireValue(value: unknown, ancestors?: WeakSet<WeakKey>): JSONValue;
/**
 *
 */
export function protocolWireValue(value: unknown, ancestors = new WeakSet()): JSONValue {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('GeoSpec engine emitted a non-finite number.');
    }
    return value;
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  if (value instanceof RegExp) {
    return { type: 'regexp', pattern: value.source, flags: value.flags };
  }
  if (isNumberTypedArray(value)) {
    return [...value];
  }
  if (typeof value !== 'object' || ancestors.has(value)) {
    throw new TypeError('GeoSpec engine emitted a non-wire value.');
  }
  ancestors.add(value);
  if (Array.isArray(value)) {
    const result = value.map((entry) => protocolWireValue(entry, ancestors));
    ancestors.delete(value);
    return result;
  }
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('GeoSpec engine emitted a non-plain object.');
  }
  const result: Record<string, JSONValue> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = protocolWireValue(entry, ancestors);
    }
  }
  ancestors.delete(value);
  return result;
}

export const protocolEngineValue = (value: JSONValue): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) => protocolEngineValue(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  if (value['type'] === 'subject-reference') {
    const subjectId = requiredString(value, 'subjectId');
    const subject = resolveEngineSubject(subjectId);
    if (subject === undefined) {
      throw new Error(`GeoSpec subject '${subjectId}' has not been ingested or was released.`);
    }
    return subject;
  }
  if (value['type'] === 'regexp') {
    return new RegExp(requiredString(value, 'pattern'), requiredString(value, 'flags'));
  }
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, protocolEngineValue(entry)]));
};

const resultProvenance = (engineVersion: string): JSONValue => ({
  engine: '@taucad/geospec-engine',
  version: engineVersion,
  protocolVersion: geoSpecEngineProtocolVersion,
});

const failedClaim = (claimId: string, error: unknown, engineVersion: string): GeoSpecClaimResult => ({
  claimId,
  status: 'refused',
  diagnostics: [
    {
      code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
      severity: 'error',
      message: error instanceof Error ? error.message : String(error),
      suggestion: 'Send canonical JSON claims that reference retained engine subjects.',
    },
  ],
  provenance: resultProvenance(engineVersion),
});

type EvaluationContext = {
  engineVersion: string;
  cancelledClaims: ReadonlySet<string>;
  forensic?: ForensicSink;
};

const evaluateMatcherClaim = (
  claim: GeoSpecClaim,
  context: EvaluationContext,
): GeoSpecClaimResult | Promise<GeoSpecClaimResult> => {
  const { engineVersion } = context;
  if (context.cancelledClaims.has(claim.claimId)) {
    return {
      claimId: claim.claimId,
      status: 'cancelled',
      diagnostics: [],
      provenance: resultProvenance(engineVersion),
    };
  }
  if (!isRecord(claim.payload)) {
    return failedClaim(claim.claimId, new TypeError('Matcher claim payload must be an object.'), engineVersion);
  }
  const matcher = claim.capability as keyof typeof geoSpecMatcherImplementations;
  const implementation = geoSpecMatcherImplementations[matcher];
  if (implementation === undefined) {
    return failedClaim(
      claim.claimId,
      new Error(`GeoSpec engine does not implement '${claim.capability}'.`),
      engineVersion,
    );
  }
  const [subjectId] = claim.subjectIds;
  const subject = subjectId === undefined ? undefined : resolveEngineSubject(subjectId);
  if (subject === undefined) {
    return failedClaim(
      claim.claimId,
      new Error(`GeoSpec subject '${subjectId}' has not been ingested or was released.`),
      engineVersion,
    );
  }
  const argumentsValue = claim.payload['arguments'];
  const arguments_ = Array.isArray(argumentsValue) ? argumentsValue.map((entry) => protocolEngineValue(entry)) : [];
  const kind = requiredString(claim.payload, 'kind');
  const descriptor = geoSpecMatcherDescriptors[matcher];
  if (kind !== descriptor.kind) {
    return failedClaim(
      claim.claimId,
      new TypeError(`Matcher '${matcher}' requires assertion kind '${descriptor.kind}', received '${kind}'.`),
      engineVersion,
    );
  }
  const invocation: GeoSpecMatcherInvocation = {
    protocolVersion: geoSpecEngineProtocolVersion,
    matcher,
    kind: descriptor.kind,
    subject,
    arguments: arguments_,
    expected: protocolEngineValue(claim.payload['expected'] ?? null),
    ...(context.forensic === undefined ? {} : { forensic: context.forensic }),
  };
  const settle = (diagnostics: readonly GeometryDiagnostic[]): GeoSpecClaimResult => ({
    claimId: claim.claimId,
    status: diagnostics.length === 0 ? 'passed' : 'failed',
    diagnostics: diagnostics.map((diagnostic) => protocolWireValue(diagnostic)),
    provenance: resultProvenance(engineVersion),
  });
  const evaluated = implementation(invocation);
  if (!(evaluated instanceof Promise)) {
    return settle(evaluated);
  }
  return (async () => settle(await evaluated))();
};

const operationResult = (
  claim: GeoSpecClaim,
  value: Record<string, unknown> & { diagnostics: readonly GeometryDiagnostic[] },
  engineVersion: string,
): GeoSpecClaimResult => {
  const wire = protocolWireValue(value);
  const diagnostics = value.diagnostics.map((diagnostic) => protocolWireValue(diagnostic));
  const { success } = wire;
  return {
    claimId: claim.claimId,
    status: success === false || diagnostics.length > 0 ? 'failed' : 'passed',
    diagnostics,
    evidence: wire,
    provenance: resultProvenance(engineVersion),
  };
};

const evaluateOperationClaim = (
  claim: GeoSpecClaim,
  context: EvaluationContext,
): GeoSpecClaimResult | Promise<GeoSpecClaimResult> => {
  const { engineVersion } = context;
  const [subjectId] = claim.subjectIds;
  const subject = subjectId === undefined ? undefined : resolveEngineSubject(subjectId);
  const payload = protocolEngineValue(claim.payload);
  switch (claim.capability) {
    case 'analyzeBrep': {
      const value: Record<string, unknown> & { diagnostics: readonly GeometryDiagnostic[] } =
        subject?.brep === undefined
          ? {
              success: false,
              diagnostics: [
                {
                  code: 'GEOSPEC_BREP_EVIDENCE_UNAVAILABLE',
                  severity: 'error',
                  message: 'The ingested subject carries no BRep evidence.',
                  suggestion: 'Ingest STEP/AP242 evidence before requesting BRep analysis.',
                },
              ],
            }
          : { success: true, brep: subject.brep, diagnostics: [] };
      return operationResult(claim, value, engineVersion);
    }
    case 'inspectGeometry': {
      if (subject === undefined || !isRecord(claim.payload)) {
        return failedClaim(claim.claimId, new Error('inspectGeometry requires a retained subject.'), engineVersion);
      }
      const options = payload as Parameters<typeof inspectGeometry>[0];
      return operationResult(claim, inspectGeometry({ ...options, subject }), engineVersion);
    }
    case 'analyzeMeshOverlap': {
      if (subject === undefined || !isRecord(claim.payload)) {
        return failedClaim(claim.claimId, new Error('analyzeMeshOverlap requires a retained subject.'), engineVersion);
      }
      const options = payload as Parameters<typeof analyzeMeshOverlap>[0];
      return (async () =>
        operationResult(claim, await analyzeMeshOverlap({ ...options, subject }, context.forensic), engineVersion))();
    }
    default: {
      return failedClaim(
        claim.claimId,
        new Error(`GeoSpec engine does not implement '${claim.capability}'.`),
        engineVersion,
      );
    }
  }
};

const evaluateClaim = (
  claim: GeoSpecClaim,
  context: EvaluationContext,
): GeoSpecClaimResult | Promise<GeoSpecClaimResult> =>
  Object.hasOwn(geoSpecMatcherImplementations, claim.capability)
    ? evaluateMatcherClaim(claim, context)
    : evaluateOperationClaim(claim, context);

const evaluateClaimSafely = (
  claim: GeoSpecClaim,
  context: EvaluationContext,
): GeoSpecClaimResult | Promise<GeoSpecClaimResult> => {
  try {
    const result = evaluateClaim(claim, context);
    if (!(result instanceof Promise)) {
      return result;
    }
    return (async () => {
      try {
        return await result;
      } catch (error) {
        return failedClaim(claim.claimId, error, context.engineVersion);
      }
    })();
  } catch (error) {
    return failedClaim(claim.claimId, error, context.engineVersion);
  }
};

const initializeResult = (engineVersion: string): GeoSpecInitializeResult => ({
  protocolVersion: geoSpecEngineProtocolVersion,
  engine: { name: '@taucad/geospec-engine', version: engineVersion },
  determinism: 'reference-wasm',
  capabilities: [
    ...Object.keys(geoSpecMatcherImplementations),
    'analyzeBrep',
    'inspectGeometry',
    'analyzeMeshOverlap',
  ].map((name) => ({ name, registryVersion: geoSpecMatcherRegistryVersion })),
  provenance: {
    license: 'FSL-1.1-Apache-2.0',
    licenseConversionDate: '2028-08-10',
  },
});

const assertExecutionOptions = (request: GeoSpecSubmitClaimsRequest): void => {
  if (typeof request.execution.forensic !== 'boolean') {
    throw new TypeError("GeoSpec execution option 'forensic' must be boolean.");
  }
  if (!Number.isFinite(request.execution.matcherWallBackstop) || request.execution.matcherWallBackstop <= 0) {
    throw new TypeError("GeoSpec execution option 'matcherWallBackstop' must be a positive finite number.");
  }
};

/** Construct the protocol implementation registered by this build. */
export const createGeoSpecEngineProtocol = (engineVersion: string): GeoSpecEngineProtocol => {
  const cancelledRequests = new Set<string>();
  const cancelledClaims = new Set<string>();
  const listeners = new Set<(event: GeoSpecProtocolEvent) => void>();
  const emit = (event: GeoSpecProtocolEvent): void => {
    for (const listener of listeners) {
      listener(event);
    }
  };
  return {
    initialize(request) {
      if (request.protocolVersion !== geoSpecEngineProtocolVersion) {
        throw new Error(
          `GeoSpec engine protocol v${request.protocolVersion} is incompatible with v${geoSpecEngineProtocolVersion}.`,
        );
      }
      return initializeResult(engineVersion);
    },

    async ingestSubject(request, bytes) {
      assertGeoSpecJsonValue(request.provenance);
      assertGeoSpecJsonValue(request.options);
      const contentHash = `sha256:${await sha256Bytes(bytes)}`;
      if (request.contentHash !== contentHash) {
        throw new TypeError(`GeoSpec subject hash mismatch: expected ${contentHash}, received ${request.contentHash}.`);
      }
      let subject: GeometrySubject;
      if (request.format === 'step' || request.format === 'stp') {
        subject = await loadStep({ source: bytes });
      } else {
        const result = await loadMesh({
          source: bytes,
          format: request.format,
          sourceUnit: request.frame.sourceUnit,
          unit: request.frame.targetUnit,
        });
        if (!result.success) {
          throw new Error(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n'));
        }
        subject = result.subject;
      }
      subject.provenance.contentHash = contentHash;
      return { requestId: request.requestId, subject: retainEngineSubject(subject) };
    },

    submitClaims(request): GeoSpecSubmitClaimsResult | Promise<GeoSpecSubmitClaimsResult> {
      if (request.registryVersion !== geoSpecMatcherRegistryVersion) {
        throw new Error(
          `GeoSpec matcher registry v${request.registryVersion} is incompatible with v${geoSpecMatcherRegistryVersion}.`,
        );
      }
      assertExecutionOptions(request);
      const startedAt = request.execution.forensic ? performance.now() : undefined;
      const forensic: ForensicSink | undefined = request.execution.forensic
        ? (measurement) => {
            emit({ requestId: request.requestId, kind: 'forensic-span', payload: measurement });
          }
        : undefined;
      const complete = (result: GeoSpecSubmitClaimsResult): GeoSpecSubmitClaimsResult => {
        if (startedAt !== undefined) {
          emit({
            requestId: request.requestId,
            kind: 'forensic-span',
            payload: {
              name: 'engine.claims',
              value: performance.now() - startedAt,
              unit: 'milliseconds',
            },
          });
        }
        return result;
      };
      const claims = request.claims.map((bytes) => decodeProtocolClaim(bytes));
      if (cancelledRequests.has(request.requestId)) {
        return complete({
          requestId: request.requestId,
          results: claims.map((claim) => ({
            claimId: claim.claimId,
            status: 'cancelled',
            diagnostics: [],
            provenance: resultProvenance(engineVersion),
          })),
        });
      }
      const results: Array<GeoSpecClaimResult | Promise<GeoSpecClaimResult>> = [];
      for (const claim of claims) {
        results.push(evaluateClaimSafely(claim, { engineVersion, cancelledClaims, ...(forensic ? { forensic } : {}) }));
      }
      if (results.some((result) => result instanceof Promise)) {
        return (async () => {
          const settled = await Promise.all(results);
          return complete({ requestId: request.requestId, results: settled });
        })();
      }
      return complete({
        requestId: request.requestId,
        results: results.filter((result): result is GeoSpecClaimResult => !(result instanceof Promise)),
      });
    },

    cancel(request) {
      if (request.claimId === undefined) {
        cancelledRequests.add(request.requestId);
      } else {
        cancelledClaims.add(request.claimId);
      }
      return { requestId: request.requestId, cancelled: true };
    },

    releaseSubject(request) {
      return {
        requestId: request.requestId,
        released: releaseEngineSubject(request.subjectId),
      };
    },

    on(event, handler) {
      const listener = (candidate: GeoSpecProtocolEvent): void => {
        if (candidate.kind === event) {
          handler(candidate as Extract<GeoSpecProtocolEvent, { kind: typeof event }>);
        }
      };
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
