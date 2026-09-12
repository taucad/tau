/**
 * Account-scoped offline usage snapshots and the local billing profile
 * (blueprint B4 R4/R5).
 *
 * A separate small IndexedDB database beside the app store: this data has its
 * own lifetime (it is purged on logout, owner change and account closure) and
 * its own schema version, so it must not ride the app database's upgrade
 * ladder. Everything here is data the account already downloaded on this
 * device — no bearer token, cookie or provider key is ever written, and the
 * selected profile is permission to redisplay that download, never an
 * authorization to reach the API.
 *
 * Storage-policy Rule 0 parity exemption: this is per-browser-profile billing
 * data the account already downloaded, with no agent, CLI, collaborator or
 * on-disk consumer — an agent reading a project never needs it, and it must
 * never reach `tau.json`. It cannot live in `IndexedDbStorageProvider`'s
 * database because its lifetime is the authenticated session: logout, account
 * switch and closure delete it outright, and that erasure must not be able to
 * touch project or chat rows. Hence the separate database and the file-scoped
 * `no-direct-indexeddb` exemption above.
 *
 * ponytail: one record per canonical query holds the whole snapshot — summary,
 * charts and the downloaded page together — so a single `put` is the
 * generation-atomic replacement B4 R4 requires and a failed refresh cannot
 * erase the last complete result. Multi-page cursors would need a real
 * generation table; the upgrade path is a `generation` field on the record key.
 */

/* oxlint-disable tau-lint/no-direct-indexeddb -- Dedicated billing-snapshot database; see the store-selection note above. */
import { useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party billing persistence owns the direct wire contract
import { wireUsageSnapshotSchema } from '@taucad/billing';
import type { WireUsageSnapshot } from '@taucad/billing';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import type { UsageSnapshotQuery, UsageSnapshotResult } from '@taucad/billing/hooks/use-usage-snapshot';
import { metaConfig } from '#constants/meta.constants.js';
import { KeyedMutex } from '#db/keyed-mutex.js';

/** Bumped only when a stored shape changes; older records are then unreadable and dropped. */
const schemaVersion = 1;
const databaseName = `${metaConfig.databasePrefix}billing`;
const snapshotStoreName = 'usageSnapshots';
const profileStoreName = 'selectedProfile';
const profileId = 'selected';

/** Local cache ceiling from B4 R4, not an API history limit. */
const maxSavedRows = 1000;

/**
 * Every store operation runs under one key so a purge can never interleave
 * with a save. Reuses the app storage provider's serialiser rather than a
 * second mechanism.
 */
const mutex = new KeyedMutex<string>();
const storeLock = 'billing-snapshot-store';

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

const outsideAllowedScope = (snapshot: WireUsageSnapshot): boolean =>
  allowedScope !== undefined &&
  (allowedScope.environment !== snapshot.environment || allowedScope.ownerId !== snapshot.ownerId);

/** The device's selected local billing profile (B4 R5). Never a credential. */
export type BillingProfile = {
  readonly schemaVersion: typeof schemaVersion;
  readonly environment: string;
  readonly subjectId: string;
  readonly displayLabel?: string;
  readonly selectedAt: string;
};

/** A validated saved snapshot with the account label to show beside it. */
export type SavedUsage = {
  readonly snapshot: WireUsageSnapshot;
  readonly label: string;
};

/** Why offline saving did or did not happen; never silently dropped (B4 R4). */
export type SavedUsageOutcome = 'saved' | 'stale' | 'quota-exceeded' | 'unavailable';

type SnapshotRecord = {
  readonly key: string;
  readonly environment: string;
  readonly ownerId: string;
  readonly subjectId: string;
  readonly queryKey: string;
  readonly savedAt: number;
  readonly rowCount: number;
  readonly snapshot: unknown;
};

type ProfileRecord = BillingProfile & { readonly id: typeof profileId };

/** The account namespace a purge keeps; everything else is removed. */
export type SavedUsageScope = {
  readonly environment: string;
  readonly ownerId: string;
};

/**
 * Stable key for one canonical usage request. Values are sent in order, so
 * arrays keep theirs; only the property order is normalized.
 *
 * @param query - The canonical query `GET /v1/billing/usage` echoes back.
 * @returns A stable string identifying the request.
 */
export const canonicalUsageQueryKey = (query: UsageSnapshotQuery): string =>
  // The replacer array both orders the keys and drops absent ones, so an
  // explicit `undefined` and an omitted property produce the same key.
  JSON.stringify(
    query,
    Object.keys(query).sort((left, right) => left.localeCompare(right)),
  );

/** The full envelope tuple plus the request. `|` cannot occur in a financial identity. */
const recordKey = (snapshot: WireUsageSnapshot, queryKey: string): string =>
  [schemaVersion, snapshot.environment, snapshot.ownerId, snapshot.subjectId, queryKey].join('|');

const awaitRequest = async <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    request.addEventListener('success', () => {
      resolve(request.result);
    });
    request.addEventListener('error', () => {
      reject(request.error ?? new Error('Billing snapshot request failed'));
    });
  });

