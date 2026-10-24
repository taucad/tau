import { ServiceUnavailableException } from '@nestjs/common';
import type { MetricsService } from '#telemetry/metrics.js';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';

/**
 * The executor of a `GitRepositoryService` built with none bound (outside
 * `GitModule`, which always binds the boot-time choice of `git-execution.ts`):
 * every git RPC answers `503 GIT_SERVICE_RESTARTING`.
 *
 * @param metrics - Where `tau.git.forward.errors{reason="unconfigured"}` is counted.
 * @returns The executor.
 */
export const unconfiguredExecutor = (metrics?: MetricsService): GitExecutor => {
  const refuse = async (): Promise<never> => {
    metrics?.gitForwardErrors.add(1, { reason: 'unconfigured' });
    throw new ServiceUnavailableException({
      code: 'GIT_SERVICE_RESTARTING',
      message: 'The repository service is not available; retry shortly.',
    });
  };
  return {
    uploadPack: refuse,
    receivePack: refuse,
    removeRef: refuse,
    derive: refuse,
    gitRead: refuse,
    endRead: refuse,
    tombstone: refuse,
    dialect: refuse,
    putPreview: refuse,
  };
};
