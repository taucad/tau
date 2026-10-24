import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '#database/database.service.js';
import {
  DeriveScheduler,
  RepairBackoff,
  repairBackoffBaseMilliseconds,
  repairBackoffMaximumMilliseconds,
  repairsPerScan,
} from '#api/git/forwarding/derive-scheduler.js';
import type { GitRepositoryService } from '#api/git/git.service.js';

/**
 * The derived-state scan's backoff (DC1 review S5): rows whose repair keeps
 * failing must not fill every scan and starve the rows behind them.
 */

type Target = { readonly projectId: string; readonly ownerId: string };

/** A database whose lagging-row query answers `rows` oldest first, cut at the query's own limit. */
const laggingRows = (rows: readonly Target[]): DatabaseService => {
  const chain = {
    select: () => chain,
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: async (count: number) => rows.slice(0, count),
  };
  return { database: chain } as unknown as DatabaseService;
};

describe('derived-state repair backoff (DC1 review S5)', () => {
  it('should reach a healthy row behind a full scan of rows that never repair', async () => {
    const stuck = Array.from({ length: repairsPerScan }, (_, index) => ({
      projectId: `stuck-${String(index)}`,
      ownerId: 'owner',
    }));
    const healthy = { projectId: 'healthy', ownerId: 'owner' };
    const repaired: string[] = [];
    const repositories = {
      repairDerivedState: vi.fn(async (target: Target) => {
        if (target.projectId.startsWith('stuck-')) {
          throw new Error('tau-storage refused');
        }
        repaired.push(target.projectId);
        return 'applied';
      }),
    } as unknown as GitRepositoryService;
    const scheduler = new DeriveScheduler(laggingRows([...stuck, healthy]), repositories);

    expect(await scheduler.scan({ graceSeconds: 0 })).toBe(0);
    expect(await scheduler.scan({ graceSeconds: 0 })).toBe(1);

    expect(repaired).toEqual(['healthy']);
    /* The stuck rows were tried once each, then waited. */
    expect(repositories.repairDerivedState).toHaveBeenCalledTimes(repairsPerScan + 1);
  });

  it('should double a failing row’s wait up to an hour and forget it once it repairs', () => {
    const backoff = new RepairBackoff();
    const start = 1_000_000;
    backoff.failed('p', start);
    expect(backoff.waiting('p', start + repairBackoffBaseMilliseconds - 1)).toBe(true);
    expect(backoff.waiting('p', start + repairBackoffBaseMilliseconds)).toBe(false);
    backoff.failed('p', start);
    expect(backoff.waiting('p', start + 2 * repairBackoffBaseMilliseconds - 1)).toBe(true);
    for (let failure = 0; failure < 20; failure += 1) {
      backoff.failed('p', start);
    }
    expect(backoff.waiting('p', start + repairBackoffMaximumMilliseconds)).toBe(false);
    expect(backoff.waitingCount(start)).toBe(1);
    backoff.succeeded('p');
    expect(backoff.waiting('p', start)).toBe(false);
    expect(backoff.waitingCount(start)).toBe(0);
  });
});
