/**
 * What this device still owes each project's Tau Cloud backup, and the cloud deletions it knows of (D19, D20), kept out
 * of the hook modules so the runtime can read and write them (A4b). `use-cloud-projects.ts` keeps the hooks over them.
 */
import { z } from 'zod';
import { Topic } from '@taucad/events';
import { getRevisionSessionUser } from '#lib/revision-actor.js';

export const deletionReceiptSchema = z.discriminatedUnion('state', [
  z.object({ id: z.string(), name: z.string(), state: z.enum(['checking', 'deleting']) }),
  z.object({ id: z.string(), state: z.literal('deleted') }),
]);
/** A cloud deletion this account started on this device. @public */
export type DeletionReceipt = z.infer<typeof deletionReceiptSchema>;
/** The storage key prefix of an account's deletion receipts. @public */
export const deletionStoragePrefix = 'tau:cloud-project-deletions:';
/**
 * The deletion receipts an account holds on this device.
 *
 * @public
 */
export const readDeletionReceipts = (account: string | undefined): DeletionReceipt[] => {
  if (account === undefined) {
    return [];
  }
  try {
    return deletionReceiptSchema
      .array()
      .parse(JSON.parse(localStorage.getItem(`${deletionStoragePrefix}${account}`) ?? '[]'));
  } catch {
    return [];
  }
};
/** Known intent fences stale cards and default/open connection gestures. @public */
export const getCloudDeletionState = (projectId: string): DeletionReceipt['state'] | undefined =>
  readDeletionReceipts(getRevisionSessionUser()?.id).find((entry) => entry.id === projectId)?.state;

/**
 * What this device still owes one project's Tau Cloud backup (D19, D20).
 *
 * - `default`: a project born with no remote, whose person has not yet been told
 *   it backs up (D19).
 * - `noticed`: told, with the opt-out beside it (DESIGN: opt-out before
 *   commitment); the only state a default connection is made from.
 * - `connected`: backed up by default; *Where you are* keeps its line and opt-out.
 * - `open`: brought to this device on sign-in (D20); its first open connects Tau
 *   Cloud and pulls, exactly what *Open* does for a cloud-only row. Kept until
 *   the authored checkout and project manifest are ready.
 *
 * Per device and per project, like `githubProjectBinding`: whether a project is
 * backed up is recorded in its own git config once it is, and this is only what
 * happens before then.
 *
 * @public
 */
export type TauCloudIntent = 'default' | 'noticed' | 'connected' | 'open';

const intentKeyPrefix = 'tau:tau-cloud-intent:';
const intentKey = (projectId: string): string => `${intentKeyPrefix}${projectId}`;
const transientIntents = new Map<string, { intent: TauCloudIntent | undefined; account: string | undefined }>();
const intentOwnerKey = (projectId: string): string => `${intentKey(projectId)}:account`;
const intentTopic = new Topic<void>({ name: 'tau-cloud-intent' });
const isIntent = (value: unknown): value is TauCloudIntent =>
  value === 'default' || value === 'noticed' || value === 'connected' || value === 'open';

/** The per-project intent store, with document-local fallback when storage writes fail. @public */
export const tauCloudIntent = Object.freeze({
  get(projectId: string): TauCloudIntent | undefined {
    const pending = transientIntents.get(projectId);
    if (pending !== undefined) {
      return pending.intent;
    }
    try {
      const value = globalThis.localStorage.getItem(intentKey(projectId));
      return isIntent(value) ? value : undefined;
    } catch {
      return transientIntents.get(projectId)?.intent;
    }
  },
  set(projectId: string, intent: TauCloudIntent | undefined): void {
    if (intent !== undefined && getCloudDeletionState(projectId) !== undefined) {
      return;
    }
    try {
      if (intent === undefined) {
        globalThis.localStorage.removeItem(intentOwnerKey(projectId));
        globalThis.localStorage.removeItem(intentKey(projectId));
      } else {
        globalThis.localStorage.setItem(intentKey(projectId), intent);
        const account = getRevisionSessionUser()?.id;
        if (intent === 'open' && account !== undefined) {
          globalThis.localStorage.setItem(intentOwnerKey(projectId), account);
        }
      }
      transientIntents.delete(projectId);
    } catch {
      transientIntents.set(projectId, { intent, account: getRevisionSessionUser()?.id });
      // Keep an undefined tombstone too: a failed remove must not revive a stale open.
      // Preserve the gesture for this document when persistent storage is unavailable.
    }
    intentTopic.emit();
  },
  subscribe: (listener: () => void): (() => void) => intentTopic.subscribe(listener),
});

/** Whether a cloud project still awaits its first authored download. */
export const isCloudProjectPending = (projectId: string): boolean => tauCloudIntent.get(projectId) === 'open';

/** Prevent a pending gesture from connecting under a different signed-in account. */
export const canOpenCloudProject = (projectId: string): boolean => {
  if (getCloudDeletionState(projectId) !== undefined) {
    return false;
  }
  const pending = transientIntents.get(projectId);
  if (pending !== undefined) {
    return pending.account === getRevisionSessionUser()?.id;
  }
  try {
    const owner = globalThis.localStorage.getItem(intentOwnerKey(projectId));
    return owner === null || owner === getRevisionSessionUser()?.id;
  } catch {
    const pending = transientIntents.get(projectId);
    return pending === undefined || pending.account === getRevisionSessionUser()?.id;
  }
};

/* Another tab's writes (RV-W11 7): its intent change reaches this one. */
if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('storage', (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(intentKeyPrefix)) {
      intentTopic.emit();
    }
  });
}
