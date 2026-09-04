/** Matcher bodies backed by diagnostics already attached to a subject. @module */

import type { GeoSpecNoDiagnosticsExpectation } from 'geospec';
import type { GeometryDiagnostic } from '#mesh/types.js';
import type { GeoSpecMatcherImplementation } from '#matchers/types.js';
import { matcherDiagnostic, matcherSubject } from '#matchers/support.js';

const defaultRejectedSeverities: ReadonlyArray<GeometryDiagnostic['severity']> = ['error', 'warning'];

/** `expectGeo(...).toHaveNoDiagnostics(...)`. @public */
export const toHaveNoDiagnostics: GeoSpecMatcherImplementation = (invocation) => {
  const resolved = matcherSubject(invocation);
  if ('diagnostics' in resolved) {
    return resolved.diagnostics;
  }
  const expectation = (invocation.expected ?? {}) as GeoSpecNoDiagnosticsExpectation;
  const severities = new Set<GeometryDiagnostic['severity']>(expectation.severities ?? defaultRejectedSeverities);
  const forbidden = resolved.subject.diagnostics.filter((diagnostic) => severities.has(diagnostic.severity));
  if (forbidden.length === 0) {
    return [];
  }
  const summary = forbidden.map((diagnostic) => `${diagnostic.code} (${diagnostic.severity})`).join(', ');
  return [
    matcherDiagnostic({
      code: 'GEOSPEC_DIAGNOSTICS_PRESENT',
      message: `The subject carries ${forbidden.length} forbidden diagnostic${forbidden.length === 1 ? '' : 's'}: ${summary}.`,
      suggestion: 'Fix the model source or its kernel/export path until these diagnostics are no longer emitted.',
      details: { matcher: 'toHaveNoDiagnostics', severities: [...severities], diagnostics: forbidden },
    }),
  ];
};
