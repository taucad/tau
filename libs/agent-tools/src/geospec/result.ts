/**
 * Project a GeoSpec runner result onto the compact `test_model` RPC shape.
 *
 * A `GeoSpecRunnerResult` holds the live geometry subject of every assertion,
 * so it is an in-process structure that must never cross a wire. This is the
 * projection that makes it transportable, and it is the same one whichever host
 * ran the tests.
 *
 * @module
 */

import type { RunGeoSpecTestsRpcResult } from '@taucad/chat';
import { isRecord } from '@taucad/utils/schema';
import type { GeometryDiagnostic } from 'geospec/mesh';
import type { GeoSpecTestCase } from 'geospec/runner';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';

type RunGeoSpecTestsSuccess = Extract<RunGeoSpecTestsRpcResult, { success: true }>;
type RunGeoSpecTestFailure = RunGeoSpecTestsSuccess['failures'][number];
type RunGeoSpecTestDiagnostic = NonNullable<RunGeoSpecTestFailure['diagnostics']>[number];

const fullGeoSpecTestName = (test: GeoSpecTestCase): string => [...test.suite, test.name].join(' > ');

const runtimeIssueText = (issue: unknown): string | undefined => {
  if (!isRecord(issue) || typeof issue['message'] !== 'string') {
    return undefined;
  }

  const prefix = typeof issue['code'] === 'string' ? `Runtime issue ${issue['code']}: ` : 'Runtime issue: ';
  return `${prefix}${issue['message']}`;
};

const nestedDiagnosticText = (diagnostic: GeometryDiagnostic): readonly string[] => {
  const { details } = diagnostic;
  if (!isRecord(details)) {
    return [];
  }

  const nested = [details['issues'], details['diagnostics']].flatMap((value): unknown[] =>
    Array.isArray(value) ? value : [],
  );
  return nested.flatMap((issue) => {
    const text = runtimeIssueText(issue);
    return text ? [text] : [];
  });
};

const diagnosticText = (diagnostics: readonly GeometryDiagnostic[] | undefined): string | undefined => {
  if (!diagnostics || diagnostics.length === 0) {
    return undefined;
  }
  return diagnostics.flatMap((diagnostic) => [diagnostic.message, ...nestedDiagnosticText(diagnostic)]).join('\n');
};

const cloneDiagnosticVec3 = (
  vector: readonly [number, number, number],
): NonNullable<RunGeoSpecTestDiagnostic['spatial']>['min'] => [vector[0], vector[1], vector[2]];

const transportDiagnostics = (
  diagnostics: readonly GeometryDiagnostic[] | undefined,
): RunGeoSpecTestFailure['diagnostics'] =>
  diagnostics?.map((diagnostic) => ({
    code: diagnostic.code,
    severity: diagnostic.severity,
    message: diagnostic.message,
    ...(diagnostic.suggestion === undefined ? {} : { suggestion: diagnostic.suggestion }),
    ...(diagnostic.spatial === undefined
      ? {}
      : {
          spatial: {
            ...(diagnostic.spatial.min === undefined ? {} : { min: cloneDiagnosticVec3(diagnostic.spatial.min) }),
            ...(diagnostic.spatial.max === undefined ? {} : { max: cloneDiagnosticVec3(diagnostic.spatial.max) }),
            ...(diagnostic.spatial.center === undefined
              ? {}
              : { center: cloneDiagnosticVec3(diagnostic.spatial.center) }),
          },
        }),
    ...(diagnostic.details === undefined ? {} : { details: structuredClone(diagnostic.details) }),
  }));

/** The `test_model` payload minus its success discriminant. @public */
export type TestModelOutput = Omit<RunGeoSpecTestsSuccess, 'success'>;

/**
 * Convert a GeoSpec runner result into the compact `test_model` RPC shape.
 *
 * @param result - The runner's aggregate result.
 * @param entryPaths - Discovered GeoSpec files the run selected.
 * @param options - Whether the caller applied selection filters.
 * @returns The compact model-facing verdict.
 * @public
 */
