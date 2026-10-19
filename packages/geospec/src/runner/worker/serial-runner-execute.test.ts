import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { GeoSpecNativeModelEngine } from 'geospec/runner/native';
import type { GeoSpecRunnerOptions } from '#runner/worker/index.js';
import { accumulateFileResult, countRunnerTests, executeGeoSpecFile } from '#runner/worker/serial-runner.js';
import { failingSpec, memoryFileSystem, passingSpec } from '#runner/testing/memory-filesystem.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

const testCase = (status: GeoSpecTestCase['status']): GeoSpecTestCase => ({
  suite: ['s'],
  name: status,
  assertions: [],
  status,
  diagnostics: [],
});

const runnerOptions = (
  files: Readonly<Record<string, string>>,
  over: Partial<GeoSpecRunnerOptions> = {},
): GeoSpecRunnerOptions => ({
  filesystem: memoryFileSystem(files),
  nativeAssertions: { engine: mock<GeoSpecNativeModelEngine>() },
  ...over,
});

describe('countRunnerTests', () => {
  it('should count only explicit passes and failures, never unresolved outcomes', () => {
    const statuses: Array<GeoSpecTestCase['status']> = [
      'passed',
      'failed',
      'skipped',
      'unsupported',
      'inconclusive',
      'not-run',
    ];
    expect(countRunnerTests(statuses.map((status) => testCase(status)))).toStrictEqual({
      passed: 1,
      failed: 1,
    });
  });
});

describe('accumulateFileResult', () => {
  it('should count an unexecutable file as exactly one failure', () => {
    const totals = { passed: 0, failed: 0, selectedTests: 0 };

    accumulateFileResult(totals, { success: false, issues: [] });

    expect(totals).toStrictEqual({ passed: 0, failed: 1, selectedTests: 0 });
  });

  it('should count a file that ran by its tests', () => {
    const totals = { passed: 0, failed: 0, selectedTests: 0 };
    const result = {
      success: true,
      passed: false,
      tests: [testCase('passed'), testCase('failed'), testCase('skipped')],
      bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
    } satisfies GeoSpecRunResult;

    accumulateFileResult(totals, result);

    expect(totals).toStrictEqual({ passed: 1, failed: 1, selectedTests: 3 });
  });
});

describe('executeGeoSpecFile', () => {
  it('should treat the entry path as VM-rooted', async () => {
    const runner = runnerOptions({ 'spec.geospec.ts': passingSpec('vm rooted') });

    const result = await executeGeoSpecFile({ runner, file: 'spec.geospec.ts' });

    expect(result.success).toBe(true);
  });

  it('should register tests without running bodies under collectOnly', async () => {
    const runner = runnerOptions({ 'spec.geospec.ts': failingSpec('collect only') });

    const result = await executeGeoSpecFile({ runner, file: 'spec.geospec.ts', collectOnly: true });

    expect(result.success && result.tests.map((test) => test.status)).toEqual(['not-run']);
  });

  it('should thread the test filters through', async () => {
    const runner = runnerOptions({ 'spec.geospec.ts': passingSpec('filtered') });

    const result = await executeGeoSpecFile({
      runner,
      file: 'spec.geospec.ts',
      testNamePattern: 'nothing matches',
      testTimeout: 5000,
    });

    expect(result.success && result.tests).toStrictEqual([]);
  });

  it('should route model loads to the native loader and expose builtin modules', async () => {
    const load = vi.fn(async () => ({ subjectHash: 'a'.repeat(64) }));
    const runner = runnerOptions(
      {
        'spec.geospec.ts': `
          import { describe, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          import { note } from 'project/extra';
          describe('deps', () => {
            it('loads', async () => { await loadModel({ file: 'main.ts' }); if (note !== 'ok') throw new Error(note); });
          });
        `,
      },
      {
        nativeModelLoader: Object.assign(load, { releaseAll: async () => undefined }),
        builtinModules: { 'project/extra': { version: '1', code: "export const note = 'ok';" } },
      },
    );

    const result = await executeGeoSpecFile({ runner, file: 'spec.geospec.ts' });

    expect(result.success && result.tests.map((test) => test.status)).toStrictEqual(['passed']);
    expect(load).toHaveBeenCalledOnce();
    expect(load.mock.calls[0]).toMatchObject([{ file: 'main.ts' }]);
  });

  it('should apply a per-run work-unit limit over the runner assertion options', async () => {
    const runner = runnerOptions({ 'spec.geospec.ts': passingSpec('limited') });

    const result = await executeGeoSpecFile({ runner, file: 'spec.geospec.ts', workUnitLimit: 7 });

    expect(result.success).toBe(true);
    expect(runner.nativeAssertions.workUnitLimit).toBeUndefined();
  });

  it('should report each test start and completion to the observer', async () => {
    const events: string[] = [];
    const runner = runnerOptions({ 'spec.geospec.ts': passingSpec('observed') });

    await executeGeoSpecFile({ runner, file: 'spec.geospec.ts', onTestEvent: (event) => events.push(event.type) });

    expect(events).toStrictEqual(['test-start', 'test-complete']);
  });
});
