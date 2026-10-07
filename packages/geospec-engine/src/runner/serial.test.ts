import { describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { createModelLoader as createCanonicalModelLoader } from 'geospec/model';
import type { GeoSpecSubject } from 'geospec/model';
import type { GeoSpecNativeModelEngine } from 'geospec/runner/native';
import {
  clearGeoSpecEngine,
  getGeoSpecEngineProtocol,
  registerGeoSpecEngine,
  geoSpecMatcherRegistryVersion,
} from 'geospec/engine';
import { geoSpecEngineImplementation } from '#register.js';
import type { GeoSpecRunnerEvent, GeoSpecRunnerOptions } from 'geospec/runner/worker';
import type { GeometrySubject } from '#mesh/types.js';
import { exposeEngineSubject } from '#engine/subject-store.js';
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

const runnerOptions = (files: Readonly<Record<string, string>>): GeoSpecRunnerOptions => ({
  filesystem: memoryFileSystem(files),
});

const initializeResponse = (): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(
    JSON.stringify({
      requestId: 'configuration',
      result: {
        canonicalProfile: 'geospec-jcs-v1',
        protocolVersion: 3,
        registryVersion: 5,
        configuration: { binaryAdmissionLimits: { maxSubjectBytes: 1024, maxTotalBinaryBytes: 1024 } },
      },
    }),
  );

const canonicalLoaderFixture = () => {
  const engine = mock<GeoSpecNativeModelEngine>();
  engine.processRequest.mockReturnValue(initializeResponse());
  const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
  const subjectHash = 'a'.repeat(64);
  engine.ingestSubject.mockReturnValue(encode({ result: { subject: { subjectHash } } }));
  engine.subjectHandle.mockReturnValue(encode({ result: { subjectHandle: { subjectHash, generation: 1 } } }));
  engine.releaseSubject.mockReturnValue(encode({ result: {} }));
  return createCanonicalModelLoader({ engine });
};

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

describe('createSerialRunContext', () => {
  it('should retain canonical opaque subject ownership without reference-engine projection', async () => {
    const engine = mock<GeoSpecNativeModelEngine>();
    engine.processRequest.mockReturnValue(initializeResponse());
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const subjectHash = 'a'.repeat(64);
    engine.ingestSubject.mockReturnValue(encode({ result: { subject: { subjectHash } } }));
    engine.subjectHandle.mockReturnValue(encode({ result: { subjectHandle: { subjectHash, generation: 1 } } }));
    engine.releaseSubject.mockReturnValue(encode({ result: {} }));
    const loader = createCanonicalModelLoader({ engine });
    const context = createSerialRunContext({ modelLoader: loader });
    try {
      const subject = await context.modelLoader?.({ source: Uint8Array.of(1), format: 'step' });
      expect(subject).toEqual({});
      expect(subject).not.toHaveProperty('subjectId');
      expect(engine.releaseSubject).not.toHaveBeenCalled();
    } finally {
      await context.resourceScope.dispose();
    }
    expect(engine.releaseSubject).toHaveBeenCalledOnce();
  });

  it('should preserve the loader and read every repeated source and variant afresh', async () => {
    const loader = vi.fn(async () => mock<GeoSpecSubject>());
    const context = createSerialRunContext({ modelLoader: loader });
    expect(context.modelLoader).toBe(loader);
    const first = await context.modelLoader?.({ file: 'a.ts', parameters: { height: 1 } });
    const second = await context.modelLoader?.({ file: 'a.ts', parameters: { height: 1 } });
    await context.modelLoader?.({ file: 'a.ts', parameters: { height: 2 } });
    expect(first).not.toBe(second);
    expect(loader.mock.calls).toEqual([
      [{ file: 'a.ts', parameters: { height: 1 } }],
      [{ file: 'a.ts', parameters: { height: 1 } }],
      [{ file: 'a.ts', parameters: { height: 2 } }],
    ]);
    await context.resourceScope.dispose();
  });

  it('should keep an absent loader absent rather than inventing one', () => {
    expect(createSerialRunContext({}).modelLoader).toBeUndefined();
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

    expect(result.success && result.tests.map((test) => test.status)).toEqual(['not-run']);
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

  it('should qualify cross-file resource generations using actual locators, not aliases', async () => {
    let generation = 0;
    const spec = `import { it } from 'geospec'; import { loadModel } from 'geospec/model';
      it('resource', async () => { await loadModel({ source: new Uint8Array([1]), format: 'gltf', resources: [{ name: 'alias.bin', source: 'textures/data.bin' }] }); });`;
    const runner = createSerialGeoSpecRunner({
      filesystem: memoryFileSystem({ 'first.geospec.ts': spec, 'second.geospec.ts': spec }),
      nativeModelLoader: Object.assign(
        async (): Promise<Awaited<ReturnType<NonNullable<GeoSpecRunnerOptions['nativeModelLoader']>>>> => ({
          subjectHash: 'a'.repeat(64),
          load: {
            loadId: 'resource-load',
            status: 'complete',
            format: 'gltf',
            parameters: {},
            ingestOptions: {},
            artifacts: [
              {
                name: 'alias.bin',
                sourcePath: 'textures/data.bin',
                sha256: (++generation === 1 ? 'b' : 'c').repeat(64),
                byteLength: 1,
              },
            ],
          },
        }),
        {
          async releaseAll() {
            /* This fixture retains no native handles. */
          },
        },
      ),
      nativeAssertions: { engine: mock<NonNullable<GeoSpecRunnerOptions['nativeAssertions']>['engine']>() },
    });
    const result = await runner.run({ files: ['first.geospec.ts', 'second.geospec.ts'] });
    await runner.close();
    expect(result).toMatchObject({ success: false, failed: 0, lineageStatus: 'mixed' });
  });

  it('should reject duplicate requested files before admission and preserve exact not-run accounting', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions(twoFiles));
    const starts = vi.fn();
    runner.on('run-start', starts);
    const files = ['first.geospec.ts', 'first.geospec.ts'];
    const result = await runner.run({ files });
    await runner.close();
    expect(starts).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      files: [],
      lineageStatus: 'unavailable',
      issues: [{ code: 'GEOSPEC_DUPLICATE_FILES' }],
      accounting: { requestedFiles: files, completedFiles: [], notRunFiles: files, discoveryComplete: false },
    });
  });

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

  it('should share file bundles across sequential and overlapping runs without sharing a binding', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions(twoFiles));
    const runFirstFile = async () => {
      const result = await runner.run({ files: ['first.geospec.ts'] });
      return result.files[0]?.result;
    };

    const first = await runFirstFile();
    const cached = first?.bundle;
    expect(cached).toBeDefined();
    const sequential = await runFirstFile();
    expect(sequential?.bundle).toBe(cached);
    const overlapping = await Promise.all([runFirstFile(), runFirstFile()]);
    for (const result of overlapping) {
      expect(result?.bundle).toBe(cached);
      expect(result?.success && result.tests.map(({ name }) => name)).toStrictEqual(['passes']);
    }
    await runner.close();
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
      stepLoader: async () => exposeEngineSubject(emptyStepSubject()),
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
  it('should hold completion until the native loader finishes releasing its run', async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const releaseAll = vi.fn(async () => {
      entered.resolve();
      await release.promise;
    });
    const runner = createSerialGeoSpecRunner({
      ...runnerOptions({ 'a.geospec.ts': passingSpec('a') }),
      nativeModelLoader: Object.assign(async () => ({ subjectHash: 'a'.repeat(64), generation: 1 }), { releaseAll }),
    });
    let finished = false;
    const running = (async () => {
      const result = await runner.run({ files: ['a.geospec.ts'] });
      finished = true;
      return result;
    })();
    await entered.promise;
    expect(finished).toBe(false);
    release.resolve();
    expect(await running).toMatchObject({ success: true, failed: 0 });
    expect(releaseAll).toHaveBeenCalledOnce();
    await runner.close();
  });

  it('should report native cleanup failure without inventing a geometry failure', async () => {
    const releaseAll = vi.fn(async () => {
      throw new Error('release refused');
    });
    const runner = createSerialGeoSpecRunner({
      ...runnerOptions({ 'a.geospec.ts': passingSpec('a') }),
      nativeModelLoader: Object.assign(async () => ({ subjectHash: 'a'.repeat(64), generation: 1 }), { releaseAll }),
    });
    expect(await runner.run({ files: ['a.geospec.ts'] })).toMatchObject({
      success: false,
      failed: 0,
      passed: 1,
      issues: [{ code: 'GEOSPEC_NATIVE_CLEANUP_FAILED', message: 'release refused' }],
    });
    expect(releaseAll).toHaveBeenCalledOnce();
    await runner.close();
  });

  it('should refuse an aggregate pass when a completed module lacks consumed load lineage', async () => {
    const runner = createSerialGeoSpecRunner({
      filesystem: memoryFileSystem({
        'missing-lineage.geospec.ts': `import { it } from 'geospec';
          import { loadModel } from 'geospec/model';
          it('loads without retained host evidence', async () => { await loadModel({ file: 'main.ts' }); });`,
      }),
      nativeModelLoader: Object.assign(async () => ({ subjectHash: 'a'.repeat(64), generation: 1 }), {
        async releaseAll() {
          /* No retained engine handles in this custom loader fixture. */
        },
      }),
      nativeAssertions: { engine: mock<NonNullable<GeoSpecRunnerOptions['nativeAssertions']>['engine']>() },
    });
    const result = await runner.run({ files: ['missing-lineage.geospec.ts'] });
    await runner.close();
    expect(result.files[0]?.result).toMatchObject({ success: true, passed: false, lineage: { status: 'unavailable' } });
    expect(result).toMatchObject({
      success: false,
      failed: 0,
      lineageStatus: 'unavailable',
      accounting: { discovered: 1, selected: 1, completed: 1, passed: 1, notRunFiles: [] },
    });
  });

  it('should forward runner and low-level protocol forensic spans without projecting model subjects', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const loader = canonicalLoaderFixture();
    const runner = createSerialGeoSpecRunner({
      filesystem: memoryFileSystem({
        'forensic.geospec.ts': `
          import { describe, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          describe('forensic', () => {
            it('measures', async () => {
              await loadModel({ source: new Uint8Array([1]), format: 'step' });
            });
          });
        `,
      }),
      modelLoader: Object.assign(
        async (options: Parameters<typeof loader>[0]) => {
          await getGeoSpecEngineProtocol()?.submitClaims({
            requestId: 'low-level-forensic',
            registryVersion: geoSpecMatcherRegistryVersion,
            execution: { matcherWallBackstop: 1000, forensic: true },
            claims: [],
          });
          return loader(options);
        },
        { dispose: async () => loader.dispose() },
      ),
    });
    runner.on('forensic', (event) => events.push(event));

    const result = await runner.run({
      files: ['forensic.geospec.ts'],
      forensic: true,
      matcherWallBackstop: 1000,
    });
    await runner.close();

    expect(result).toMatchObject({ success: true, failed: 0, lineageStatus: 'complete' });
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

  it('should not report obsolete reference cache affinity for a canonical model load', async () => {
    const loader = canonicalLoaderFixture();
    const modelLoader = Object.assign(vi.fn(loader), { dispose: async () => loader.dispose() });
    const runner = createSerialGeoSpecRunner({
      filesystem: memoryFileSystem({
        'a.geospec.ts': `
          import { describe, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          describe('affinity', () => { it('loads', async () => { await loadModel({ source: new Uint8Array([1]), format: 'step' }); }); });
        `,
      }),
      modelLoader,
    });

    const result = await runner.run({ files: ['a.geospec.ts'] });
    await runner.close();

    expect(result).toMatchObject({ success: true, failed: 0, lineageStatus: 'complete' });
    expect(modelLoader).toHaveBeenCalledOnce();
    expect(result.files[0]).not.toHaveProperty('primaryLoadKey');
  });
});
