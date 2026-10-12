import { availableParallelism } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
import { createNodeGeoSpecCliHost } from '#cli/node-host.js';
import { createGeoSpecNativeNodePoolRunner } from '#runner/node/native-pool-runner.js';

vi.mock('#runner/node/native-pool-runner.js', () => ({
  createGeoSpecNativeNodePoolRunner: vi.fn(() => ({ run: vi.fn(), close: vi.fn() })),
}));

describe('canonical CLI host selection', () => {
  it('should route default, explicit and automatic workers through the same compiled owner', () => {
    const host = createNodeGeoSpecCliHost();
    for (const workers of [undefined, 2, 0]) {
      host.createRunner({ projectPath: '/project', workers, shardTimeout: 123 });
      expect(createGeoSpecNativeNodePoolRunner).toHaveBeenLastCalledWith({
        projectPath: '/project',
        workers: workers === 0 ? availableParallelism() : (workers ?? 1),
        shardTimeout: 123,
      });
    }
  });
});
