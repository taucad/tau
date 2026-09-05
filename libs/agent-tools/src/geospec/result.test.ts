import { describe, expect, it } from 'vitest';
import type { GeometryDiagnostic } from 'geospec/mesh';
import type { GeoSpecTestCase } from 'geospec/runner';
import { runnerResultToTestModelOutput } from '#geospec/result.js';

const project = (test: GeoSpecTestCase) =>
  runnerResultToTestModelOutput(
    {
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 1,
      files: [
        {
          file: 'gear.geospec.ts',
          result: {
            success: true,
            passed: false,
            tests: [test],
            bundle: { success: true, code: '', issues: [], dependencies: [], unresolvedPaths: [] },
          },
        },
      ],
    },
    ['gear.geospec.ts'],
  );

describe('model-facing diagnostics', () => {
  it('renders nested rejected warnings in plain-text reasons without dropping their structured originals', () => {
    const nested = [
      { code: 'NON_MANIFOLD', severity: 'warning', message: 'Open gear tooth at x=2', details: { source: 'gear.ts' } },
    ];
    const diagnostic: GeometryDiagnostic = {
      code: 'GEOSPEC_DIAGNOSTICS_PRESENT',
      severity: 'error',
      message: 'Forbidden diagnostics',
      details: { diagnostics: nested },
    };
    const output = project({ suite: [], name: 'health', status: 'failed', assertions: [], diagnostics: [diagnostic] });
    expect(output.failures[0]?.reason).toContain('NON_MANIFOLD: Open gear tooth at x=2');
    expect(output.failures[0]?.diagnostics?.[0]?.details).toEqual({ diagnostics: nested });
  });
  it('keeps every spatial failure and independent test error, omitting only identity mirrors', () => {
    const left: GeometryDiagnostic = {
      code: 'INTERSECTION',
      severity: 'error',
      message: 'Parts overlap',
      spatial: { center: [1, 2, 3] },
      details: { pair: ['left', 'gear'] },
    };
    const right: GeometryDiagnostic = { ...left, spatial: { center: [4, 5, 6] }, details: { pair: ['right', 'gear'] } };
    const independent = structuredClone(left);
    const test: GeoSpecTestCase = {
      suite: [],
      name: 'fit',
      status: 'failed',
      assertions: [
        { kind: 'watertight', subject: {}, expected: true, passed: false, diagnostics: [left] },
        { kind: 'watertight', subject: {}, expected: true, passed: false, diagnostics: [right] },
      ],
      diagnostics: [left, right, independent],
    };
    const output = project(structuredClone(test));
    expect(output.total).toBe(1);
    expect(output.failures[0]?.diagnostics).toStrictEqual([left, right, independent]);
    expect(output.failures[0]?.reason).toBe('Parts overlap\nParts overlap\nParts overlap');
  });
});
