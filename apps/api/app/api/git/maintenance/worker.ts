import { setTimeout as sleep } from 'node:timers/promises';
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { projectDeletion } from '#database/schema.js';
import { completeProjectDeletion } from '#api/projects/project-deletion.js';
import { storeTombstoneFence } from '#api/git/store/tombstone-fence.js';
import type { RepositoryStore } from '#api/git/store/port.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';

/** Milliseconds between light recovery ticks. */
export const projectRecoveryInterval = 60_000;
/** Storage cancellation bounds a tick, including a final in-flight fence. */
export const projectRecoveryBudget = 50_000;
/** Milliseconds between heavy maintenance passes. */
export const heavyMaintenanceInterval = 24 * 60 * 60 * 1000;

/** Oldest-first bounded recovery; failed records acquire backoff in the shared completion core. */
export const recoverProjectDeletions = async (args: {
  database: Database;
  store: RepositoryStore;
  at?: Date;
  signal?: AbortSignal;
}): Promise<{ attempted: number; completed: number; pending: number; oldestPendingAge: number }> => {
  assertSingletonProcessGroup();
  const at = args.at ?? new Date();
  const startedAt = Date.now();
  const deadline = AbortSignal.timeout(projectRecoveryBudget);
  const signal = args.signal === undefined ? deadline : AbortSignal.any([deadline, args.signal]);
  signal.throwIfAborted();
  const combined = (requested?: AbortSignal): AbortSignal =>
    requested === undefined ? signal : AbortSignal.any([signal, requested]);
  // The core retains its five-second attempt budget; this scope also cancels on shutdown or tick expiry.
  const store: RepositoryStore = {
    capabilities: args.store.capabilities,
    readManifest: async (locator, requested) => args.store.readManifest(locator, combined(requested)),
    // oxlint-disable-next-line max-params -- forwarding the frozen repository port.
    commitManifest: async (locator, next, expected, requested) =>
      args.store.commitManifest(locator, next, expected, combined(requested)),
    // oxlint-disable-next-line max-params -- forwarding the frozen repository port.
    putObject: async (locator, key, body, options, requested) =>
      args.store.putObject(locator, key, body, options, combined(requested)),
    getObject: async (...parameters) => args.store.getObject(...parameters),
    listObjects: (...parameters) => args.store.listObjects(...parameters),
    deleteObjects: async (...parameters) => args.store.deleteObjects(...parameters),
  };
  const rows = await args.database
    .select({ projectId: projectDeletion.projectId })
    .from(projectDeletion)
    .where(and(isNull(projectDeletion.deletedAt), lte(projectDeletion.nextAttemptAt, at)))
    .orderBy(asc(projectDeletion.nextAttemptAt), asc(projectDeletion.projectId))
    .limit(100);
  let completed = 0;
  let attempted = 0;
  for (const row of rows) {
    if (signal.aborted || Date.now() - startedAt >= projectRecoveryBudget) {
      break;
    }
    attempted += 1;
    try {
      // oxlint-disable-next-line no-await-in-loop -- one five-second fencing attempt at a time; the core persists retry backoff.
      const result = await completeProjectDeletion({
        database: args.database,
        fence: storeTombstoneFence(store),
        projectId: row.projectId,
        at: args.at ?? new Date(),
      });
      if (result.state === 'deleted') {
        completed += 1;
      }
    } catch {
      // A missing receipt or failed accounting write must not starve later identities.
      // oxlint-disable-next-line no-await-in-loop -- persist a bounded retry even when failure preceded the core's store attempt.
      await args.database
        .update(projectDeletion)
        .set({ nextAttemptAt: new Date(at.getTime() + projectRecoveryInterval), lastError: 'ProjectRecoveryError' })
        .where(and(eq(projectDeletion.projectId, row.projectId), isNull(projectDeletion.deletedAt)));
    }
  }
  const [pending] = await args.database
    .select({
      oldest: sql<Date | string>`coalesce(min(${projectDeletion.requestedAt}), now())`,
      count: sql<number>`count(*)`,
    })
    .from(projectDeletion)
    .where(isNull(projectDeletion.deletedAt));
  return {
    attempted,
    completed,
    pending: Number(pending?.count ?? 0),
    oldestPendingAge: pending === undefined ? 0 : Math.max(0, at.getTime() - new Date(pending.oldest).getTime()),
  };
};

/** Two awaited loops: a heavy pass cannot occupy the light tick, and neither overlaps itself. */
export const runMaintenanceWorker = async (args: {
  recover: () => Promise<void>;
  heavy: () => Promise<void>;
  signal: AbortSignal;
  reportFailure: (lane: 'recovery' | 'heavy', error: unknown) => void;
  recoveryInterval?: number;
  heavyInterval?: number;
}): Promise<void> => {
  assertSingletonProcessGroup();
  const loop = async (lane: 'recovery' | 'heavy', run: () => Promise<void>, cadence: number): Promise<void> => {
    while (!args.signal.aborted) {
      const startedAt = Date.now();
      try {
        // oxlint-disable-next-line no-await-in-loop -- each lane must await its current pass before admitting another.
        await run();
      } catch (error) {
        args.reportFailure(lane, error);
      }
      try {
        // oxlint-disable-next-line no-await-in-loop -- schedule from the previous start and abort the wait on shutdown.
        await sleep(Math.max(0, cadence - (Date.now() - startedAt)), undefined, { signal: args.signal });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        throw error;
      }
    }
  };
  await Promise.all([
    loop('recovery', args.recover, args.recoveryInterval ?? projectRecoveryInterval),
    loop('heavy', args.heavy, args.heavyInterval ?? heavyMaintenanceInterval),
  ]);
};
