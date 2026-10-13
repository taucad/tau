import { expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { runGeoSpecModule } from '#runner/run-geospec-module.js';
import { createSerialGeoSpecRunner } from '#runner/worker/serial-runner.js';
import type { GeoSpecRunnerOptions } from '#runner/worker/index.js';
import type { GeoSpecRunResult } from '#runner/types.js';

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
