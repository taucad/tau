import { describe, expect, it, vi } from 'vitest';
import { createGeoSpecNodePoolRunner } from 'geospec/runner/node';
import { createGeoSpecNativeNodePoolRunner } from '#runner/node/native-pool-runner.js';
import { defaultExporterModule } from '#model/default-exporter.js';

vi.mock('geospec/runner/node', () => ({
  createGeoSpecNodePoolRunner: vi.fn(() => ({ run: vi.fn(), close: vi.fn() })),
  createNodeWorkerHandle: vi.fn(),
}));

describe('createGeoSpecNativeNodePoolRunner', () => {
  it("runs the geospec pool with Tau's default exporter in every worker", () => {
    createGeoSpecNativeNodePoolRunner({ projectPath: '/project', workers: 2, shardTimeout: 1000 });

    expect(createGeoSpecNodePoolRunner).toHaveBeenCalledWith({
      projectPath: '/project',
      workers: 2,
      shardTimeout: 1000,
      exporterModules: [defaultExporterModule],
    });
  });
});
