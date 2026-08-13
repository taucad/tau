/**
 * Shared matcher plumbing.
 *
 * Three rules run through every matcher body in this directory and are worth
 * stating once, here, rather than re-deriving per matcher:
 *
 * 1. **Fail closed.** A matcher returns diagnostics; an empty list is a pass.
 *    There is no third outcome at the collector, so "we could not decide this"
 *    must be an ERROR diagnostic that names the missing evidence
 *    ({@link evidenceUnsupported}) — never an empty list, and never a weaker
 *    substitute measurement.
 * 2. **Name the repair.** Every diagnostic carries a `suggestion` and a
 *    `details` payload an agent can act on without reading the geometry.
 * 3. **One tolerance vocabulary.** Millimetres and degrees, defaulting to the
 *    selector layer's {@link defaultSelectorTolerances} — the same numbers the
 *    proofs use, so a claim never means two things.
 *
 * @module
 */

import { defaultSelectorTolerances } from 'geospec/selector';
import type { GeoSpecMatcherInvocation } from '#matchers/types.js';
import type { GeometryDiagnostic, GeometrySubject, Vec3 } from '#mesh/types.js';
import type { GeoSpecAxisExpectation, GeoSpecNumericExpectation, GeoSpecPointExpectation } from '#runner/types.js';

/** Diagnostic code for a value that is not a loaded geometry subject. */
export const subjectUnsupportedCode = 'GEOSPEC_SUBJECT_UNSUPPORTED';

/** Diagnostic code for a claim the subject carries no evidence to decide. */
export const evidenceUnsupportedCode = 'GEOSPEC_EVIDENCE_UNSUPPORTED';

/** Default linear tolerance (mm) — the selector layer's, so there is only one. */
export const defaultLinearTolerance = defaultSelectorTolerances.linearMm;

/** Default angular tolerance (degrees). */
export const defaultAngularTolerance = defaultSelectorTolerances.angularToleranceDegrees;

/**
 * Build one matcher diagnostic.
 *
 * @param options - Code, message, repair and structured payload.
 * @returns The diagnostic.
 * @public
 */
export const matcherDiagnostic = (options: {
  code: string;
  message: string;
  suggestion: string;
  details?: unknown;
  spatial?: { min?: Vec3; max?: Vec3; center?: Vec3 };
}): GeometryDiagnostic => ({
  code: options.code,
  severity: 'error',
  message: options.message,
  suggestion: options.suggestion,
  ...(options.spatial ? { spatial: options.spatial } : {}),
  ...(options.details === undefined ? {} : { details: options.details }),
});

const isGeometrySubject = (value: unknown): value is GeometrySubject =>
  (value as { kind?: unknown } | undefined)?.kind === 'geometry-subject';

/**
 * The subject a matcher was called on, or the diagnostic explaining what it was
 * called on instead.
 *
 * @param invocation - The matcher invocation.
 * @returns The subject, or the single-element refusal.
 * @public
 */
export const matcherSubject = (
  invocation: GeoSpecMatcherInvocation,
): { subject: GeometrySubject } | { diagnostics: GeometryDiagnostic[] } => {
  if (isGeometrySubject(invocation.subject)) {
    return { subject: invocation.subject };
  }
  return {
    diagnostics: [
      matcherDiagnostic({
        code: subjectUnsupportedCode,
        message: `expectGeo(...).${invocation.matcher}() needs a GeoSpec geometry subject, but received ${describeValue(invocation.subject)}.`,
        suggestion: 'Await loadModel()/loadStep()/loadMesh() and pass the resolved subject to expectGeo().',
        details: { matcher: invocation.matcher },
      }),
    ],
  };
};

const describeValue = (value: unknown): string => {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  return typeof value === 'object' ? 'a plain object' : `a ${typeof value}`;
};

/**
 * The diagnostic for a claim this subject carries no evidence to decide.
 *
 * @param options - The matcher, what was missing, and the repair.
 * @returns The single-element diagnostic list.
 * @public
 */
export const evidenceUnsupported = (options: {
  matcher: string;
  missing: string;
  suggestion: string;
}): GeometryDiagnostic[] => [
  matcherDiagnostic({
    code: evidenceUnsupportedCode,
    message: `expectGeo(...).${options.matcher}() needs ${options.missing}, which this subject does not carry.`,
    suggestion: options.suggestion,
    details: { matcher: options.matcher, missing: options.missing },
  }),
];

