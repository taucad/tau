import { geoSpecDefaultMaxWorkUnitLimit } from '@taucad/chat/constants';
import { geoSpecMaximumWorkUnitLimit } from 'geospec/assertion-client';
import { describe, expect, it, vi } from 'vitest';

import type { GeoSpecDiscoveryFileSystem, GeoSpecTestCase } from 'geospec/runner';
import type {
  GeoSpecRunner,
  GeoSpecRunnerEvent,
  GeoSpecRunnerResult,
  GeoSpecRunnerRunOptions,
} from 'geospec/runner/worker';

import type { SourceRevision } from '@taucad/runtime';

import type { GeoSpecRunProgressEvent } from '#geospec/run-progress.js';
import { hasGeoSpecSelectionFilters, runGeoSpecTests } from '#geospec/run-tests.js';

const discoveryOver = (tree: Record<string, readonly string[]>): GeoSpecDiscoveryFileSystem => ({
  readdir: async (path: string) => tree[path] ?? [],
  stat: async (path: string) => ({ kind: path in tree ? 'directory' : 'file' }),
});

/** The adapter takes `Pick<GeoSpecRunner, 'run'>`, so the fake implements exactly that slice. */
const passingRunner = () => ({
  run: vi.fn(
    async ({ files }: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> => ({
      success: true,
      passed: 1,
      failed: 0,
      selectedTests: 1,
      files: files.map((file) => ({
        file,
        result: {
          success: true,
          passed: true,
          tests: [{ suite: ['cube'], name: 'is watertight', status: 'passed', assertions: [], diagnostics: [] }],
          bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
        },
      })),
    }),
  ),
});

describe('runGeoSpecTests', () => {
  it('discovers project-relative files and projects the runner verdict', async () => {
    const runner = passingRunner();
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': ['cube.geospec.ts'] }),
      runner,
      args: {},
    });

    expect(runner.run).toHaveBeenCalledWith({ files: ['cube.geospec.ts'] });
    expect(output).toMatchObject({ passed: 1, total: 1, failures: [] });
    expect(output.passes[0]).toMatchObject({ requirement: 'cube > is watertight', targetFile: 'cube.geospec.ts' });
  });

  it('names the source revision of every model the run loaded (R4)', async () => {
    // The digest is branded by `@taucad/cache-core`; a fixture asserts the shape, not the brand.
    const revision = {
      entry: 'cube.ts',
      files: { 'cube.ts': `sha256:${'a'.repeat(64)}` },
    } as unknown as SourceRevision;

    const secondRevision = { ...revision, files: { ...revision.files } };
    const runner = passingRunner();
    const result = await runner.run({ files: ['cube.geospec.ts'] });
    const fileResult = result.files[0];
    if (fileResult === undefined) {
      throw new Error('Expected the fixture module');
    }
    fileResult.result.lineage = {
      status: 'mixed',
      modules: [],
      loads: [revision, secondRevision].map((sourceRevision, index) => ({
        loadId: `load-${index}`,
        status: 'complete',
        evidence: {
          loadId: `load-${index}`,
          status: 'complete',
          format: 'step',
          parameters: { width: index + 1 },
          ingestOptions: {},
          sourceRevision,
          artifacts: [{ name: 'cube.step', sha256: String(index).repeat(64), byteLength: 1 }],
        },
      })),
    };
    runner.run.mockResolvedValue(result);
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': ['cube.geospec.ts'] }),
      runner,
      args: {},
    });

    expect(output.sourceRevisions).toEqual([revision, secondRevision]);
    expect(output.lineage?.[0]?.lineage.loads.map(({ evidence }) => evidence?.parameters)).toEqual([
      { width: 1 },
      { width: 2 },
    ]);
    expect(output.runStatus).toBe('inconclusive');
  });

  it('omits provenance entirely for a run that loaded no model through the runtime', async () => {
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': ['cube.geospec.ts'] }),
      runner: passingRunner(),
      args: {},
    });

    expect(output).not.toHaveProperty('sourceRevisions');
    expect(output.lineageStatus).toBe('unavailable');
  });

  it('never runs, and names the missing-file failure, when nothing is discovered', async () => {
    const runner = passingRunner();
    const output = await runGeoSpecTests({ discovery: discoveryOver({ '': [] }), runner, args: {} });

    expect(runner.run).not.toHaveBeenCalled();
    expect(output.failures[0]).toMatchObject({ id: 'missing_geospec_file' });
  });

  it('reports a filtered empty selection differently from an empty project', async () => {
    const runner = passingRunner();
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': [] }),
      runner,
      args: { include: ['parts/**/*.geospec.ts'] },
    });

    expect(output.failures[0]).toMatchObject({ id: 'NO_MATCHING_GEOSPEC_TESTS' });
  });

  it('forwards only the selection options the caller supplied', async () => {
    const runner = passingRunner();
    await runGeoSpecTests({
      discovery: discoveryOver({ '': ['cube.geospec.ts'] }),
      runner,
      args: { testNamePattern: 'watertight', testTimeout: 5000, workUnitLimit: 64_000_000 },
    });

    expect(runner.run).toHaveBeenCalledWith({
      files: ['cube.geospec.ts'],
      testNamePattern: 'watertight',
      testTimeout: 5000,
      workUnitLimit: 64_000_000,
    });
  });

  it("defaults the run work-unit maximum to GeoSpec's default authored maximum", () => {
    expect(geoSpecDefaultMaxWorkUnitLimit).toBe(geoSpecMaximumWorkUnitLimit);
  });
});