const awaitTransaction = async (transaction: IDBTransaction): Promise<void> =>
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
const openDatabase = async (): Promise<IDBDatabase | undefined> => {
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

const readAll = async (db: IDBDatabase): Promise<{ records: SnapshotRecord[]; profile: ProfileRecord | undefined }> => {
  const transaction = db.transaction([snapshotStoreName, profileStoreName], 'readonly');
  const records = awaitRequest(transaction.objectStore(snapshotStoreName).getAll() as IDBRequest<SnapshotRecord[]>);
  const profile = awaitRequest(
    transaction.objectStore(profileStoreName).get(profileId) as IDBRequest<ProfileRecord | undefined>,
  );
  return { records: await records, profile: await profile };
};

/**
 * Reads the saved snapshot for one canonical query.
 *
 * The profile names the account namespace, which is the only thing knowable on
 * a cold offline start. When a live session exists its owner must also match,
 * so a record left by another account is never rendered. Records that no longer
 * validate against the wire schema are removed rather than shown.
 *
 * @param queryKey - Key from {@link canonicalUsageQueryKey}.
 * @param session - The currently resolved billing session, if any.
 * @param minRevision - Latest account revision known from a receipt or purchase.
 * @returns The validated snapshot and its account label, or `undefined`.
 */
export const readSavedUsage = async (
  queryKey: string,
  session: { readonly environment?: string; readonly ownerId?: string } = {},
  minRevision?: string,
): Promise<SavedUsage | undefined> =>
  mutex.run(storeLock, async () => {
    const db = await openDatabase();
    if (db === undefined) {
      return undefined;
    }
    try {
      const { records, profile } = await readAll(db);
      if (profile === undefined) {
        return undefined;
      }
      if (session.environment !== undefined && session.environment !== profile.environment) {
        return undefined;
      }
      const candidate = records.find(
        (record) =>
          record.queryKey === queryKey &&
          record.environment === profile.environment &&
          record.subjectId === profile.subjectId &&
          (session.ownerId === undefined || record.ownerId === session.ownerId),
      );
      if (candidate === undefined) {
        return undefined;
      }
      const parsed = wireUsageSnapshotSchema.safeParse(candidate.snapshot);
      if (!parsed.success) {
        const transaction = db.transaction(snapshotStoreName, 'readwrite');
        transaction.objectStore(snapshotStoreName).delete(candidate.key);
        await awaitTransaction(transaction);
        return undefined;
      }
      const snapshot = parsed.data;
      if (
        snapshot.environment !== profile.environment ||
        snapshot.subjectId !== profile.subjectId ||
        (session.ownerId !== undefined && snapshot.ownerId !== session.ownerId)
      ) {
        return undefined;
      }
      if (minRevision !== undefined && BigInt(snapshot.snapshotRevision) < BigInt(minRevision)) {
        return undefined;
      }
      return { snapshot, label: profile.displayLabel ?? profile.subjectId };
    } finally {
      db.close();
    }
  });

/**
 * Replaces the saved snapshot for one canonical query and selects its profile.
 *
 * @param snapshot - A snapshot already validated against the live session.
 * @param queryKey - Key from {@link canonicalUsageQueryKey}.
 * @param displayLabel - Optional human label for the account.
 * @returns What happened, so the page can report an unavailable offline save.
 */
export const writeSavedUsage = async (
  snapshot: WireUsageSnapshot,
  queryKey: string,
  displayLabel?: string,
): Promise<SavedUsageOutcome> => {
  const generation = purgeGeneration;
  return mutex.run(storeLock, async () => {
    if (generation !== purgeGeneration || outsideAllowedScope(snapshot)) {
      return 'stale';
    }
    const db = await openDatabase();
    if (db === undefined) {
      return 'unavailable';
    }
    try {
      const record: SnapshotRecord = {
        key: recordKey(snapshot, queryKey),
        environment: snapshot.environment,
        ownerId: snapshot.ownerId,
        subjectId: snapshot.subjectId,
        queryKey,
        savedAt: Date.now(),
        rowCount: snapshot.rows?.items.length ?? 0,
        snapshot,
      };
      const profile: ProfileRecord = {
        id: profileId,
        schemaVersion,
        environment: snapshot.environment,
        subjectId: snapshot.subjectId,
        ...(displayLabel === undefined ? {} : { displayLabel }),
        selectedAt: new Date().toISOString(),
      };
      const write = db.transaction([snapshotStoreName, profileStoreName], 'readwrite');
      write.objectStore(snapshotStoreName).put(record);
      write.objectStore(profileStoreName).put(profile);
      await awaitTransaction(write);
      await evict(db, record.key);
      return 'saved';
    } catch (error) {
      return error instanceof DOMException && error.name === 'QuotaExceededError' ? 'quota-exceeded' : 'unavailable';
    } finally {
      db.close();
    }
  });
};

/** Keeps the newest records within the row ceiling, dropping older query pages first. */
const evict = async (db: IDBDatabase, keepKey: string): Promise<void> => {
  const { records } = await readAll(db);
  const ordered = [...records].sort((left, right) => right.savedAt - left.savedAt);
  let rows = 0;
  const doomed: string[] = [];
  for (const record of ordered) {
    rows += record.rowCount;
    if (rows > maxSavedRows && record.key !== keepKey) {
      doomed.push(record.key);
    }
  }
  if (doomed.length === 0) {
    return;
  }
  const transaction = db.transaction(snapshotStoreName, 'readwrite');
  for (const key of doomed) {
    transaction.objectStore(snapshotStoreName).delete(key);
  }
  await awaitTransaction(transaction);
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

/**
 * The saved usage this device can show for `query`, including on a cold
 * offline start where the session is still indeterminate.
 *
 * @param query - The canonical usage query the page is displaying.
 * @returns The saved snapshot and account label, or `undefined`.
 */
export function useSavedUsage(query: UsageSnapshotQuery): SavedUsage | undefined {
  const { environment, userId } = useBillingSession();
  const queryKey = useMemo(() => canonicalUsageQueryKey(query), [query]);
  const [saved, setSaved] = useState<SavedUsage | undefined>(undefined);

  useEffect(() => {
    const cancelled = new AbortController();
    // async-iife: bootstrap — the effect body cannot itself be async
    void (async () => {
      const next = await readSavedUsage(queryKey, { environment, ownerId: userId });
      if (!cancelled.signal.aborted) {
        setSaved(next);
      }
    })();
    return () => {
      cancelled.abort();
    };
  }, [environment, queryKey, userId]);

  return saved;
}

/**
 * Saves a fresh snapshot for offline use once it is confirmed to belong to the
 * live session. A snapshot whose owner or environment does not match the
 * currently resolved session is never persisted.
 *
 * @param query - The canonical usage query the page is displaying.
 * @param usage - The live page state from `useUsageSnapshot`.
 * @param displayLabel - Optional human label stored with the profile.
 * @returns The last save outcome, or `undefined` before the first attempt.
 */
export function usePersistSavedUsage(
  query: UsageSnapshotQuery,
  usage: UsageSnapshotResult,
  displayLabel?: string,
): SavedUsageOutcome | undefined {
  const { environment, userId } = useBillingSession();
  const queryKey = useMemo(() => canonicalUsageQueryKey(query), [query]);
  const fresh = usage.status === 'ready' ? usage.snapshot : undefined;
  const [outcome, setOutcome] = useState<SavedUsageOutcome | undefined>(undefined);

  useEffect(() => {
    if (fresh === undefined || fresh.ownerId !== userId || fresh.environment !== environment) {
      return;
    }
    const cancelled = new AbortController();
    // async-iife: bootstrap — the effect body cannot itself be async
    void (async () => {
      const result = await writeSavedUsage(fresh, queryKey, displayLabel);
      if (!cancelled.signal.aborted) {
        setOutcome(result);
      }
    })();
    return () => {
      cancelled.abort();
    };
  }, [displayLabel, environment, fresh, queryKey, userId]);

  return outcome;
}
