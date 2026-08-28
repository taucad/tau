/* eslint-disable @typescript-eslint/naming-convention -- VM paths and module specifiers are object keys here. */
import { describe, expect, it, vi } from 'vitest';
import { clearGeoSpecEngine, registerGeoSpecEngine } from 'geospec/engine';
import { geoSpecEngineImplementation } from '#register.js';
import type { GeoSpecRunnerEvent, GeoSpecRunnerOptions } from 'geospec/runner/worker';
import type { GeometrySubject } from '#mesh/types.js';
import type { GeometrySubject as PublicGeometrySubject } from 'geospec/mesh';
import { exposeEngineSubject } from '#engine/subject-store.js';
import { loadMesh } from '#mesh/load-mesh.js';
import { getOccurrenceSolid } from '#proofs/occurrence-solids.js';
import {
  accumulateFileResult,
  countRunnerTests,
  createSerialGeoSpecRunner,
  createSerialRunContext,
  executeGeoSpecFile,
} from '#runner/serial.js';
import { failingSpec, memoryFileSystem, passingSpec } from '#runner/testing/memory-filesystem.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

const testCase = (status: GeoSpecTestCase['status']): GeoSpecTestCase => ({
  suite: ['s'],
  name: status,
  assertions: [],
  status,
  diagnostics: [],
});

/** Zeroed opt-in counters; nothing branches on them. */
const profileCounters = (): GeoSpecRunnerOptions['internalProfile'] => {
  const profile = {
    resourceScope: { disposals: 0, subjects: 0, alreadyDisposed: 0 },
    aggregateModelLoadCache: { hits: 0, misses: 0, bypasses: 0, failures: 0 },
  };
  return profile as unknown as GeoSpecRunnerOptions['internalProfile'];
};

/** A STEP loader the spec never calls; only its presence is under test. */
const emptyStepSubject = (): GeometrySubject => {
  const subject = {};
  return subject as unknown as GeometrySubject;
};

const exposed = (subject: GeometrySubject): PublicGeometrySubject => exposeEngineSubject(subject);
const loadedSubject = async (): Promise<GeometrySubject> => {
  const result = await loadMesh({ source: { format: 'mesh-buffer', positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] } });
  if (!result.success) {
    throw new Error(result.diagnostics.map(({ message }) => message).join('\n'));
  }
  return result.subject;
};

const runnerOptions = (files: Readonly<Record<string, string>>): GeoSpecRunnerOptions => ({
  filesystem: memoryFileSystem(files),
});

