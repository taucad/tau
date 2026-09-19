import { inspectProviderUnit, validateProviderUnit } from '#provider.js';

/** Stable diagnostic codes returned at units trust boundaries. @public */
export type UnitDiagnosticCode =
  | 'UNIT_INVALID'
  | 'UNIT_UNSUPPORTED'
  | 'UNIT_UNKNOWN'
  | 'DIMENSION_MISMATCH'
  | 'KIND_MISMATCH'
  | 'SPACE_MISMATCH'
  | 'SEMANTICS_UNRESOLVED'
  | 'METADATA_CONFLICT'
  | 'REPRESENTATION_UNSUPPORTED'
  | 'NUMERIC_OVERFLOW'
  | 'NUMERIC_UNDERFLOW'
  | 'CONSTRAINT_VIOLATION'
  | 'RESOURCE_LIMIT';

/** Structured diagnostic independent of translated UI prose. @public */
export type UnitDiagnostic = Readonly<{
  code: UnitDiagnosticCode;
  message: string;
  span?: Readonly<{ start: number; end: number }>;
  expected?: unknown;
  actual?: unknown;
}>;

/** Result of a checked units operation. @public */
export type UnitResult<T> =
  | Readonly<{ status: 'success'; value: T }>
  | Readonly<{ status: 'invalid' | 'unsupported' | 'indeterminate'; diagnostic: UnitDiagnostic }>;

/** Tau's SI basis, with angle retained as a checked semantic dimension. @public */
export type Dimension = Readonly<{
  length: number;
  time: number;
  mass: number;
  angle: number;
  temperature: number;
  electricCurrent: number;
  luminousIntensity: number;
  amountOfSubstance: number;
}>;

/** UCUM-LHC's internal charge basis, reported separately from SI. @public */
export type ProviderDimension = Readonly<{
  length: number;
  time: number;
  mass: number;
  angle: number;
  temperature: number;
  charge: number;
  luminousIntensity: number;
  amountOfSubstance: number;
}>;

/** Unit admitted by Tau's bounded UCUM execution profile. @public */
export type AdmittedUnit = Readonly<{
  code: string;
  dimension: Dimension;
  providerDimension: ProviderDimension;
  classification: 'linear' | 'affine-point';
  scale: number;
  profile: typeof unitProfile;
}>;

/** Initial immutable execution-profile identity and limits. @public */
export const unitProfile = 'tau-json-structure-units-03-v1';

/** Initial bounded UCUM admission limits. @public */
export const unitLimits = Object.freeze({ codeBytes: 128, exponentMagnitude: 64, expressionNodes: 128 });

const affinePointCodes = new Set(['Cel', '[degF]']);

const failure = <T>(
  status: 'invalid' | 'unsupported' | 'indeterminate',
  code: UnitDiagnosticCode,
  message: string,
): UnitResult<T> => ({ status, diagnostic: { code, message } });

const toSiDimension = (dimension: ProviderDimension): Dimension =>
  Object.freeze({
    length: dimension.length,
    time: dimension.time + dimension.charge,
    mass: dimension.mass,
    angle: dimension.angle,
    temperature: dimension.temperature,
    electricCurrent: dimension.charge,
    luminousIntensity: dimension.luminousIntensity,
    amountOfSubstance: dimension.amountOfSubstance,
  });

/**
 * Inspect and admit one complete, case-sensitive UCUM code.
 * @param code - Candidate UCUM code.
 * @returns A checked admitted unit or a structured diagnostic.
 * @public
 */
export function admitUnit(code: string): UnitResult<AdmittedUnit> {
  if (typeof code !== 'string' || code.length === 0 || code.trim() !== code) {
    return failure('invalid', 'UNIT_INVALID', 'UCUM code must be a non-empty string without surrounding space.');
  }
  if (new TextEncoder().encode(code).length > unitLimits.codeBytes) {
    return failure('invalid', 'RESOURCE_LIMIT', 'UCUM code exceeds the supported byte limit.');
  }
  if (/\{[^}]*\}/u.test(code)) {
    return failure('unsupported', 'UNIT_UNSUPPORTED', 'UCUM annotations are preserved but not executable.');
  }
  const exponents = [...code.matchAll(/(?:\^\()?([+-]?\d+)\)?/gu)].map((match) => Number(match[1]));
  if (exponents.some((value) => !Number.isSafeInteger(value) || Math.abs(value) > unitLimits.exponentMagnitude)) {
    return failure('invalid', 'RESOURCE_LIMIT', 'UCUM exponent exceeds the supported magnitude.');
  }

  const validationMessage = validateProviderUnit(code);
  if (validationMessage) {
    return failure('invalid', 'UNIT_INVALID', validationMessage);
  }
  const inspected = inspectProviderUnit(code);
  if (inspected.status !== 'success') {
    return inspected;
  }
  if (inspected.value.arbitrary) {
    return failure('unsupported', 'UNIT_UNSUPPORTED', 'Arbitrary UCUM units are outside the execution profile.');
  }
  if (inspected.value.special && !affinePointCodes.has(code)) {
    return failure('unsupported', 'UNIT_UNSUPPORTED', 'This special UCUM unit is outside the execution profile.');
  }

  return {
    status: 'success',
    value: Object.freeze({
      code,
      dimension: toSiDimension(inspected.value.dimension),
      providerDimension: inspected.value.dimension,
      classification: affinePointCodes.has(code) ? 'affine-point' : 'linear',
      scale: inspected.value.magnitude,
      profile: unitProfile,
    }),
  };
}
