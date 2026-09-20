/**
 * The durable record of what this device owes the remote.
 *
 * Moved out of `createRevisionActors` unchanged (W10.4): the queue needs only
 * the records filesystem and the single-writer chain it owns itself.
 */
import type { SyncQueueEntry, SyncQueueRecord } from '#sync.machine.js';
import type { RevisionFileSystem } from '#revision-effects.js';

/**
 * Build the pending-sync queue reader and writer over one project's records.
 *
 * @param dependencies - How to open the project's records filesystem.
 * @returns `readPendingQueue` and `writePendingQueue`, sharing one write chain.
 */
export const createSyncQueue = (
  dependencies: Readonly<{ recordsFileSystem: () => Promise<RevisionFileSystem> }>,
): Readonly<{
  readPendingQueue: () => Promise<SyncQueueRecord>;
  writePendingQueue: (record: SyncQueueRecord) => Promise<void>;
}> => {
  const { recordsFileSystem } = dependencies;

  /**
   * Where this device records what the remote has not acknowledged.
   *
   * A control-plane path (`classify` → unversioned, agent-hidden, unwatched),
   * so the queue is never a file a person sees, an agent reads, or a revision
   * records — and never a machine snapshot (D29).
   */
  const syncQueuePath = '.git/sync-pending';

  const isQueueEntry = (value: unknown): value is SyncQueueEntry =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { ref?: unknown }).ref === 'string' &&
    typeof (value as { reason?: unknown }).reason === 'string' &&
    ((value as { operation?: unknown }).operation === undefined ||
      (value as { operation?: unknown }).operation === 'push' ||
      (value as { operation?: unknown }).operation === 'projection');

  /*
   * Read leniently: a half-written or foreign record holds nothing, and an
   * unreadable queue must never be able to stop the scheduler that reads it.
   */
  const readPendingQueue = async (): Promise<SyncQueueRecord> => {
    const records = await recordsFileSystem();
    try {
      const stored: unknown = JSON.parse(await records.readFile(syncQueuePath, 'utf8'));
      const entries: unknown = (stored as { entries?: unknown }).entries;
      return { version: 1, entries: Array.isArray(entries) ? entries.filter((entry) => isQueueEntry(entry)) : [] };
    } catch {
      return { version: 1, entries: [] };
    }
  };

  /*
   * One writer, in order (review 2 R5).
   *
   * A keepalive answer arriving while a push settles targets `recording` twice,
   * and stopping an XState promise actor does not cancel the write inside it —
   * so two `writeFile` calls could overlap, and the reader is deliberately
   * lenient: a torn record holds *nothing*, which is the one outcome that loses
   * what is owed. A chain makes the last caller the last writer.
   */
  let queueWrite: Promise<void> = Promise.resolve();

  const writePendingQueue = async (record: SyncQueueRecord): Promise<void> => {
    const previous = queueWrite;
    const write = (async (): Promise<void> => {
      try {
        await previous;
      } catch {
        /* One write's failure belongs to the caller that made it; the next
         * settle still has to record what is owed. */
      }
      const records = await recordsFileSystem();
      const body = `${JSON.stringify(record, undefined, 2)}\n`;
      try {
        /* Atomic where the filesystem has a rename: a reader never sees half a
         * record, even if the host dies mid-write. */
        await records.writeFile(`${syncQueuePath}.writing`, body);
        await records.rename(`${syncQueuePath}.writing`, syncQueuePath);
      } catch {
        /* A backend without an atomic rename still has to record what is owed;
         * the lenient reader is what covers the torn read that is then possible. */
        await records.writeFile(syncQueuePath, body);
      }
    })();
    queueWrite = write;
    await write;
  };

  return { readPendingQueue, writePendingQueue };
};
