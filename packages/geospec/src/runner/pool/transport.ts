/**
 * Worker-boundary result transport (R3).
 *
 * A `GeoSpecRunResult` from the serial engine holds live geometry subjects
 * (native wasm handles) on `assertion.subject` — not structured-clone-safe.
 * The pool consumes only the reporting surface (names, statuses, diagnostics,
 * durations), so results are sanitized before crossing the worker wire:
 * subjects/expected are dropped, diagnostics are made clone-safe, and the
 * bundle's (potentially multi-MB) code string is elided. Artifact payloads
 * (STEP/GLB bytes) never ride these messages — cross-worker geometry sharing
 * happens only through the content-addressed filesystem caches (B8).
 */

import type { GeometryDiagnostic } from '#mesh/types.js';
import type { GeoSpecAssertion, GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

const jsonSafe = <T>(value: T): T | undefined => {
  if (value === undefined) {
    return undefined;
  }
  try {
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- deliberate: the JSON round-trip DROPS functions and non-serializable members that structuredClone would throw on.
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return undefined;
  }
};

const sanitizeDiagnostic = (diagnostic: GeometryDiagnostic): GeometryDiagnostic => ({
  code: diagnostic.code,
  severity: diagnostic.severity,
  message: diagnostic.message,
  ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
  ...(diagnostic.spatial === undefined ? {} : { spatial: jsonSafe(diagnostic.spatial) }),
  ...(diagnostic.details === undefined ? {} : { details: jsonSafe(diagnostic.details) }),
});

const sanitizeAssertion = (assertion: GeoSpecAssertion): GeoSpecAssertion => ({
  kind: assertion.kind,
  // Live geometry subjects (native handles) cannot and must not cross the
  // worker wire; the reporting surface never reads them.
  subject: undefined,
  expected: jsonSafe(assertion.expected),
  ...(assertion.passed === undefined ? {} : { passed: assertion.passed }),
  ...(assertion.diagnostics === undefined ? {} : { diagnostics: assertion.diagnostics.map(sanitizeDiagnostic) }),
  ...(assertion.durationMs === undefined ? {} : { durationMs: assertion.durationMs }),
});

const sanitizeTest = (test: GeoSpecTestCase): GeoSpecTestCase => ({
  suite: [...test.suite],
  name: test.name,
  assertions: test.assertions.map(sanitizeAssertion),
  status: test.status,
  diagnostics: test.diagnostics.map(sanitizeDiagnostic),
  ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
});

/**
 * Make a run result structured-clone-safe for `postMessage`, preserving the
 * complete reporting surface (statuses, diagnostics, witnesses, durations).
 */
export const sanitizeRunResultForTransport = (result: GeoSpecRunResult): GeoSpecRunResult => {
  if (!result.success) {
    return {
      success: false,
      issues: result.issues.map((issue) => jsonSafe(issue) ?? issue),
      ...(result.bundle ? { bundle: { ...result.bundle, code: '', sourceMap: undefined } } : {}),
    };
  }
  return {
    success: true,
    passed: result.passed,
    tests: result.tests.map(sanitizeTest),
    bundle: { ...result.bundle, code: '', sourceMap: undefined },
  };
};
