/**
 * The first cloud backup of a project created from Home waits for its first turn (WP-12 step 5, owner ruling O-8).
 *
 * A new project's backup by default registers the project on Tau Cloud, reads both git advertisements and pushes
 * the first revision: six serial round trips that ran beside the first turn and, on staging, ended just before its
 * model request left. The create holds the backup here; it is released when the project's first run streams anything
 * live (its model request has been answered) or {@link firstTurnBackupDeadline} after the hold, whichever is first.
 * Nothing in admission waits on the push: a new project's Tau Cloud intent is `default`, never `open`, so
 * `awaitCloudOpenWritten` returns at once. The files are durable on this device throughout.
 *
 * Page-local and in memory: a reload drops every hold, and the backup then runs as it always did.
 *
 * @module
 */

/** Milliseconds after the hold at which the backup starts even if the first turn never streamed. */
export const firstTurnBackupDeadline = 5000;

type Hold = { readonly released: Promise<void>; readonly release: () => void };

const holds = new Map<string, Hold>();

/**
 * Hold a new project's first cloud backup until its first turn streams, or the deadline.
 *
 * @param projectId - The project just created.
 * @param deadline - Milliseconds until the hold lets go on its own.
 */
export const holdFirstTurnBackup = (projectId: string, deadline = firstTurnBackupDeadline): void => {
  if (holds.has(projectId)) {
    return;
  }
  const { promise, resolve } = Promise.withResolvers<void>();
  const timer = setTimeout(() => {
    release();
  }, deadline);
  const release = (): void => {
    clearTimeout(timer);
    if (holds.get(projectId)?.released === promise) {
      holds.delete(projectId);
    }
    resolve();
  };
  holds.set(projectId, { released: promise, release });
};

/**
 * Let a project's held backup go now: its first turn streamed.
 *
 * @param projectId - The project.
 */
export const releaseFirstTurnBackup = (projectId: string): void => {
  holds.get(projectId)?.release();
};

/**
 * The wait a project's first backup still has, if any.
 *
 * @param projectId - The project.
 * @returns Settles when the backup may start; `undefined` when nothing holds it.
 */
export const firstTurnBackupHold = (projectId: string): Promise<void> | undefined => holds.get(projectId)?.released;