describe('countRunnerTests', () => {
  it('should count pass and fail and ignore skips', () => {
    expect(countRunnerTests([testCase('passed'), testCase('failed'), testCase('skipped')])).toStrictEqual({
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

describe('createSerialRunContext', () => {
  it('should track every resolved subject in the run-wide scope', async () => {
    const subject = await loadedSubject();
    const context = createSerialRunContext({ modelLoader: async () => exposed(subject) });

    await context.modelLoader?.({ file: 'main.ts' });
    await context.resourceScope.dispose();

    expect(context.resourceScope.disposed).toBe(true);
  });

  it('should record only the FIRST load key per file', async () => {
    const subject = await loadedSubject();
    const context = createSerialRunContext({ modelLoader: async () => exposed(subject) });

    context.beginFile();
    await context.modelLoader?.({ file: 'a.ts' });
    const first = context.fileLoadKey();
    await context.modelLoader?.({ file: 'b.ts' });

    expect(first).toBeDefined();
    expect(context.fileLoadKey()).toBe(first);

    context.beginFile();
    expect(context.fileLoadKey()).toBeUndefined();
  });

  it('should keep an absent loader absent rather than inventing one', () => {
    expect(createSerialRunContext({}).modelLoader).toBeUndefined();
  });

  it('should reject a model loader that returns a forged detached subject', async () => {
    const context = createSerialRunContext({
      modelLoader: async () => ({ subjectId: 'forged' }) as unknown as PublicGeometrySubject,
    });
    await expect(context.modelLoader?.({ file: 'main.ts' })).rejects.toThrow(/ingested subject reference/u);
  });

  it('should clear prepared occurrence solids when the run scope ends', async () => {
    const fetch = vi.fn(() => ({
      positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      triangleCount: 1,
    }));
    getOccurrenceSolid({ contentHash: 'sha256:run-scoped', occurrence: 0, fetch });
    const context = createSerialRunContext({});

    await context.resourceScope.dispose();
    getOccurrenceSolid({ contentHash: 'sha256:run-scoped', occurrence: 0, fetch });

    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('executeGeoSpecFile', () => {
  it('should treat the entry path as VM-rooted', async () => {
    const runner = runnerOptions({ 'spec.geospec.ts': passingSpec('vm rooted') });
    const context = createSerialRunContext(runner);

    const result = await executeGeoSpecFile({ runner, context, file: 'spec.geospec.ts' });

    expect(result.success).toBe(true);
  });

  it('should register tests without running bodies under collectOnly', async () => {
    const runner = runnerOptions({ 'spec.geospec.ts': failingSpec('collect only') });
    const context = createSerialRunContext(runner);

    const result = await executeGeoSpecFile({ runner, context, file: 'spec.geospec.ts', collectOnly: true });

    expect(result.success && result.tests.every((test) => test.status === 'skipped')).toBe(true);
  });

  it('should thread the test filters through', async () => {
    const runner = runnerOptions({ 'spec.geospec.ts': passingSpec('filtered') });
    const context = createSerialRunContext(runner);

    const result = await executeGeoSpecFile({
      runner,
      context,
      file: 'spec.geospec.ts',
      testNamePattern: 'nothing matches',
      testTimeout: 5000,
    });

    expect(result.success && result.tests).toStrictEqual([]);
  });
});

describe('createSerialGeoSpecRunner', () => {
  const twoFiles = {
    'first.geospec.ts': passingSpec('first'),
    'second.geospec.ts': passingSpec('second'),
  };

  it('should run every file and emit the lifecycle in order', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const runner = createSerialGeoSpecRunner(runnerOptions(twoFiles));
    const subscriptions: Array<() => void> = [];
    for (const type of ['run-start', 'file-start', 'file-complete', 'run-complete', 'close'] as const) {
      subscriptions.push(runner.on(type, (event) => events.push(event)));
    }

    const result = await runner.run({ files: Object.keys(twoFiles) });
    await runner.close();
    await runner.close();

    expect({ success: result.success, passed: result.passed, selected: result.selectedTests }).toStrictEqual({
      success: true,
      passed: 2,
      selected: 2,
    });
    expect(events.map((event) => event.type)).toStrictEqual([
      'run-start',
      'file-start',
      'file-complete',
      'file-start',
      'file-complete',
      'run-complete',
      'close',
    ]);
    for (const unsubscribe of subscriptions) {
      unsubscribe();
    }
  });

  it('should refuse to run once closed', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions(twoFiles));
    await runner.close();

    const result = await runner.run({ files: ['first.geospec.ts'] });

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_CLOSED');
  });

  it('should fail the run when the filters select nothing', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions(twoFiles));

    const result = await runner.run({ files: Object.keys(twoFiles), testNamePattern: 'no such test' });

    expect(result.issues?.[0]?.code).toBe('NO_MATCHING_GEOSPEC_TESTS');
    expect(result.success).toBe(false);
  });

  it('should stop at the first failure under bail', async () => {
    const runner = createSerialGeoSpecRunner(
      runnerOptions({ 'a.geospec.ts': failingSpec('a'), 'b.geospec.ts': passingSpec('b') }),
    );

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'], bail: true });

    expect(result.files.map((file) => file.file)).toStrictEqual(['a.geospec.ts']);
    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_BAILED');
  });

  it('should stop at an abort requested mid-run', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the handler closes over the runner it creates.
    let runner: ReturnType<typeof createSerialGeoSpecRunner>;
    const events: GeoSpecRunnerEvent[] = [];
    runner = createSerialGeoSpecRunner(runnerOptions(twoFiles));
    runner.on('file-complete', (event) => {
      events.push(event);
      runner.abort();
    });
    runner.on('abort', (event) => events.push(event));

    const result = await runner.run({ files: Object.keys(twoFiles) });

    expect(result.files).toHaveLength(1);
    expect(result.issues?.some((issue) => issue.code === 'GEOSPEC_RUNNER_ABORTED')).toBe(true);
    expect(events.some((event) => event.type === 'abort')).toBe(true);
  });

  it('should carry an abort reason into the issue', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the handler closes over the runner it creates.
    let runner: ReturnType<typeof createSerialGeoSpecRunner>;
    runner = createSerialGeoSpecRunner(runnerOptions(twoFiles));
    runner.on('file-complete', () => {
      runner.abort('operator');
    });

    const result = await runner.run({ files: Object.keys(twoFiles) });

    expect(result.issues?.[0]?.message).toContain('operator');
  });

  it('should report a file that failed to execute', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions({}));

    const result = await runner.run({ files: ['missing.geospec.ts'] });

    expect(result.success).toBe(false);
    expect(result.failed).toBe(1);
  });
});

describe('the optional runner dependencies', () => {
  it('should thread the step loader, builtin modules, profile and timeout through', async () => {
    const events: string[] = [];
    const runner = createSerialGeoSpecRunner({
      filesystem: memoryFileSystem({
        'a.geospec.ts': `
          import { describe, it } from 'geospec';
          import { note } from 'project/extra';
          describe('deps', () => { it('sees the builtin', () => { if (note !== 'ok') throw new Error(note); }); });
        `,
      }),
      stepLoader: async () => exposed(emptyStepSubject()),
      builtinModules: { 'project/extra': { version: '1', code: "export const note = 'ok';" } },
      internalProfile: profileCounters(),
    });
    runner.on('file-complete', (event) => events.push(event.type));

    const result = await runner.run({ files: ['a.geospec.ts'], testTimeout: 5000, testNamePattern: 'builtin' });
    await runner.close();

    expect(result.success).toBe(true);
    expect(events).toContain('file-complete');
  });
});

describe('the remaining serial legs', () => {
  it('should forward runner and protocol forensic spans for an observed matcher run', async () => {
    const model = await loadedSubject();
    const events: GeoSpecRunnerEvent[] = [];
    const runner = createSerialGeoSpecRunner({
      filesystem: memoryFileSystem({
        'forensic.geospec.ts': `
          import { describe, expectGeo, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          describe('forensic', () => {
            it('measures', async () => {
              const model = await loadModel({ file: 'main.ts' });
              expectGeo(model).toHaveVolume({ value: 0 });
            });
          });
        `,
      }),
      modelLoader: async () => exposed(model),
    });
    runner.on('forensic', (event) => events.push(event));

    const result = await runner.run({
      files: ['forensic.geospec.ts'],
      forensic: true,
      matcherWallBackstop: 1000,
    });
    await runner.close();

    expect(result.success).toBe(true);
    expect(events.some((event) => event.type === 'forensic' && event.name === 'runner.file')).toBe(true);
    expect(events.some((event) => event.type === 'forensic' && event.name === 'engine.claims')).toBe(true);
  });

  it('should still emit runner forensic spans when no protocol is registered', async () => {
    clearGeoSpecEngine();
    try {
      const events: GeoSpecRunnerEvent[] = [];
      const runner = createSerialGeoSpecRunner(runnerOptions({ 'a.geospec.ts': passingSpec('a') }));
      runner.on('forensic', (event) => events.push(event));

      const result = await runner.run({ files: ['a.geospec.ts'], forensic: true });
      expect(result.success).toBe(true);
      await runner.close();
      expect(events.some((event) => event.type === 'forensic' && event.name === 'runner.file')).toBe(true);
    } finally {
      registerGeoSpecEngine(geoSpecEngineImplementation);
    }
  });

  it('should record an abort whose reason is empty', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the handler closes over the runner it creates.
    let runner: ReturnType<typeof createSerialGeoSpecRunner>;
    runner = createSerialGeoSpecRunner(
      runnerOptions({ 'a.geospec.ts': passingSpec('a'), 'b.geospec.ts': passingSpec('b') }),
    );
    runner.on('file-complete', () => {
      runner.abort('');
    });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'] });

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted.');
  });

  it('should report the affinity key of a file that loaded a model', async () => {
    const subject = await loadedSubject();
    const runner = createSerialGeoSpecRunner({
      filesystem: memoryFileSystem({
        'a.geospec.ts': `
          import { describe, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          describe('affinity', () => { it('loads', async () => { await loadModel({ file: 'main.ts' }); }); });
        `,
      }),
      modelLoader: async () => exposed(subject),
    });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(typeof result.files[0]?.primaryLoadKey).toBe('string');
  });
});
