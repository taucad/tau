/**
 * The billing database and its purge (adaptive app deployment mode charter W2, I5): what the financial session
 * provider needs to forget an account, without the wire schema or the saved-usage readers. The snapshot store
 * (`billing-snapshot-store.ts`) builds on it, under the same lock and the same purge generation.
 */
import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';
import { KeyedMutex } from '@taucad/utils/keyed-mutex';

/** Bumped only when a stored shape changes; older records are then unreadable and dropped. */
export const schemaVersion = 1;
export const databaseName = `${appMetaConfig.databasePrefix}billing`;
export const snapshotStoreName = 'usageSnapshots';
export const profileStoreName = 'selectedProfile';
export const profileId = 'selected';

/**
 * Every store operation runs under one key so a purge can never interleave
 * with a save. Reuses the app storage provider's serialiser rather than a
 * second mechanism.
 */
export const mutex = new KeyedMutex<string>();
export const storeLock = 'billing-snapshot-store';

/**
 * Bumped synchronously by {@link purgeSavedUsage}. A save that started before
 * the purge refuses to write, so a delayed response for the previous owner
 * cannot reappear behind the new one.
 */
let purgeGeneration = 0;

/**
 * The account the last scoped purge kept. A save for any other account is
 * refused until a later purge names it: a tab still rendering the previous
 * owner refetches after the purge broadcast and must not write that owner
 * back behind the new one (B4 R5). An unscoped purge lifts the restriction;
 * the next bind names its owner before that owner's first save.
 */
let allowedScope: SavedUsageScope | undefined;

/** The device's selected local billing profile (B4 R5). Never a credential. */
export type BillingProfile = {
  readonly schemaVersion: typeof schemaVersion;
  readonly environment: string;
  readonly ownerId?: string;
  readonly subjectId: string;
  readonly minimumRevision?: string;
  readonly displayLabel?: string;
  readonly selectedAt: string;
};

/** Highest authoritative account revision this device has observed. */
export type BillingRevisionMinimum = {
  readonly environment: string;
  readonly ownerId: string;
  readonly subjectId: string;
  readonly revision: string;
};

export type SnapshotRecord = {
  readonly key: string;
  readonly environment: string;
  readonly ownerId: string;
  readonly subjectId: string;
  readonly queryKey: string;
  readonly savedAt: number;
  readonly rowCount: number;
  readonly snapshot: unknown;
};

export type ProfileRecord = BillingProfile & { readonly id: typeof profileId };

/** The account namespace a purge keeps; everything else is removed. */
export type SavedUsageScope = {
  readonly environment: string;
  readonly ownerId: string;
};

export const awaitRequest = async <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Billing snapshot request failed'));
    });
  });

export const awaitTransaction = async (transaction: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve();
    });
    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('Billing snapshot transaction failed'));
    });
    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new Error('Billing snapshot transaction was aborted'));
    });
  });

/**
 * Opens the billing database, or resolves `undefined` when storage is
 * unavailable (private mode, disabled storage, an older tab holding an
 * upgrade). Offline saving is then reported unavailable rather than throwing
 * into a page that still has working online data.
 */
export const openDatabase = async (): Promise<IDBDatabase | undefined> => {
  // Annotated read: a browser with storage disabled has no factory here, and
  // the DOM lib's non-optional type would otherwise make the check look dead.
  const factory = globalThis.indexedDB as IDBFactory | undefined;
  if (factory === undefined) {
    return undefined;
  }
  return new Promise<IDBDatabase | undefined>((resolve) => {
    const request = factory.open(databaseName, schemaVersion);
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- this is the preferred API for indexedDB
    request.onerror = () => {
      resolve(undefined);
    };
    request.onblocked = () => {
      resolve(undefined);
    };
    request.onsuccess = () => {
      const db = request.result;
      // Never be the tab that blocks another tab's upgrade.
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      // A schema bump discards the previous shape outright: saved usage is a
      // cache of the API, so re-downloading is always correct and migrating
      // financial records locally never is.
      for (const name of db.objectStoreNames) {
        db.deleteObjectStore(name);
      }
      db.createObjectStore(snapshotStoreName, { keyPath: 'key' });
      db.createObjectStore(profileStoreName, { keyPath: 'id' });
    };
  });
};

export const readAll = async (
  db: IDBDatabase,
): Promise<{ records: SnapshotRecord[]; profile: ProfileRecord | undefined }> => {
  const transaction = db.transaction([snapshotStoreName, profileStoreName], 'readonly');
  const records = awaitRequest(transaction.objectStore(snapshotStoreName).getAll() as IDBRequest<SnapshotRecord[]>);
  const profile = awaitRequest(
    transaction.objectStore(profileStoreName).get(profileId) as IDBRequest<ProfileRecord | undefined>,
  );
  return { records: await records, profile: await profile };
};

/**
 * Removes saved usage and the local selection.
 *
 * The generation is bumped synchronously so a save already in flight is
 * refused, which is what discards a delayed response for the previous owner.
 *
 * @param keep - The account namespace to retain; omit to clear everything.
 * @returns Resolves once the removal has committed.
 */
export const purgeSavedUsage = async (keep?: SavedUsageScope): Promise<void> => {
  // Synchronous: an async body still runs to its first `await`, so a save that
  // has already captured the old generation is refused.
  purgeGeneration += 1;
  allowedScope = keep;
  return mutex.run(storeLock, async () => {
    const db = await openDatabase();
    if (db === undefined) {
      return;
    }
    try {
      const { records, profile } = await readAll(db);
      const survivors = records.filter(
        (record) => record.environment === keep?.environment && record.ownerId === keep.ownerId,
      );
      const keepProfile =
        profile !== undefined &&
        profile.ownerId === keep?.ownerId &&
        survivors.some(
          (record) => record.environment === profile.environment && record.subjectId === profile.subjectId,
        );
      const transaction = db.transaction([snapshotStoreName, profileStoreName], 'readwrite');
      const snapshots = transaction.objectStore(snapshotStoreName);
      const survivorKeys = new Set(survivors.map((record) => record.key));
      for (const record of records) {
        if (!survivorKeys.has(record.key)) {
          snapshots.delete(record.key);
        }
      }
      if (!keepProfile) {
        transaction.objectStore(profileStoreName).delete(profileId);
      }
      await awaitTransaction(transaction);
    } finally {
      db.close();
    }
  });
};

/** The purge generation a save captures before it writes (a later purge refuses the write). */
export const currentPurgeGeneration = (): number => purgeGeneration;

/** The account the last scoped purge kept, if any. */
export const currentAllowedScope = (): SavedUsageScope | undefined => allowedScope;
