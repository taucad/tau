import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { runGeoSpecModule } from '#runner/run-geospec-module.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';
import type { GeoSpecRunnerOptions } from '#runner/worker/index.js';
import type { GeoSpecRunResult, GeoSpecTestCase } from '#runner/types.js';

vi.mock('#runner/run-geospec-module.js', () => ({ runGeoSpecModule: vi.fn() }));

it('qualifies differing actual resource generations across complete modules', async () => {
  const passing = (sha256: string): GeoSpecRunResult => ({
    success: true,
    passed: true,
    bundle: mock<Extract<GeoSpecRunResult, { success: true }>['bundle']>(),
    tests: [{ suite: [], name: 'resource', assertions: [], status: 'passed', diagnostics: [] }],
    lineage: {
      status: 'complete',
      modules: [],
      loads: [
        {
          loadId: 'load',
          status: 'complete',
          evidence: {
            loadId: 'load',
            status: 'complete',
            format: 'gltf',
            parameters: {},
            ingestOptions: {},
            artifacts: [{ name: 'alias.bin', sourcePath: 'textures/data.bin', sha256, byteLength: 1 }],
          },
        },
      ],
    },
  });
  vi.mocked(runGeoSpecModule)
    .mockResolvedValueOnce(passing('a'.repeat(64)))
    .mockResolvedValueOnce(passing('b'.repeat(64)));
  const runner = createSerialGeoSpecRunner({
    filesystem: mock<GeoSpecRunnerOptions['filesystem']>(),
    nativeAssertions: mock<GeoSpecRunnerOptions['nativeAssertions']>(),
  });
  const result = await runner.run({ files: ['first.geospec.ts', 'second.geospec.ts'] });
  await runner.close();
  expect(result).toMatchObject({ success: false, failed: 0, lineageStatus: 'mixed' });
});

it('emits test-start and test-complete events tagged with their file as each test settles', async () => {
  const test: GeoSpecTestCase = {
    suite: ['shade'],
    name: 'is one piece',
    ordinal: 0,
    assertions: [],
    status: 'passed',
    diagnostics: [],
  };
  vi.mocked(runGeoSpecModule).mockImplementationOnce(async (options) => {
    options.onTestEvent?.({ type: 'test-start', test });
    options.onTestEvent?.({ type: 'test-complete', test });
    return {
      success: true,
      passed: true,
      bundle: mock<Extract<GeoSpecRunResult, { success: true }>['bundle']>(),
      tests: [test],
    };
  });
  const runner = createSerialGeoSpecRunner({
    filesystem: mock<GeoSpecRunnerOptions['filesystem']>(),
    nativeAssertions: mock<GeoSpecRunnerOptions['nativeAssertions']>(),
  });
  const events: unknown[] = [];
  runner.on('test-start', (event) => events.push(event));
  runner.on('test-complete', (event) => events.push(event));
  await runner.run({ files: ['main.geospec.ts'] });
  await runner.close();
  expect(events).toStrictEqual([
    { type: 'test-start', file: 'main.geospec.ts', test: { suite: ['shade'], name: 'is one piece', ordinal: 0 } },
    { type: 'test-complete', file: 'main.geospec.ts', test },
  ]);
});

it('replaces the host work-unit budget for one run only when the run names one', async () => {
  const passing = (): GeoSpecRunResult => ({
    success: true,
    passed: true,
    bundle: mock<Extract<GeoSpecRunResult, { success: true }>['bundle']>(),
    tests: [],
  });
  vi.mocked(runGeoSpecModule).mockClear().mockResolvedValueOnce(passing()).mockResolvedValueOnce(passing());
  const engine = mock<GeoSpecRunnerOptions['nativeAssertions']['engine']>();
  const runner = createSerialGeoSpecRunner({
    filesystem: mock<GeoSpecRunnerOptions['filesystem']>(),
    nativeAssertions: { engine, workUnitLimit: 16_000_000 },
  });
  await runner.run({ files: ['main.geospec.ts'], workUnitLimit: 64_000_000 });
  await runner.run({ files: ['main.geospec.ts'] });
  await runner.close();
  const budgets = vi.mocked(runGeoSpecModule).mock.calls.map(([options]) => options.nativeAssertions);
  expect(budgets[0]).toMatchObject({ workUnitLimit: 64_000_000 });
  expect(budgets[0]?.engine).toBe(engine);
  expect(budgets[1]).toMatchObject({ workUnitLimit: 16_000_000 });
});