export const runnerResultToTestModelOutput = (
  result: GeoSpecRunnerResult,
  entryPaths: readonly string[],
  options: { filtersApplied?: boolean } = {},
): TestModelOutput => {
  const failures: RunGeoSpecTestsSuccess['failures'] = [];
  const passes: RunGeoSpecTestsSuccess['passes'] = [];

  if (entryPaths.length === 0) {
    if (options.filtersApplied) {
      failures.push({
        id: 'NO_MATCHING_GEOSPEC_TESTS',
        requirement: 'At least one selected GeoSpec test must run',
        reason: 'No GeoSpec files matched the supplied filters or directory roots.',
        suggestion:
          'Run without filters, or use files/include/exclude/testNamePattern values that select at least one GeoSpec test.',
        targetFile: '*.geospec.ts',
      });
    } else {
      failures.push({
        id: 'missing_geospec_file',
        requirement: 'At least one GeoSpec test file must exist',
        reason: 'No *.geospec.ts or *.geospec.js files found in the project.',
        suggestion:
          'Create a *.geospec.ts test file. Import describe, it, and expectGeo from geospec, and load models through geospec/model.',
        targetFile: '*.geospec.ts',
      });
    }
  }

  for (const issue of result.issues ?? []) {
    failures.push({
      id: issue.code,
      requirement: 'At least one selected GeoSpec test must run',
      reason: issue.message,
      suggestion:
        'Run without filters, or use files/include/exclude/testNamePattern values that select at least one GeoSpec test.',
      targetFile: entryPaths.join(', ') || '*.geospec.ts',
    });
  }

  for (const fileResult of result.files) {
    if (!fileResult.result.success) {
      failures.push({
        id: `${fileResult.file}:bundle`,
        requirement: `GeoSpec module ${fileResult.file} must bundle and execute`,
        reason: fileResult.result.issues.map((issue) => issue.message).join('\n'),
        suggestion: 'Fix the GeoSpec syntax, imports, or referenced project files.',
        targetFile: fileResult.file,
      });
      continue;
    }

    for (const test of fileResult.result.tests) {
      if (test.status === 'skipped') {
        continue;
      }

      const requirement = fullGeoSpecTestName(test);
      if (test.status === 'failed') {
        const assertionDiagnostics = test.assertions.flatMap((assertion) => assertion.diagnostics ?? []);
        // The collector mirrors its thrown assertion's exact diagnostic objects.
        // Worker structured-clone preserves these aliases. Never deduplicate by
        // code/message: separate failures can have identical text and locations.
        const mirrored = new Set(assertionDiagnostics);
        const diagnostics = [
          ...assertionDiagnostics,
          ...test.diagnostics.filter((diagnostic) => !mirrored.has(diagnostic)),
        ];
        failures.push({
          id: `${fileResult.file}:${requirement}`,
          requirement,
          reason: diagnosticText(diagnostics) ?? 'GeoSpec test failed.',
          suggestion:
            diagnostics.find((diagnostic) => diagnostic.suggestion)?.suggestion ??
            'Inspect the GeoSpec diagnostics and update the model or expected geometry assertion.',
          targetFile: fileResult.file,
          diagnostics: transportDiagnostics(diagnostics),
        });
        continue;
      }

      passes.push({
        id: `${fileResult.file}:${requirement}`,
        requirement,
        targetFile: fileResult.file,
      });
    }
  }

  if (entryPaths.length > 0 && failures.length === 0 && passes.length === 0) {
    failures.push({
      id: 'NO_MATCHING_GEOSPEC_TESTS',
      requirement: 'At least one selected GeoSpec test must run',
      reason: 'GeoSpec files were found, but no non-skipped tests ran.',
      suggestion: 'Run without filters or use a matching Vitest-style testNamePattern.',
      targetFile: entryPaths.join(', '),
    });
  }

  return {
    failures,
    passes,
    passed: passes.length,
    total: failures.length + passes.length,
  };
};
