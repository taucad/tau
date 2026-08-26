/** Host-side helpers for issuing one Contract-B claim. @module */

import type { JSONValue } from '@taucad/runtime/types';
import { encodeGeoSpecCanonicalJson, geoSpecMatcherRegistryVersion, toGeoSpecProtocolJson } from '#engine/protocol.js';
import type { GeoSpecClaimResult, GeoSpecSubjectId } from '#engine/protocol.js';
import { getGeoSpecEngineProtocol } from '#engine/registry.js';
import type { GeometryDiagnostic, Vec3 } from '#mesh/types.js';
import { defaultMatcherWallBackstop, resolveMatcherWorkUnitBudget } from '#runner/matcher-budget.js';

let nextRequest = 0;

/** Submit one canonical claim through the active engine protocol. */
export const submitGeoSpecClaim = (options: {
  capability: string;
  subjectIds?: readonly GeoSpecSubjectId[];
  payload?: JSONValue;
}): GeoSpecClaimResult | Promise<GeoSpecClaimResult> | undefined => {
  const protocol = getGeoSpecEngineProtocol();
  if (!protocol) {
    return undefined;
  }
  nextRequest += 1;
  const claimId = `claim-${nextRequest}`;
  const claim: JSONValue = {
    claimId,
    capability: options.capability,
    subjectIds: [...(options.subjectIds ?? [])],
    payload: options.payload ?? null,
    workUnitBudget: resolveMatcherWorkUnitBudget(options.capability),
  };
  const submitted = protocol.submitClaims({
    requestId: claimId,
    registryVersion: geoSpecMatcherRegistryVersion,
    execution: { forensic: false, matcherWallBackstop: defaultMatcherWallBackstop },
    claims: [encodeGeoSpecCanonicalJson(claim)],
  });
  const first = (result: Awaited<typeof submitted>): GeoSpecClaimResult => {
    const claimResult = result.results[0];
    if (claimResult === undefined) {
      throw new Error(`GeoSpec engine returned no result for '${claimId}'.`);
    }
    return claimResult;
  };
  if (!(submitted instanceof Promise)) {
    return first(submitted);
  }
  return (async () => first(await submitted))();
};

/** Extract an opaque subject ID or fail at the host/protocol boundary. */
export const geoSpecSubjectId = (subject: unknown): GeoSpecSubjectId => {
  const subjectId: unknown =
    typeof subject === 'object' && subject !== null ? Reflect.get(subject, 'subjectId') : undefined;
  if (typeof subjectId !== 'string') {
    throw new TypeError('Expected an ingested GeoSpec subject reference.');
  }
  return subjectId;
};

/** Protocol JSON adapter re-exported for facade payloads. */
export const geoSpecClaimJson = (value: unknown): JSONValue => toGeoSpecProtocolJson(value);

/** Narrow a JSON value to an object at a facade trust boundary. */
export const isGeoSpecJsonRecord = (value: JSONValue | undefined): value is Record<string, JSONValue> =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

const vec3 = (value: JSONValue | undefined): Vec3 | undefined =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number')
    ? [value[0]!, value[1]!, value[2]!]
    : undefined;

/** Diagnostic used when an engine violates its advertised result schema. */
export const geoSpecProtocolViolation = (message: string): GeometryDiagnostic => ({
  code: 'GEOSPEC_ENGINE_CONTRACT_VIOLATION',
  severity: 'error',
  message,
  suggestion: 'Use an engine build that conforms to the active GeoSpec protocol version.',
});

const diagnostic = (value: JSONValue): GeometryDiagnostic | undefined => {
  if (!isGeoSpecJsonRecord(value)) {
    return undefined;
  }
  const { code, severity, message } = value;
  if (
    typeof code !== 'string' ||
    (severity !== 'error' && severity !== 'warning' && severity !== 'info') ||
    typeof message !== 'string'
  ) {
    return undefined;
  }
  const { suggestion, spatial: spatialValue } = value;
  const spatial = isGeoSpecJsonRecord(spatialValue)
    ? {
        ...(vec3(spatialValue['min']) === undefined ? {} : { min: vec3(spatialValue['min']) }),
        ...(vec3(spatialValue['max']) === undefined ? {} : { max: vec3(spatialValue['max']) }),
        ...(vec3(spatialValue['center']) === undefined ? {} : { center: vec3(spatialValue['center']) }),
      }
    : undefined;
  return {
    code,
    severity,
    message,
    ...(typeof suggestion === 'string' ? { suggestion } : {}),
    ...(spatial === undefined ? {} : { spatial }),
    ...(value['details'] === undefined ? {} : { details: value['details'] }),
  };
};

/** Decode and validate protocol diagnostics into the public vocabulary. */
export const geoSpecClaimDiagnostics = (result: GeoSpecClaimResult): GeometryDiagnostic[] => {
  const diagnostics: GeometryDiagnostic[] = [];
  for (const value of result.diagnostics) {
    const parsed = diagnostic(value);
    if (parsed === undefined) {
      return [geoSpecProtocolViolation(`The engine returned malformed diagnostics for claim '${result.claimId}'.`)];
    }
    diagnostics.push(parsed);
  }
  return diagnostics;
};
