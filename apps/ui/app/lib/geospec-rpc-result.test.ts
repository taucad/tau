import { describe, expect, it } from 'vitest';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
import { runnerResultToTestModelOutput } from '#lib/geospec-rpc-result.js';

const emptyBundle = () => ({
  code: '',
  issues: [],
  success: true,
  dependencies: [],
  unresolvedPaths: [],
});

const emptyRunnerResult = (): GeoSpecRunnerResult => ({
  success: false,
  passed: 0,
  failed: 1,
  selectedTests: 0,
  files: [],
});

describe('runnerResultToTestModelOutput', () => {
  it('should report missing GeoSpec files when an unfiltered project has no tests', () => {
    const output = runnerResultToTestModelOutput(emptyRunnerResult(), []);

    expect(output.failures).toEqual([
      expect.objectContaining({
        id: 'missing_geospec_file',
        requirement: 'At least one GeoSpec test file must exist',
        targetFile: '*.geospec.ts',
      }),
    ]);
    expect(output.total).toBe(1);
  });

  it('should report no matching tests when file or directory filters select nothing', () => {
    const output = runnerResultToTestModelOutput(emptyRunnerResult(), [], { filtersApplied: true });

    expect(output.failures).toEqual([
      expect.objectContaining({
        id: 'NO_MATCHING_GEOSPEC_TESTS',
        requirement: 'At least one selected GeoSpec test must run',
        suggestion:
          'Run without filters, or use files/include/exclude/testNamePattern values that select at least one GeoSpec test.',
        targetFile: '*.geospec.ts',
      }),
    ]);
    expect(output.total).toBe(1);
  });

  it('should preserve runtime export diagnostics in compact failures', () => {
    const runtimeIssue = {
      code: 'JSCAD_EXPORT_FAILED',
      message: 'JSCAD serialization failed',
      type: 'kernel',
      details: { kernelId: 'jscad' },
    };
    const result: GeoSpecRunnerResult = {
      success: false,
      passed: 0,
      failed: 1,
      selectedTests: 1,
      files: [
        {
          file: 'main.geospec.ts',
          result: {
            success: true,
            passed: false,
            bundle: emptyBundle(),
            tests: [
              {
                suite: ['JSCAD cube cutout'],
                name: 'should have the expected bounds',
                status: 'failed',
                assertions: [],
                diagnostics: [
                  {
                    code: 'MODEL_EXPORT_FAILED',
                    severity: 'error',
                    message: 'Tau runtime did not produce geometry bytes for this model.',
                    suggestion:
                      'Inspect the runtime export diagnostics, kernel import/export support, and model code identified by those diagnostics.',
                    details: {
                      file: 'main.ts',
                      format: 'glb',
                      issues: [runtimeIssue],
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    };

    const output = runnerResultToTestModelOutput(result, ['main.geospec.ts']);

    expect(output.failures).toEqual([
      expect.objectContaining({
        id: 'main.geospec.ts:JSCAD cube cutout > should have the expected bounds',
        reason:
          'Tau runtime did not produce geometry bytes for this model.\nRuntime issue JSCAD_EXPORT_FAILED: JSCAD serialization failed',
        suggestion:
          'Inspect the runtime export diagnostics, kernel import/export support, and model code identified by those diagnostics.',
        diagnostics: [
          expect.objectContaining({
            code: 'MODEL_EXPORT_FAILED',
            details: {
              file: 'main.ts',
              format: 'glb',
              issues: [runtimeIssue],
            },
          }),
        ],
      }),
    ]);
  });
});
