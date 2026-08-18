import type { VmFileSystem } from '@taucad/runtime/vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { geoSpecEngineProtocolVersion } from '#engine/protocol.js';
import { clearGeoSpecEngine, registerGeoSpecEngine } from '#engine/seam.js';
import type { GeoSpecEngineHostBindings } from '#engine/seam.js';
import { createTestGeoSpecEngineProtocol } from '#engine/protocol.test-support.js';
import type { GeometrySubject } from '#mesh/types.js';
import { runGeoSpecModule } from '#runner/index.js';
import type { GeoSpecRunnerEvent } from '#runner/worker/index.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';

class MemoryFileSystem implements VmFileSystem {
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
    entryPath: entries[0]?.[0] ?? '/spec.geospec.ts',
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
          '/spec.geospec.ts',
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
    const result = await runModule([['/spec.geospec.ts', 'export const noop = 1;']], { testNamePattern: '(' });

    expect(result.success).toBe(false);
    expect(!result.success && result.issues[0]?.code).toBe('INVALID_GEOSPEC_TEST_NAME_PATTERN');
  });

  it('should surface bundle issues', async () => {
    const result = await runModule([['/spec.geospec.ts', "import 'missing-module';"]]);

    expect(result.success).toBe(false);
  });

  it('should surface execution issues', async () => {
    const result = await runModule([['/spec.geospec.ts', 'throw new Error("module exploded");']]);

    expect(result.success).toBe(false);
  });

  it('should register tests without running them in collect-only mode', async () => {
    const result = await runModule(
      [
        [
          '/spec.geospec.ts',
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

  it('should expose the injected model and step loaders to authored modules', async () => {
    const result = await runModule(
      [
        [
          '/spec.geospec.ts',
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
        '/spec.geospec.ts',
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

  it('should register extra builtin modules', async () => {
    const result = await runModule(
      [
        [
          '/spec.geospec.ts',
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

    await runModule([['/spec.geospec.ts', 'export const noop = 1;']]);

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
      ['/first.geospec.ts', passing('first')],
      ['/second.geospec.ts', passing('second')],
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

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });
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

  it('should report a closed runner', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions());
    await runner.close();

    const result = await runner.run({ files: ['/first.geospec.ts'] });

    expect(result.issues?.[0]?.code).toBe('GEOSPEC_RUNNER_CLOSED');
  });

  it('should stop at the abort reason', async () => {
    // oxlint-disable-next-line eslint/prefer-const -- the event handler closes over the runner it creates.
    let runner: ReturnType<typeof createSerialGeoSpecRunner>;
    runner = createSerialGeoSpecRunner(runnerOptions());
    runner.on('file-complete', () => {
      runner.abort('operator');
    });

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

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

    const result = await runner.run({ files: ['/first.geospec.ts', '/second.geospec.ts'] });

    expect(result.issues?.[0]?.message).toBe('GeoSpec run aborted: requested');
  });

  it('should bail after the first failing file', async () => {
    const runner = createSerialGeoSpecRunner({
      filesystem: filesystemWith([
        ['/a.geospec.ts', 'throw new Error("boom");'],
        ['/b.geospec.ts', passing('second')],
      ]),
    });

    const result = await runner.run({ files: ['/a.geospec.ts', '/b.geospec.ts'], bail: true });

    expect(result.issues?.some((issue) => issue.code === 'GEOSPEC_RUNNER_BAILED')).toBe(true);
    expect(result.files).toHaveLength(1);
  });

  it('should report when filters select nothing', async () => {
    const runner = createSerialGeoSpecRunner(runnerOptions());

    const result = await runner.run({ files: ['/first.geospec.ts'], testNamePattern: 'no-such-test' });

    expect(result.issues?.[0]?.code).toBe('NO_MATCHING_GEOSPEC_TESTS');
  });
});
