import type { VmFileSystem } from '@taucad/esbuild/vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoSpecAssertionClientOptions } from '#assertion-client/index.js';
import { geoSpecEngineProtocolVersion } from '#engine/protocol.js';
import { clearGeoSpecEngine, registerGeoSpecEngine } from '#engine/seam.js';
import type { GeoSpecEngineHostBindings } from '#engine/seam.js';
import { createTestGeoSpecEngineProtocol } from '#engine/protocol.test-support.js';
import type { GeometrySubject } from '#mesh/types.js';
import { runGeoSpecModule } from '#runner/index.js';
import type { GeoSpecRunnerEvent } from '#runner/worker/index.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';

class MemoryFileSystem implements VmFileSystem {
  /** Runs after a read takes its content and before the reader sees it: a save landing right after the read. */
  public afterRead: ((path: string) => void) | undefined;

  private readonly files = new Map<string, string>();

  public setText(path: string, content: string): void {
    this.files.set(path, content);
  }

  public async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  public async readFile(path: string): Promise<Uint8Array<ArrayBuffer>>;
  public async readFile(path: string, encoding: 'utf8'): Promise<string>;
  public async readFile(path: string, encoding?: 'utf8'): Promise<string | Uint8Array<ArrayBuffer>> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new Error(`ENOENT: ${path}`);
    }
    this.afterRead?.(path);
    return encoding === 'utf8' ? content : new TextEncoder().encode(content);
  }

  public async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  public async ensureDir(): Promise<void> {
    return undefined;
  }
}

const subject = { kind: 'geometry-subject' } as unknown as GeometrySubject;
const nativeAssertions = {
  engine: {
    evaluateClaim: (input: Uint8Array<ArrayBuffer>) => ({
      canonicalClaim: input,
      canonicalPlan: input,
      canonicalResult: input,
    }),
    processRequest: (input: Uint8Array<ArrayBuffer>) => input,
  },
} satisfies GeoSpecAssertionClientOptions;

type SourceEntry = readonly [path: string, content: string];

const filesystemWith = (entries: readonly SourceEntry[]): MemoryFileSystem => {
  const filesystem = new MemoryFileSystem();
  for (const [path, content] of entries) {
    filesystem.setText(path, content);
  }
  return filesystem;
};

const runModule = async (entries: readonly SourceEntry[], options: Record<string, unknown> = {}) =>
  runGeoSpecModule({
    filesystem: filesystemWith(entries),
    entryPath: entries[0]?.[0] ?? 'spec.geospec.ts',
    ...options,
  });

afterEach(() => {
  clearGeoSpecEngine();
  vi.restoreAllMocks();
});

