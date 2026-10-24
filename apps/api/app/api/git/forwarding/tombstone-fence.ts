import type { TombstoneFence } from '#api/projects/project-deletion.js';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';
import { defaultRoute } from '#api/git/routing/route.js';

/**
 * The project-deletion fence tau-api uses (DC1): tau-storage commits the tombstone
 * manifest under a grant for the requester, so the API image reaches no
 * repository write. tau-storage stamps the tombstone with its own clock.
 *
 * @param executor - The API's git executor.
 * @returns The fence.
 */
export const executorTombstoneFence =
  (executor: GitExecutor): TombstoneFence =>
  async ({ locator, committedBy }, signal) =>
    executor.tombstone(
      {
        owner: locator.ownerId,
        project: locator.projectId,
        ...(locator.accountId === undefined ? {} : { account: locator.accountId }),
        callerId: committedBy,
        committedBy,
        remainingBytes: 0,
        storageLimitBytes: 0,
        recordedGeneration: 0,
        route: { store: defaultRoute.store, authoritative: true },
      },
      { abort: signal },
    );
