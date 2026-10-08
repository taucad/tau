import type { VmFileSystem } from '@taucad/esbuild/vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GeoSpecAssertionClientOptions } from '#assertion-client/index.js';
import { createGeoSpecNativeModelLoader } from '#model/native-model-loader.js';
import type { GeoSpecModelLoadEvidence, GeoSpecNativeModelEngine } from '#model/native-model-loader.js';
import type { SourceRevision } from '@taucad/runtime/types';
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
    nativeAssertions,
    ...options,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runGeoSpecModule', () => {
  it('should release an explicitly disposed child admission before admitting another bounded child', async () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const releaseSubject = vi.fn(() => encode({ result: {} }));
    const engine: GeoSpecNativeModelEngine = {
      ...nativeAssertions.engine,
      processRequest: () =>
        encode({
          requestId: 'configuration',
          result: {
            canonicalProfile: 'geospec-jcs-v1',
            protocolVersion: 3,
            registryVersion: 5,
            configuration: { binaryAdmissionLimits: { maxSubjectBytes: 1024, maxTotalBinaryBytes: 1024 } },
          },
        }),
      ingestSubject: (_request, primary) =>
        encode({ result: { subject: { subjectHash: String(primary[0]).repeat(64) } } }),
      subjectHandle: () => encode({ result: { subjectHandle: 'owned' } }),
      releaseSubject,
    };
    const nativeModelLoader = createGeoSpecNativeModelLoader({ engine });
    try {
      const result = await runModule(
        [
          [
            'spec.geospec.ts',
            `
        import { it } from 'geospec';
        import { createModelLoader } from 'geospec/model';
        it('releases only the closed child', async () => {
          const first = createModelLoader({ format: 'step' });
          const bytes = new Uint8Array(800); bytes[0] = 1;
          await first({ source: bytes });
          await Promise.all([first.dispose(), first.dispose()]);
          const second = createModelLoader({ format: 'step' });
          bytes[0] = 2;
          await second({ source: bytes });
          await second.dispose();
          await first({ source: bytes });
          await first.dispose();
        });
      `,
          ],
        ],
        { nativeAssertions: { engine }, nativeModelLoader },
      );
      expect(result.lineage?.loads.map(({ status, error }) => ({ status, error }))).toEqual([
        { status: 'complete', error: undefined },
        { status: 'complete', error: undefined },
        { status: 'complete', error: undefined },
      ]);
      expect(result.success && result.tests[0]?.status).toBe('passed');
      expect(releaseSubject).toHaveBeenCalledTimes(3);
    } finally {
      await nativeModelLoader.releaseAll();
    }
  });
  it('should invalidate a child even when its genuine lease release fails and retain cleanup for retry', async () => {
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const evaluateClaim = vi.fn(nativeAssertions.engine.evaluateClaim);
    const failure = new Error('Owned subject release refused.');
    const releaseSubject = vi
      .fn(() => encode({ result: {} }))
      .mockImplementationOnce(() => {
        throw failure;
      });
    const engine: GeoSpecNativeModelEngine = {
      ...nativeAssertions.engine,
      evaluateClaim,
      processRequest: () =>
        encode({
          requestId: 'configuration',
          result: {
            canonicalProfile: 'geospec-jcs-v1',
            protocolVersion: 3,
            registryVersion: 5,
            configuration: { binaryAdmissionLimits: { maxSubjectBytes: 1024, maxTotalBinaryBytes: 1024 } },
          },
        }),
      ingestSubject: () => encode({ result: { subject: { subjectHash: '1'.repeat(64) } } }),
      subjectHandle: () => encode({ result: { subjectHandle: 'owned' } }),
      releaseSubject,
    };
    const nativeModelLoader = createGeoSpecNativeModelLoader({ engine });
    try {
      const result = await runModule(
        [
          [
            'spec.geospec.ts',
            `
        import { it, expectGeo } from 'geospec';
        import { createModelLoader } from 'geospec/model';
        it('preserves caught expired-subject failure after cleanup refuses', async () => {
          const load = createModelLoader({ format: 'step' });
          const subject = await load({ source: Uint8Array.of(1) });
          try { await load.dispose(); throw new Error('Expected disposal to refuse.'); }
          catch (error) {
            if (error.name !== 'AggregateError' || error.message !== 'GeoSpec model scope disposal failed.' ||
                error.errors[0].message !== 'Owned subject release refused.') { throw error; }
          }
          try { expectGeo(subject).toBeWatertight(); } catch {}
          await load.dispose();
        });
      `,
          ],
        ],
        { nativeAssertions: { engine }, nativeModelLoader },
      );
      expect(result.success && result.tests[0]?.status).toBe('failed');
      expect(result.success && result.tests[0]?.assertions[0]?.passed).toBe(false);
      expect(evaluateClaim).not.toHaveBeenCalled();
      expect(releaseSubject).toHaveBeenCalledTimes(2);
    } finally {
      await nativeModelLoader.releaseAll();
    }
  });
  it.each(['primary', 'resource'] as const)(
    'should detect edited %s bytes even when the host admits equal geometry',
    async (kind) => {
      let generation = 0;
      const nativeModelLoader = async () => ({
        contentHash: 'a'.repeat(64),
        load: {
          loadId: 'host-load',
          status: 'complete',
          format: 'gsm1',
          parameters: {},
          ingestOptions: {},
          ...(kind === 'primary' ? { sourcePath: 'part.gsm1' } : {}),
          artifacts: [
            {
              name: 'alias.bin',
              sourcePath: 'part.gsm1',
              sha256: (++generation === 1 ? 'b' : 'c').repeat(64),
              byteLength: 1,
            },
          ],
        } satisfies GeoSpecModelLoadEvidence,
      });
      const result = await runModule(
        [
          [
            'spec.geospec.ts',
            `
      import { it } from 'geospec'; import { loadModel } from 'geospec/model';
      it('direct edits', async () => { await loadModel({ source: 'part.gsm1' }); await loadModel({ source: 'part.gsm1' }); });
    `,
          ],
        ],
        { nativeAssertions, nativeModelLoader },
      );
      expect(result).toMatchObject({
        success: true,
        passed: false,
        lineage: { status: 'mixed', loads: [{ status: 'complete' }, { status: 'complete' }] },
      });
    },
  );

  it('should retain registered not-run tests and module identity after execution fails', async () => {
    const result = await runModule([
      [
        'spec.geospec.ts',
        `import { it } from 'geospec'; it('pending', () => {}); throw new Error('registration interrupted');`,
      ],
    ]);
    expect(result).toMatchObject({
      success: false,
      tests: [{ status: 'not-run' }],
      accounting: { discovered: 1, selected: 0, completed: 0, notRun: 1 },
      lineage: { modules: [{ entryPath: 'spec.geospec.ts' }] },
    });
  });

  it('should account for discovered filtered-out tests without claiming they ran', async () => {
    const result = await runModule(
      [['spec.geospec.ts', `import { it } from 'geospec'; it('selected', () => {}); it('excluded', () => {});`]],
      { testNamePattern: '^selected$' },
    );
    expect(result).toMatchObject({
      success: true,
      passed: true,
      tests: [{ name: 'selected', status: 'passed' }],
      accounting: { discovered: 2, selected: 1, completed: 1, passed: 1, notRun: 1 },
    });
  });

  it('should retain conflicting load graphs instead of laundering the last graph as coherent', async () => {
    // Fixed lowercase-hex fixture digests exercise lineage bookkeeping, not a geometry producer.
    const digest = (letter: 'b' | 'c' | 'e') => `sha256:${letter.repeat(64)}` as SourceRevision['files'][string];
    let generation = 0;
    const nativeModelLoader = async () => ({
      subjectHash: 'a'.repeat(64),
      load: {
        loadId: 'host-load',
        status: 'complete',
        format: 'glb',
        parameters: {},
        ingestOptions: {},
        artifacts: [{ name: 'part.glb', sha256: 'd'.repeat(64), byteLength: 1 }],
        sourceRevision: {
          entry: 'main.ts',
          files: { 'main.ts': digest('b'), 'cache.json': digest(++generation === 1 ? 'c' : 'e') },
        },
      } satisfies GeoSpecModelLoadEvidence,
    });
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
      import { it } from 'geospec'; import { loadModel } from 'geospec/model';
      it('two generations', async () => { await loadModel({ file: 'main.ts' }); await loadModel({ file: 'main.ts' }); });
    `,
        ],
      ],
      { nativeAssertions, nativeModelLoader },
    );
    expect(result).toMatchObject({
      success: true,
      passed: false,
      lineage: {
        status: 'mixed',
        loads: [
          { evidence: { sourceRevision: { files: { 'cache.json': digest('c') } } } },
          { evidence: { sourceRevision: { files: { 'cache.json': digest('e') } } } },
        ],
      },
    });
    if (!result.success || result.lineage === undefined) {
      throw new Error('Expected observed lineage.');
    }
    expect(new Set(result.lineage.loads.map((load) => load.loadId)).size).toBe(2);
  });

  it('should accept contentHash host identities and keep same-geometry parameter loads distinct', async () => {
    let width = 0;
    const nativeModelLoader = async () => ({
      contentHash: 'a'.repeat(64),
      load: {
        loadId: 'host-load',
        status: 'complete',
        format: 'gsm1',
        parameters: { width: ++width },
        ingestOptions: {},
        artifacts: [{ name: 'part.gsm1', sha256: 'b'.repeat(64), byteLength: 1 }],
      } satisfies GeoSpecModelLoadEvidence,
    });
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
      import { it } from 'geospec'; import { loadModel } from 'geospec/model';
      it('variants', async () => { await loadModel({ source: 'part.gsm1' }); await loadModel({ source: 'part.gsm1' }); });
    `,
        ],
      ],
      { nativeAssertions, nativeModelLoader },
    );
    expect(result).toMatchObject({
      success: true,
      passed: true,
      lineage: {
        status: 'complete',
        loads: [
          { subject: { contentHash: 'a'.repeat(64) }, evidence: { parameters: { width: 1 } } },
          { subject: { contentHash: 'a'.repeat(64) }, evidence: { parameters: { width: 2 } } },
        ],
      },
    });
  });

  it('should not report coherent success for a host load without per-load lineage', async () => {
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
      import { it } from 'geospec';
      import { loadModel } from 'geospec/model';
      it('loads', async () => { await loadModel({ source: 'part.step', format: 'step' }); });
    `,
        ],
      ],
      { nativeAssertions, nativeModelLoader: async () => ({ subjectHash: 'a'.repeat(64) }) },
    );
    expect(result).toMatchObject({
      success: true,
      passed: false,
      lineage: { status: 'unavailable', loads: [{ status: 'unavailable' }] },
    });
  });

  it('should retain a rejected detached admission before final module settlement', async () => {
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
      import { it } from 'geospec';
      import { loadModel } from 'geospec/model';
      it('starts a detached load', () => { void loadModel({ source: 'part.step', format: 'step' }).catch(() => {}); });
    `,
        ],
      ],
      {
        nativeAssertions,
        nativeModelLoader: async () => {
          throw new Error('load interrupted');
        },
      },
    );
    expect(result).toMatchObject({ success: true, passed: false, lineage: { loads: [{ status: 'failed' }] } });
  });

  it('should retain collect-only work as not-run rather than a completed pass', async () => {
    const result = await runModule([['spec.geospec.ts', `import { it } from 'geospec'; it('pending', () => {});`]], {
      collectOnly: true,
    });
    expect(result).toMatchObject({
      success: true,
      passed: false,
      tests: [{ status: 'not-run' }],
      accounting: { discovered: 1, selected: 0, completed: 0, notRun: 1 },
    });
  });

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
    // A missing project file fails inside the bundler; a missing bare package would go to the network first.
    const result = await runModule([['spec.geospec.ts', "import './missing-module.js';"]]);

    expect(result.success).toBe(false);
    expect(!result.success && result.issues[0]?.code).toBe('BUNDLER_FAILED');
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

    expect(result.success && result.tests.map((entry) => entry.status)).toStrictEqual(['not-run']);
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
      nativeAssertions,
      collectOnly: true,
      bundleCache,
    });
    const shard = await runGeoSpecModule({
      filesystem,
      entryPath: 'spec.geospec.ts',
      nativeAssertions,
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
    const changed = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', nativeAssertions, bundleCache });
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

    const first = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', nativeAssertions, bundleCache });
    const second = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', nativeAssertions, bundleCache });

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

    const first = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', nativeAssertions, bundleCache });
    filesystem.setText('helper.js', `export const variant = 'helper.js';`);
    const second = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', nativeAssertions, bundleCache });

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
      const first = await runGeoSpecModule({ filesystem, entryPath: 'spec.geospec.ts', nativeAssertions, bundleCache });
      const second = await runGeoSpecModule({
        filesystem,
        entryPath: 'spec.geospec.ts',
        nativeAssertions,
        bundleCache,
      });

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

  it('should fail authored loads when no loader is bound', async () => {
    const result = await runModule([
      [
        'spec.geospec.ts',
        `
        import { it } from 'geospec';
        import { createModelLoader, loadModel } from 'geospec/model';
        it('model', async () => { await loadModel({ source: 'a' }); });
        it('managed', () => { createModelLoader({}); });
      `,
      ],
    ]);

    expect(result.success && result.tests.map((entry) => entry.status)).toStrictEqual(['failed', 'failed']);
    expect(result.success && result.tests[0]?.diagnostics[0]?.message).toContain('No GeoSpec model loader is active');
    expect(result.success && result.tests[1]?.diagnostics[0]?.message).toContain(
      'No managed GeoSpec model loader is active',
    );
  });

  it('should bind canonical loading to the compiled host', async () => {
    const nativeModelLoader = vi.fn(async () => ({ subjectHash: 'native-subject' }));
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { expectGeo, it } from 'geospec';
          import { loadModel } from 'geospec/model';
          it('admits an opaque canonical subject', async () => {
            const model = await loadModel({ source: 'native', format: 'step' });
            if (Object.keys(model).length !== 0 || typeof expectGeo(model).toHaveVolume !== 'function') {
              throw new Error('canonical admission leaked its host identity');
            }
          });
        `,
        ],
      ],
      { nativeModelLoader },
    );

    expect(result.success && result.tests[0]?.status).toBe('passed');
    expect(nativeModelLoader).toHaveBeenCalledOnce();
  });

  it('should retain canonical opaque host admission lineage without an entry-path map', async () => {
    const load: GeoSpecModelLoadEvidence = {
      loadId: 'host-load',
      status: 'complete',
      format: 'glb',
      parameters: { width: 2 },
      ingestOptions: {},
      artifacts: [{ name: 'part.glb', sha256: 'a'.repeat(64), byteLength: 24 }],
    };
    const nativeModelLoader = async () => ({ subjectHash: 'b'.repeat(64), load });
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `import { it } from 'geospec'; import { loadModel } from 'geospec/model';
      it('load', async () => { await loadModel({ source: 'part.glb' }); });`,
        ],
      ],
      { nativeModelLoader },
    );
    expect(result).toMatchObject({
      success: true,
      passed: true,
      lineage: {
        status: 'complete',
        loads: [
          {
            status: 'complete',
            subject: { subjectHash: 'b'.repeat(64) },
            evidence: { parameters: { width: 2 }, artifacts: load.artifacts },
          },
        ],
      },
    });
    expect(result.lineage?.loads[0]?.loadId).not.toBe('host-load');
  });

  it('should preserve definition ordinals for duplicate names and filtered collections', async () => {
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `import { it } from 'geospec'; it('excluded', () => {}); it('same', () => {}); it('same', () => {});`,
        ],
      ],
      { testNamePattern: '^same$' },
    );
    expect(result.tests?.map((test) => [test.name, test.ordinal])).toEqual([
      ['same', 1],
      ['same', 2],
    ]);
  });

  it('should admit canonical loads when only the compiled loader is bound', async () => {
    const nativeModelLoader = vi.fn(async () => ({ subjectHash: 'native-subject' }));
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
          import { it } from 'geospec';
          import { loadModel } from 'geospec/model';
          it('loads through the canonical binding', async () => { await loadModel({ source: 'native' }); });
        `,
        ],
      ],
      { nativeAssertions, nativeModelLoader },
    );

    expect(result.success && result.tests[0]?.status).toBe('passed');
    expect(nativeModelLoader).toHaveBeenCalledOnce();
  });

  it('should expire a managed VM scope before any later assertion can evaluate geometry', async () => {
    const evaluateClaim = vi.fn(nativeAssertions.engine.evaluateClaim);
    const nativeModelLoader = vi.fn(async () => ({ subjectHash: 'a'.repeat(64) }));
    const result = await runModule(
      [
        [
          'spec.geospec.ts',
          `
        import { it, expectGeo } from 'geospec';
        import { createModelLoader } from 'geospec/model';
        it('retains caught expired-scope failure', async () => {
          const load = createModelLoader({ format: 'step' });
          const model = await load({ source: 'part.step' });
          const chain = expectGeo(model);
          await load.dispose();
          try { chain.toBeWatertight(); } catch {}
        });
      `,
        ],
      ],
      { nativeAssertions: { engine: { ...nativeAssertions.engine, evaluateClaim } }, nativeModelLoader },
    );
    expect(result.success && result.tests[0]?.status).toBe('failed');
    expect(result.success && result.tests[0]?.assertions[0]?.passed).toBe(false);
    expect(evaluateClaim).not.toHaveBeenCalled();
    expect(nativeModelLoader).toHaveBeenCalledWith({ format: 'step', source: 'part.step' });
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
          import { loadModel } from 'geospec/model';
          it('admits', () => { void loadModel({ source: 'native', format: 'step' }); });
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

    await expect(completion).resolves.toMatchObject({
      success: true,
      passed: false,
      lineage: { status: 'unavailable' },
    });
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
          import { loadModel } from 'geospec/model';
          it('admits a finite chain', () => {
            void loadModel({ source: 'first.step', format: 'step' })
              .then(() => loadModel({ source: 'second.step', format: 'step' }));
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
        passed: false,
        lineage: { status: 'unavailable' },
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
          import { loadModel } from 'geospec/model';
          it('returns a finite chain', () => {
            return loadModel({ source: 'first.step', format: 'step' })
              .then(() => loadModel({ source: 'second.step', format: 'step' }))
              .then(() => loadModel({ source: 'third.step', format: 'step' }));
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
        passed: false,
        lineage: { status: 'unavailable' },
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
});

const passing = (name: string): string => `
  import { describe, it } from 'geospec';
  describe('runner', () => { it('${name}', () => {}); });
`;

describe('serial runner shell', () => {
  const runnerOptions = () => ({
    nativeAssertions,
    filesystem: filesystemWith([
      ['first.geospec.ts', passing('first')],
      ['second.geospec.ts', passing('second')],
    ]),
  });

  it('should reject duplicate files before run-start without silently deduplicating the request', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions());
    const start = vi.fn();
    runner.on('run-start', start);
    const result = await runner.run({ files: ['first.geospec.ts', 'first.geospec.ts'] });
    expect(start).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: false,
      issues: [{ code: 'GEOSPEC_DUPLICATE_FILES' }],
      accounting: {
        requestedFiles: ['first.geospec.ts', 'first.geospec.ts'],
        notRunFiles: ['first.geospec.ts', 'first.geospec.ts'],
        discoveryComplete: false,
      },
    });
    await runner.close();
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
    expect(result.accounting).toMatchObject({
      cancelled: true,
      completedFiles: ['first.geospec.ts'],
      notRunFiles: ['second.geospec.ts'],
      discoveryComplete: false,
    });
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
      nativeAssertions,
      filesystem: filesystemWith([
        ['a.geospec.ts', 'throw new Error("boom");'],
        ['b.geospec.ts', passing('second')],
      ]),
    });

    const result = await runner.run({ files: ['a.geospec.ts', 'b.geospec.ts'], bail: true });

    expect(result.issues?.some((issue) => issue.code === 'GEOSPEC_RUNNER_BAILED')).toBe(true);
    expect(result.files).toHaveLength(1);
    expect(result.accounting).toMatchObject({
      requestedFiles: ['a.geospec.ts', 'b.geospec.ts'],
      completedFiles: ['a.geospec.ts'],
      notRunFiles: ['b.geospec.ts'],
      discoveryComplete: false,
      bailed: true,
    });
  });

  it('should report when filters select nothing', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions());

    const result = await runner.run({ files: ['first.geospec.ts'], testNamePattern: 'no-such-test' });

    expect(result.issues?.[0]?.code).toBe('NO_MATCHING_GEOSPEC_TESTS');
  });
});
