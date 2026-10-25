import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Database } from '#database/owner-lock.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { completeProjectDeletion } from '#api/projects/project-deletion.js';
import { projectRecoveryBudget, recoverProjectDeletions, runMaintenanceWorker } from '#api/git/maintenance/worker.js';

vi.mock('#api/projects/project-deletion.js', () => ({ completeProjectDeletion: vi.fn() }));

/** A query fixture keeps real scheduling and cancellation behavior visible without a network clock. */
const queryDatabase = (rows: Array<{ projectId: string }>): Database => {
  /* oxlint-disable typescript/promise-function-async -- Drizzle builders are both chainable and awaitable. */
  const database = {
    select: () => ({
      from: () => ({
        where: () =>
          Object.assign(Promise.resolve([{ oldest: new Date(0), count: rows.length }]), {
            orderBy: () => ({ limit: async () => rows }),
          }),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  /* oxlint-enable typescript/promise-function-async -- end query builder fixture. */
  return database as unknown as Database;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('bounded maintenance recovery', () => {
  it('should stop a tick at its budget and report actual attempts rather than selected rows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(100_000));
    const rows = Array.from({ length: 100 }, (_, index) => ({ projectId: `project-${String(index)}` }));
    vi.mocked(completeProjectDeletion).mockImplementation(async ({ projectId }) => {
      vi.setSystemTime(Date.now() + 5000);
      return { projectId, state: 'deleting' };
    });
    const result = await recoverProjectDeletions({ database: queryDatabase(rows), store: mock<RepositoryStore>() });
    expect(result.attempted).toBe(projectRecoveryBudget / 5000);
    expect(result.completed).toBe(0);
    expect(result.pending).toBe(100);
    expect(completeProjectDeletion).toHaveBeenCalledTimes(10);
  });

  it('should propagate shutdown to the in-flight store request and await its abort', async () => {
    const stop = new AbortController();
    const arrived = Promise.withResolvers<void>();
    let aborted = false;
    const store = mock<RepositoryStore>({
      readManifest: async (_locator, signal) => {
        arrived.resolve();
        await sleep(60_000, undefined, { signal });
        return undefined;
      },
    });
    vi.mocked(completeProjectDeletion).mockImplementation(async ({ fence, projectId }) => {
      try {
        await fence(
          { locator: { ownerId: 'owner', projectId }, committedBy: 'owner', at: new Date() },
          AbortSignal.timeout(5000),
        );
      } catch (error) {
        expect(error).toMatchObject({ name: 'AbortError' });
        aborted = true;
      }
      return { projectId, state: 'deleting' };
    });
    const read = vi.spyOn(store, 'readManifest');
    const work = recoverProjectDeletions({
      database: queryDatabase([{ projectId: 'first' }, { projectId: 'second' }]),
      store,
      signal: stop.signal,
    });
    await arrived.promise;
    stop.abort();
    expect(await work).toMatchObject({ attempted: 1, completed: 0 });
    expect(aborted).toBe(true);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it('should let recovery continue during a held heavy pass and schedule from start times', async () => {
    const stop = new AbortController();
    const heavy = Promise.withResolvers<void>();
    const enough = Promise.withResolvers<void>();
    const starts: number[] = [];
    let heavyStarts = 0;
    const work = runMaintenanceWorker({
      signal: stop.signal,
      recoveryInterval: 100,
      heavyInterval: 1000,
      reportFailure: () => undefined,
      recover: async () => {
        starts.push(Date.now());
        await sleep(80);
        if (starts.length === 3) {
          enough.resolve();
        }
      },
      heavy: async () => {
        heavyStarts += 1;
        await heavy.promise;
      },
    });
    await enough.promise;
    stop.abort();
    heavy.resolve();
    await work;
    expect(heavyStarts).toBe(1);
    expect(starts).toHaveLength(3);
    expect(starts[2]! - starts[0]!).toBeLessThan(310);
  });
});
