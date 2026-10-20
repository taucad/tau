import { availableParallelism } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { createNodeGeoSpecCliHost } from '#cli/node-host.js';
import { createGeoSpecNodePoolRunner } from '#runner/node/pool-runner.js';

vi.mock('#runner/node/pool-runner.js', () => ({
  createGeoSpecNodePoolRunner: vi.fn(() => ({ run: vi.fn(), close: vi.fn() })),
}));

describe('canonical CLI host selection', () => {
  it('should route default, explicit and automatic workers through the same pool owner', () => {
    const host = createNodeGeoSpecCliHost();
    for (const workers of [undefined, 2, 0]) {
      host.createRunner({ projectPath: '/project', configPath: undefined, workers, shardTimeout: 123 });
      expect(createGeoSpecNodePoolRunner).toHaveBeenLastCalledWith({
        projectPath: '/project',
        workers: workers === 0 ? availableParallelism() : (workers ?? 1),
        shardTimeout: 123,
      });
    }
  });

  it("should hand the pool the run's config and the host's exporter modules", () => {
    createNodeGeoSpecCliHost({ exporterModules: ['file:///preset.mjs'] }).createRunner({
      projectPath: '/project',
      configPath: '/project/geospec.config.ts',
      workers: undefined,
      shardTimeout: undefined,
    });

    expect(createGeoSpecNodePoolRunner).toHaveBeenLastCalledWith({
      projectPath: '/project',
      configPath: '/project/geospec.config.ts',
      exporterModules: ['file:///preset.mjs'],
      workers: 1,
    });
  });
});