describe('runGeoSpecTests progress and kernel facts', () => {
  const refusingRunner = () => {
    const listeners = new Set<(event: GeoSpecRunnerEvent) => void>();
    const emit = (event: GeoSpecRunnerEvent): void => {
      for (const listener of listeners) {
        listener(event);
      }
    };
    const runner: Pick<GeoSpecRunner, 'on' | 'run'> = {
      on(type, handler) {
        const matches = (event: GeoSpecRunnerEvent): event is Extract<GeoSpecRunnerEvent, { type: typeof type }> =>
          event.type === type;
        const listener = (event: GeoSpecRunnerEvent): void => {
          if (matches(event)) {
            handler(event);
          }
        };
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      run: vi.fn(async ({ files }: GeoSpecRunnerRunOptions): Promise<GeoSpecRunnerResult> => {
        emit({ type: 'run-start', files });
        const test: GeoSpecTestCase = {
          suite: ['lamp'],
          name: 'occurrences',
          status: 'inconclusive',
          assertions: [
            {
              kind: 'assemblyOccurrences',
              subject: {},
              expected: {},
              passed: false,
              loadId: 'load-1',
              diagnostics: [
                {
                  code: 'GEOSPEC_UNSUPPORTED_EVIDENCE',
                  severity: 'error',
                  message: 'toHaveAssemblyOccurrences() needs exact BRep evidence.',
                  suggestion: "loadModel({ file, format: 'step' })",
                },
              ],
            },
          ],
          diagnostics: [],
        };
        emit({ type: 'test-complete', file: 'lamp.geospec.ts', test });
        return {
          success: false,
          passed: 0,
          failed: 0,
          selectedTests: 1,
          files: [
            {
              file: 'lamp.geospec.ts',
              result: {
                success: true,
                passed: false,
                tests: [test],
                bundle: { code: '', issues: [], success: true, dependencies: [], unresolvedPaths: [] },
                lineage: {
                  status: 'complete',
                  modules: [],
                  loads: [
                    {
                      loadId: 'load-1',
                      status: 'complete',
                      evidence: {
                        loadId: 'load-1',
                        status: 'complete',
                        format: 'glb',
                        parameters: {},
                        ingestOptions: {},
                        sourcePath: 'main.ts',
                        artifacts: [{ name: 'main.glb', sha256: 'd'.repeat(64), byteLength: 1 }],
                      },
                    },
                  ],
                },
              },
            },
          ],
        };
      }),
    };
    return { runner, listeners };
  };

  it('forwards projected progress while the run executes and unsubscribes after it', async () => {
    const { runner, listeners } = refusingRunner();
    const events: GeoSpecRunProgressEvent[] = [];
    await runGeoSpecTests({
      discovery: discoveryOver({ '': ['lamp.geospec.ts'] }),
      runner,
      args: {},
      onProgress: (event) => events.push(event),
    });

    expect(events.map((event) => event.type)).toStrictEqual(['run-start', 'test-complete']);
    expect(listeners.size).toBe(0);
  });

  it('asks the host for the kernel of a refused load and names its mesh alternative', async () => {
    const { runner } = refusingRunner();
    const kernelEvidence = vi.fn(async () => ({ kernelId: 'picovoxel', directBrepStep: false }));
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': ['lamp.geospec.ts'] }),
      runner,
      args: {},
      kernelEvidence,
    });

    expect(kernelEvidence).toHaveBeenCalledWith('main.ts');
    expect(output.failures[0]).toMatchObject({ category: 'unsupported-evidence' });
    expect(output.failures[0]?.suggestion).toContain("kernel 'picovoxel'");
    expect(output.failures[0]?.suggestion).not.toContain("format: 'step'");
  });

  it('keeps the generic evidence guidance when the kernel lookup fails', async () => {
    const { runner } = refusingRunner();
    const output = await runGeoSpecTests({
      discovery: discoveryOver({ '': ['lamp.geospec.ts'] }),
      runner,
      args: {},
      kernelEvidence: async () => {
        throw new Error('describe failed');
      },
    });

    expect(output.failures[0]?.suggestion).toContain('mesh-only kernel this matcher is unsupported');
  });

  it('never asks for kernel facts when no failure is an evidence refusal', async () => {
    const kernelEvidence = vi.fn(async () => undefined);
    await runGeoSpecTests({
      discovery: discoveryOver({ '': ['cube.geospec.ts'] }),
      runner: passingRunner(),
      args: {},
      kernelEvidence,
    });

    expect(kernelEvidence).not.toHaveBeenCalled();
  });
});

describe('hasGeoSpecSelectionFilters', () => {
  it.each([
    { args: {}, expected: false },
    { args: { files: [] }, expected: false },
    { args: { testNamePattern: '' }, expected: false },
    { args: { files: ['a.geospec.ts'] }, expected: true },
    { args: { include: ['**/*.geospec.ts'] }, expected: true },
    { args: { exclude: ['slow/**'] }, expected: true },
    { args: { testNamePattern: 'watertight' }, expected: true },
  ])('answers $expected for $args', ({ args, expected }) => {
    expect(hasGeoSpecSelectionFilters(args)).toBe(expected);
  });
});