/** The repair line for every claim that needs exact BRep evidence. */
export const brepSuggestion =
  'Load the model as STEP (`loadModel({ file, format: "step" })`) so GeoSpec has exact BRep evidence.';

/**
 * Whether a measured scalar satisfies a numeric expectation.
 *
 * A bare number (or a `value`) is an equality claim inside `tolerance`; the
 * comparison forms are exact bounds.
 *
 * @param measured - The measured value.
 * @param expected - The expectation.
 * @param tolerance - Equality tolerance.
 * @returns True when the expectation holds.
 * @public
 */
export const numericHolds = (measured: number, expected: GeoSpecNumericExpectation, tolerance: number): boolean => {
  if (typeof expected === 'number') {
    return Math.abs(measured - expected) <= tolerance;
  }
  if (expected.value !== undefined && Math.abs(measured - expected.value) > tolerance) {
    return false;
  }
  if (expected.greaterThan !== undefined && !(measured > expected.greaterThan)) {
    return false;
  }
  if (expected.greaterThanOrEqual !== undefined && !(measured >= expected.greaterThanOrEqual)) {
    return false;
  }
  if (expected.lessThan !== undefined && !(measured < expected.lessThan)) {
    return false;
  }
  return expected.lessThanOrEqual === undefined || measured <= expected.lessThanOrEqual;
};

/**
 * Render a numeric expectation for a failure message.
 *
 * @param expected - The expectation.
 * @returns A human-readable description.
 * @public
 */
export const describeNumeric = (expected: GeoSpecNumericExpectation): string => {
  if (typeof expected === 'number') {
    return String(expected);
  }
  const parts: string[] = [];
  if (expected.value !== undefined) {
    parts.push(String(expected.value));
  }
  if (expected.greaterThan !== undefined) {
    parts.push(`> ${expected.greaterThan}`);
  }
  if (expected.greaterThanOrEqual !== undefined) {
    parts.push(`>= ${expected.greaterThanOrEqual}`);
  }
  if (expected.lessThan !== undefined) {
    parts.push(`< ${expected.lessThan}`);
  }
  if (expected.lessThanOrEqual !== undefined) {
    parts.push(`<= ${expected.lessThanOrEqual}`);
  }
  return parts.length > 0 ? parts.join(' and ') : 'any value';
};

/**
 * The per-axis components of a point expectation, in `x, y, z` order.
 *
 * @param expected - A `Vec3` or an axis-keyed partial.
 * @returns The declared components; absent axes are `undefined`.
 * @public
 */
export const pointComponents = (
  expected: GeoSpecPointExpectation | GeoSpecAxisExpectation,
): Array<number | undefined> => {
  if (Array.isArray(expected)) {
    const vector = expected as Vec3;
    return [vector[0], vector[1], vector[2]];
  }
  const axes = expected as GeoSpecAxisExpectation;
  return [axes.x, axes.y, axes.z];
};

/** Axis labels in the order every measured triple uses. */
export const axisNames = ['x', 'y', 'z'] as const;

/**
 * Compare a measured point against a declared one, axis by axis.
 *
 * @param measured - The measured triple.
 * @param expected - The declared point.
 * @param tolerance - Per-axis tolerance.
 * @returns One entry per axis that failed.
 * @public
 */
export const pointFailures = (
  measured: readonly number[],
  expected: GeoSpecPointExpectation | GeoSpecAxisExpectation,
  tolerance: number,
): Array<{ axis: 'x' | 'y' | 'z'; expected: number; actual: number }> => {
  const failures: Array<{ axis: 'x' | 'y' | 'z'; expected: number; actual: number }> = [];
  for (const [axis, declared] of pointComponents(expected).entries()) {
    const actual = measured[axis] ?? Number.NaN;
    if (declared !== undefined && !(Math.abs(actual - declared) <= tolerance)) {
      failures.push({ axis: axisNames[axis]!, expected: declared, actual });
    }
  }
  return failures;
};

/**
 * Whether a component label matches a string or regular-expression selector.
 *
 * @param label - The component or occurrence label.
 * @param selector - The declared selector.
 * @returns True on an exact string match or a regular-expression hit.
 * @public
 */
export const labelMatches = (label: string, selector: string | RegExp): boolean =>
  typeof selector === 'string' ? label === selector : selector.test(label);

/** Render a selector for a failure message. */
export const describeSelector = (selector: string | RegExp): string =>
  typeof selector === 'string' ? selector : String(selector);
