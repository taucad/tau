import { describe, expect, it } from 'vitest';
import type { GeoSpecRunnerResult } from 'geospec/runner/worker';
import { runnerResultToTestModelOutput } from '#lib/geospec-rpc-result.js';

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
});