describe('runGeoSpecModule', () => {
  it('should execute an authored module through the VM geospec builtin', async () => {
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
        import { describe, it, test, expectGeo } from 'geospec';
        describe('suite', () => {
          it('passes', () => { expectGeo(undefined); });
          test('aliased', () => {});
          it.skip('skipped');
          describe.skip('skipped suite');
        });
      `,
        ],
      ],
      { matcherWallBackstop: 1000, forensic: false },
    );

    expect(result.success).toBe(true);
    expect(result.success && result.passed).toBe(true);
    expect(result.success && result.tests.map((entry) => entry.name)).toStrictEqual([
      'passes',
      'aliased',
      'skipped',
      'skipped suite',
    ]);
  });

  it('should reject an invalid test-name pattern before compiling', async () => {
    const result = await runModule([['spec.geospec.ts', 'export const noop = 1;']], { testNamePattern: '(' });

    expect(result.success).toBe(false);
    expect(!result.success && result.issues[0]?.code).toBe('INVALID_GEOSPEC_TEST_NAME_PATTERN');
  });

  it('should surface bundle issues', async () => {
    const result = await runModule([['spec.geospec.ts', "import 'missing-module';"]]);

    expect(result.success).toBe(false);
  });

  it('should surface execution issues', async () => {
    const result = await runModule([['spec.geospec.ts', 'throw new Error("module exploded");']]);

    expect(result.success).toBe(false);
  });

  it('should register tests without running them in collect-only mode', async () => {
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          it('body', () => { globalThis.__RAN__ = true; });
        `,
        ],
      ],
      { collectOnly: true },
    );

    expect(result.success && result.tests.map((entry) => entry.status)).toStrictEqual(['skipped']);
    expect((globalThis as Record<string, unknown>)['__RAN__']).toBeUndefined();
  });

  it('should reuse a successful bundle while keeping each invocation fresh', async () => {
    const filesystem = filesystemWith([
      ['spec.geospec.ts', `import { it } from 'geospec'; it('first', () => {}); it('second', () => {});`],
    ]);
    const bundleCache = new Map();
    const collected = await runGeoSpecModule({
      filesystem,
      entryPath: 'spec.geospec.ts',
      collectOnly: true,
      bundleCache,
    });
    const shard = await runGeoSpecModule({
      filesystem,
      entryPath: 'spec.geospec.ts',
      testNamePattern: 'second$',
      bundleCache,
    });

    expect(collected.success).toBe(true);
    expect(shard.success).toBe(true);
    if (!collected.success || !shard.success) {
      return;
    }
    expect(shard.bundle).toBe(collected.bundle);
    expect(shard.tests.map(({ name }) => name)).toStrictEqual(['second']);

    filesystem.setText('spec.geospec.ts', `import { it } from 'geospec'; it('changed', () => {});`);
    const changed = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', bundleCache });
    expect(changed.success).toBe(true);
    if (!changed.success) {
      return;
    }
    expect(changed.bundle).not.toBe(collected.bundle);
    expect(changed.tests.map(({ name }) => name)).toStrictEqual(['changed']);
  });

  it('should rebundle a file saved after the bundler read it', async () => {
    const filesystem = filesystemWith([['spec.geospec.ts', `import { it } from 'geospec'; it('v1', () => {});`]]);
    filesystem.afterRead = (path) => {
      filesystem.afterRead = undefined;
      filesystem.setText(path, `import { it } from 'geospec'; it('v2', () => {});`);
    };
    const bundleCache = new Map();

    const first = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', bundleCache });
    const second = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', bundleCache });

    expect(first.success && first.tests.map(({ name }) => name)).toStrictEqual(['v1']);
    expect(second.success && second.tests.map(({ name }) => name)).toStrictEqual(['v2']);
  });

  it('should rebundle when a new file now wins an import resolution', async () => {
    const filesystem = filesystemWith([
      [
        'spec.geospec.ts',
        `import { it } from 'geospec'; import { variant } from './helper.js'; it(variant, () => {});`,
      ],
      ['helper.ts', `export const variant = 'helper.ts';`],
    ]);
    const bundleCache = new Map();

    const first = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', bundleCache });
    filesystem.setText('helper.js', `export const variant = 'helper.js';`);
    const second = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', bundleCache });

    expect(first.success && first.tests.map(({ name }) => name)).toStrictEqual(['helper.ts']);
    expect(second.success && second.tests.map(({ name }) => name)).toStrictEqual(['helper.js']);
  });

  it('should reject work that outlived its run when a later run reuses the bundle', async () => {
    const filesystem = filesystemWith([
      [
        'spec.geospec.ts',
        `
        import { it } from 'geospec';
        const ghost = globalThis.__GEOSPEC_TEST_GHOST__;
        if (ghost === undefined) {
          globalThis.__GEOSPEC_TEST_GHOST__ = () => it('ghost-from-run-1', () => {});
        } else {
          try {
            ghost();
          } catch (error) {
            globalThis.__GEOSPEC_TEST_GHOST_ERROR__ = String(error);
          }
        }
        it('body', () => {});
      `,
      ],
    ]);
    const bundleCache = new Map();
    const globals = globalThis as Record<string, unknown>;
    try {
      const first = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', bundleCache });
      const second = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', bundleCache });

      expect(second.success && second.bundle).toBe(first.success && first.bundle);
      expect(second.success && second.tests.map(({ name }) => name)).toStrictEqual(['body']);
      expect(globals['__GEOSPEC_TEST_GHOST_ERROR__']).toBe(
        'Error: GeoSpec runner binding is not active. Run the module through runGeoSpecModule().',
      );
    } finally {
      Reflect.deleteProperty(globals, '__GEOSPEC_TEST_GHOST__');
      Reflect.deleteProperty(globals, '__GEOSPEC_TEST_GHOST_ERROR__');
    }
  });

  it('should expose the injected model and step loaders to authored modules', async () => {
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          import { loadModel, createModelLoader } from 'geospec/model';
          import { loadStep, createStepLoader } from 'geospec/step';
          import { analyzeBrep } from 'geospec/brep';
          it('loads', async () => {
            const model = await loadModel({ source: 'a' });
            await createModelLoader({})({ source: 'b' });
            await loadStep({ source: 'c' });
            await createStepLoader({})({ source: 'd' });
            if (analyzeBrep({ subject: model }).success !== true) { throw new Error('expected brep evidence'); }
            if (analyzeBrep({ subject: {} }).success !== false) { throw new Error('expected subject rejection'); }
            if (analyzeBrep({ subject: { kind: 'geometry-subject' } }).success !== false) {
              throw new Error('expected evidence rejection');
            }
          });
        `,
        ],
      ],
      {
        modelLoader: async () => ({ ...subject, brep: {}, diagnostics: [] }),
        stepLoader: async () => subject,
      },
    );

    expect(result.success && result.tests[0]?.status).toBe('passed');
  });

  it('should fail authored loads when no loader is bound', async () => {
    const result = await runModule([
      [
        'spec.geospec.ts',
        `
        import { it } from 'geospec';
        import { loadModel } from 'geospec/model';
        import { loadStep } from 'geospec/step';
        it('model', async () => { await loadModel({ source: 'a' }); });
        it('step', async () => { await loadStep({ source: 'a' }); });
      `,
      ],
    ]);

    expect(result.success && result.tests.map((entry) => entry.status)).toStrictEqual(['failed', 'failed']);
    expect(result.success && result.tests[0]?.diagnostics[0]?.message).toContain('No GeoSpec model loader is active');
    expect(result.success && result.tests[1]?.diagnostics[0]?.message).toContain('No GeoSpec STEP loader is active');
  });

  it('should keep legacy and native authored APIs on separate bindings', async () => {
    const modelLoader = vi.fn(async () => subject);
    const nativeModelLoader = vi.fn(async () => ({ subjectHash: 'native-subject' }));
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { expectGeo, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          import { loadNativeModel } from 'geospec/runner/native';
          it('keeps declared APIs distinct', async () => {
            const legacy = await loadModel({ source: 'legacy' });
            const native = await loadNativeModel({ source: 'native', format: 'step' });
            if (legacy.kind !== 'geometry-subject' || native.subjectHash !== 'native-subject') {
              throw new Error('loader binding crossed API boundaries');
            }
            try {
              expectGeo(legacy);
              throw new Error('legacy expectGeo was silently rebound in native mode');
            } catch (error) {
              if (!String(error).includes('Legacy expectGeo is unavailable in native mode')) {
                throw error;
              }
            }
          });
        `,
        ],
      ],
      { modelLoader, nativeAssertions, nativeModelLoader },
    );

    expect(result.success && result.tests[0]?.status).toBe('passed');
    expect(modelLoader).toHaveBeenCalledOnce();
    expect(nativeModelLoader).toHaveBeenCalledOnce();
  });

  it('should diagnose legacy model loading without silently using the native loader', async () => {
    const nativeModelLoader = vi.fn(async () => ({ subjectHash: 'native-subject' }));
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          import { loadModel } from 'geospec/model';
          it('rejects the legacy loader', async () => { await loadModel({ source: 'legacy' }); });
        `,
        ],
      ],
      { nativeAssertions, nativeModelLoader },
    );

    expect(result.success && result.tests[0]?.status).toBe('failed');
    expect(result.success && result.tests[0]?.diagnostics[0]).toMatchObject({
      code: 'GEOSPEC_LEGACY_MODEL_LOADER_UNAVAILABLE_IN_NATIVE_MODE',
      message: 'No legacy GeoSpec model loader is active in this native runner.',
    });
    expect(nativeModelLoader).not.toHaveBeenCalled();
  });

  it('should settle an ordinary unawaited native admission before the module completes', async () => {
    const admitted = Promise.withResolvers<{ subjectHash: string }>();
    const nativeModelLoader = vi.fn(async () => admitted.promise);
    const completion = runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          import { loadNativeModel } from 'geospec/runner/native';
          it('admits', () => { void loadNativeModel({ source: 'native', format: 'step' }); });
        `,
        ],
      ],
      { nativeAssertions, nativeModelLoader },
    );
    await vi.waitFor(() => {
      expect(nativeModelLoader).toHaveBeenCalledOnce();
    });
    let completed = false;
    const observeCompletion = async (): Promise<void> => {
      await completion;
      completed = true;
    };
    void observeCompletion();
    await Promise.resolve();

    expect(completed).toBe(false);
    admitted.resolve({ subjectHash: 'native-subject' });

    await expect(completion).resolves.toMatchObject({ success: true, passed: true });
  });

  it('should drain successive finite chained admissions before the module completes', async () => {
    const first = Promise.withResolvers<{ subjectHash: string }>();
    const second = Promise.withResolvers<{ subjectHash: string }>();
    const nativeModelLoader = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise);
    const completion = runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          import { loadNativeModel } from 'geospec/runner/native';
          it('admits a finite chain', () => {
            void loadNativeModel({ source: 'first.step', format: 'step' })
              .then(() => loadNativeModel({ source: 'second.step', format: 'step' }));
          });
        `,
        ],
      ],
      { nativeAssertions, nativeModelLoader },
    );
    let completed = false;
    const observeCompletion = async (): Promise<void> => {
      await completion;
      completed = true;
    };
    const observed = observeCompletion();
    try {
      await vi.waitFor(() => {
        expect(nativeModelLoader).toHaveBeenCalledTimes(1);
      });
      expect(completed).toBe(false);
      first.resolve({ subjectHash: 'first-subject' });
      await vi.waitFor(() => {
        expect(nativeModelLoader).toHaveBeenCalledTimes(2);
      });
      expect(completed).toBe(false);
      second.resolve({ subjectHash: 'second-subject' });

      await expect(completion).resolves.toMatchObject({
        success: true,
        passed: true,
        tests: [{ name: 'admits a finite chain', status: 'passed' }],
      });
      expect(nativeModelLoader.mock.calls).toStrictEqual([
        [{ source: 'first.step', format: 'step' }],
        [{ source: 'second.step', format: 'step' }],
      ]);
    } finally {
      first.resolve({ subjectHash: 'first-subject' });
      second.resolve({ subjectHash: 'second-subject' });
      await observed;
    }
  });

  it('should retain ownership of a returned three-load callback chain', async () => {
    const first = Promise.withResolvers<{ subjectHash: string }>();
    const second = Promise.withResolvers<{ subjectHash: string }>();
    const third = Promise.withResolvers<{ subjectHash: string }>();
    const nativeModelLoader = vi
      .fn()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise)
      .mockImplementationOnce(async () => third.promise);
    const completion = runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          import { loadNativeModel } from 'geospec/runner/native';
          it('returns a finite chain', () => {
            return loadNativeModel({ source: 'first.step', format: 'step' })
              .then(() => loadNativeModel({ source: 'second.step', format: 'step' }))
              .then(() => loadNativeModel({ source: 'third.step', format: 'step' }));
          });
        `,
        ],
      ],
      { nativeAssertions, nativeModelLoader },
    );
    let completed = false;
    const observeCompletion = async (): Promise<void> => {
      await completion;
      completed = true;
    };
    const observed = observeCompletion();
    try {
      await vi.waitFor(() => {
        expect(nativeModelLoader).toHaveBeenCalledTimes(1);
      });
      expect(completed).toBe(false);
      first.resolve({ subjectHash: 'first-subject' });
      await vi.waitFor(() => {
        expect(nativeModelLoader).toHaveBeenCalledTimes(2);
      });
      expect(completed).toBe(false);
      second.resolve({ subjectHash: 'second-subject' });
      await vi.waitFor(() => {
        expect(nativeModelLoader).toHaveBeenCalledTimes(3);
      });
      expect(completed).toBe(false);
      third.resolve({ subjectHash: 'third-subject' });

      await expect(completion).resolves.toMatchObject({
        success: true,
        passed: true,
        tests: [{ name: 'returns a finite chain', status: 'passed' }],
      });
      expect(nativeModelLoader.mock.calls).toStrictEqual([
        [{ source: 'first.step', format: 'step' }],
        [{ source: 'second.step', format: 'step' }],
        [{ source: 'third.step', format: 'step' }],
      ]);
    } finally {
      first.resolve({ subjectHash: 'first-subject' });
      second.resolve({ subjectHash: 'second-subject' });
      third.resolve({ subjectHash: 'third-subject' });
      await observed;
    }
  });

  it('should register extra builtin modules', async () => {
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          import { answer } from 'custom-builtin';
          it('uses the builtin', () => { if (answer !== 42) { throw new Error('bad builtin'); } });
        `,
        ],
      ],
      { builtinModules: { 'custom-builtin': { version: '1', code: 'export const answer = 42;' } } },
    );

    expect(result.success && result.tests[0]?.status).toBe('passed');
  });

  it('should flush the engine evidence store at the module boundary', async () => {
    const flushEvidenceStore = vi.fn(async () => undefined);
    registerGeoSpecEngine({
      protocolVersion: geoSpecEngineProtocolVersion,
      engine: 'test-engine',
      version: '0.0.0',
      protocol: createTestGeoSpecEngineProtocol(),
      host: { flushEvidenceStore } satisfies Partial<GeoSpecEngineHostBindings>,
    });

    await runModule([['spec.geospec.ts', 'export const noop = 1;']]);

    expect(flushEvidenceStore).toHaveBeenCalledTimes(1);
  });
});

const passing = (name: string): string => `
  import { describe, it } from 'geospec';
  describe('runner', () => { it('${name}', () => {}); });
`;

describe('serial runner shell', () => {
  const runnerOptions = () => ({
    filesystem: filesystemWith([
      ['first.geospec.ts', passing('first')],
      ['second.geospec.ts', passing('second')],
    ]),
  });

  it('should run every file and emit the lifecycle events', async () => {
    const events: GeoSpecRunnerEvent[] = [];
    const runner = createSerialGeoSpecRunner(runnerOptions());
    const unsubscribe = runner.on('close', () => undefined);
    for (const type of ['run-start', 'file-start', 'file-complete', 'run-complete', 'close'] as const) {
      runner.on(type, (event) => events.push(event));
    }
    unsubscribe();

    const result = await runner.run({ files: ['first.geospec.ts', 'second.geospec.ts'] });
    await runner.close();
    await runner.close();

    expect(result.success).toBe(true);
    expect(result.passed).toBe(2);
    expect(result.selectedTests).toBe(2);
    expect(events.map((event) => event.type)).toStrictEqual([
      'run-start',
      'file-start',
      'file-complete',
      'file-start',
      'file-complete',
      'run-complete',
      'close',
    ]);
  });

  it('should reuse each file bundle across runs until the file changes', async () => {
    const options = runnerOptions();
    const runner = createSerialGeoSpecRunner(options);
    const bundleOf = async () => {
      const result = await runner.run({ files: ['first.geospec.ts'] });
      return result.files[0]?.result.bundle;
    };

    const first = await bundleOf();
    expect(first).toBeDefined();
    expect(await bundleOf()).toBe(first);
    options.filesystem.setText('first.geospec.ts', passing('edited'));
    expect(await bundleOf()).not.toBe(first);
    await runner.close();
  });

  it('should report a closed runner', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions());
    await runner.close();

    const result = await runner.run({ files: ['first.geospec.ts'] });

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_CLOSED');
  });

  it('should publish the idle close promise before notifying listeners', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions());
    let nestedClose: Promise<void> | undefined;
    let closeEvents = 0;
    runner.on('close', () => {
      closeEvents += 1;
      nestedClose = runner.close();
    });

    await runner.close();
    await nestedClose;

    expect(closeEvents).toBe(1);
  });

  it('should prevent overlap and let close drain ordinary mocked completion', async () => {
    let finishRelease: (() => void) | undefined;
    const releaseSettled = new Promise<void>((resolve) => {
      finishRelease = resolve;
    });
    const releaseAll = vi.fn(async () => releaseSettled);
    const nativeModelLoader = Object.assign(async () => ({ subjectHash: 'unused' }), { releaseAll });
    const runner = createSerialGeoSpecRunner({ ...runnerOptions(), nativeModelLoader });
    const events: GeoSpecRunnerEvent[] = [];
    runner.on('close', (event) => events.push(event));

    const firstRun = runner.run({ files: ['first.geospec.ts'] });
    await vi.waitFor(() => {
      expect(releaseAll).toHaveBeenCalledOnce();
    });
    const overlapping = await runner.run({ files: ['second.geospec.ts'] });
    let closeSettled = false;
    const observeClose = async (): Promise<void> => {
      await runner.close();
      closeSettled = true;
    };
    const closing = observeClose();
    await Promise.resolve();

    expect(overlapping.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_ACTIVE');
    expect(closeSettled).toBe(false);
    expect(events).toHaveLength(0);

    if (finishRelease !== undefined) {
      finishRelease();
    }
    const completed = await firstRun;
    await closing;

    expect(completed.success).toBe(true);
    expect(closeSettled).toBe(true);
    expect(events.map(({ type }) => type)).toStrictEqual(['close']);
    expect(releaseAll).toHaveBeenCalledOnce();
  });

  it('should stop at the abort reason', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the event handler closes over the runner it creates.
    let runner: ReturnType<typeof createSerialGeoSpecRunner>;
    runner = createSerialGeoSpecRunner(runnerOptions());
    runner.on('file-complete', () => {
      runner.abort('operator');
    });

    const result = await runner.run({ files: ['first.geospec.ts', 'second.geospec.ts'] });

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_ABORTED');
    expect(result.issues?.[0]?.message).toContain('operator');
  });

  it('should default the abort reason', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the event handler closes over the runner it creates.
    let runner: ReturnType<typeof createSerialGeoSpecRunner>;
    runner = createSerialGeoSpecRunner(runnerOptions());
    runner.on('file-complete', () => {
      runner.abort();
    });

    const result = await runner.run({ files: ['first.geospec.ts', 'second.geospec.ts'] });

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted: requested');
  });

  it('should bail after the first failing file', async () => {
    const runner = createSerialGeoSpecRunner({
      filesystem: filesystemWith([
        ['a.geospec.ts', 'throw new Error("boom");'],
        ['b.geospec.ts', passing('second')],
      ]),
    });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'], bail: true });

    expect(result.issues?.some((issue) => issue.code === 'GEOSPEC_RUNNER_BAILED')).toBe(true);
    expect(result.files).toHaveLength(1);
  });

  it('should report when filters select nothing', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions());

    const result = await runner.run({ files: ['first.geospec.ts'], testNamePattern: 'no-such-test' });

    expect(result.issues?.[0]?.code).toBe('NO_MATCHING_GEOSPEC_TESTS');
  });
});
