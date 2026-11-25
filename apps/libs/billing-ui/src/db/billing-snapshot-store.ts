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
import { wireUsageSnapshotSchema } from '@taucad/billing';
import type { WireUsageSnapshot } from '@taucad/billing';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import type { UsageSnapshotQuery, UsageSnapshotResult } from '@taucad/billing/hooks/use-usage-snapshot';
import { appMetaConfig } from '@taucad/ui-core/constants/meta.constants';
import {
  awaitTransaction,
  currentAllowedScope,
  currentPurgeGeneration,
  mutex,
  openDatabase,
  profileId,
  profileStoreName,
  readAll,
  schemaVersion,
  snapshotStoreName,
  storeLock,
} from '#db/billing-snapshot-database.js';
import type { BillingRevisionMinimum, ProfileRecord, SnapshotRecord } from '#db/billing-snapshot-database.js';

/** Local cache ceiling from B4 R4, not an API history limit. */
const maxSavedRows = 1000;

const outsideAllowedScope = (snapshot: WireUsageSnapshot): boolean =>
  currentAllowedScope() !== undefined &&
  (currentAllowedScope()?.environment !== snapshot.environment || currentAllowedScope()?.ownerId !== snapshot.ownerId);

/** A validated saved snapshot with the account label to show beside it. */
export type SavedUsage = {
  readonly snapshot: WireUsageSnapshot;
  readonly label: string;
};

/** Why offline saving did or did not happen; never silently dropped (B4 R4). */
export type SavedUsageOutcome = 'saved' | 'stale' | 'quota-exceeded' | 'unavailable';

const revisionChangedEvent = `${appMetaConfig.databasePrefix}billing-revision-changed`;

const maximumRevision = (left: string | undefined, right: string): string =>
  left !== undefined && /^\d+$/u.test(left) && BigInt(left) > BigInt(right) ? left : right;

const announceRevisionChange = (): void => {
  globalThis.dispatchEvent(new Event(revisionChangedEvent));
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel(revisionChangedEvent);
    channel.postMessage(null);
    channel.close();
  }
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
      if (session.ownerId !== undefined && profile.ownerId !== undefined && session.ownerId !== profile.ownerId) {
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
      const requiredRevision =
        profile.ownerId === snapshot.ownerId && profile.minimumRevision !== undefined
          ? maximumRevision(minRevision, profile.minimumRevision)
          : minRevision;
      if (requiredRevision !== undefined && BigInt(snapshot.snapshotRevision) < BigInt(requiredRevision)) {
        return undefined;
      }
      return { snapshot, label: profile.displayLabel ?? profile.subjectId };
    } finally {
      db.close();
    }
  });

/** Reads the durable receipt/purchase freshness fence for the selected account. */
export const readBillingRevisionMinimum = async (
  session: { readonly environment?: string; readonly ownerId?: string } = {},
): Promise<BillingRevisionMinimum | undefined> =>
  mutex.run(storeLock, async () => {
    const db = await openDatabase();
    if (db === undefined) {
      return undefined;
    }
    try {
      const { profile } = await readAll(db);
      if (
        profile?.ownerId === undefined ||
        profile.minimumRevision === undefined ||
        !/^\d+$/u.test(profile.minimumRevision) ||
        (session.environment !== undefined && session.environment !== profile.environment) ||
        (session.ownerId !== undefined && session.ownerId !== profile.ownerId)
      ) {
        return undefined;
      }
      return {
        environment: profile.environment,
        ownerId: profile.ownerId,
        subjectId: profile.subjectId,
        revision: profile.minimumRevision,
      };
    } finally {
      db.close();
    }
  });

/** Persists an owned receipt or purchase revision before consumers accept older snapshots. */
export const recordBillingRevisionMinimum = async (minimum: BillingRevisionMinimum): Promise<void> => {
  const generation = currentPurgeGeneration();
  const changed = await mutex.run(storeLock, async () => {
    if (
      generation !== currentPurgeGeneration() ||
      (currentAllowedScope() !== undefined &&
        (currentAllowedScope()?.environment !== minimum.environment ||
          currentAllowedScope()?.ownerId !== minimum.ownerId))
    ) {
      return false;
    }
    const db = await openDatabase();
    if (db === undefined) {
      return false;
    }
    try {
      const { profile } = await readAll(db);
      const sameOwner =
        profile?.environment === minimum.environment &&
        profile.ownerId === minimum.ownerId &&
        profile.subjectId === minimum.subjectId;
      const revision = maximumRevision(sameOwner ? profile.minimumRevision : undefined, minimum.revision);
      if (sameOwner && revision === profile.minimumRevision) {
        return false;
      }
      const transaction = db.transaction(profileStoreName, 'readwrite');
      transaction.objectStore(profileStoreName).put({
        id: profileId,
        schemaVersion,
        environment: minimum.environment,
        ownerId: minimum.ownerId,
        subjectId: minimum.subjectId,
        minimumRevision: revision,
        ...(sameOwner && profile.displayLabel !== undefined ? { displayLabel: profile.displayLabel } : {}),
        selectedAt: sameOwner ? profile.selectedAt : new Date().toISOString(),
      } satisfies ProfileRecord);
      await awaitTransaction(transaction);
      return true;
    } catch {
      return false;
    } finally {
      db.close();
    }
  });
  if (changed) {
    announceRevisionChange();
  }
};

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
  const generation = currentPurgeGeneration();
  return mutex.run(storeLock, async () => {
    if (generation !== currentPurgeGeneration() || outsideAllowedScope(snapshot)) {
      return 'stale';
    }
    const db = await openDatabase();
    if (db === undefined) {
      return 'unavailable';
    }
    try {
      const { profile: previousProfile } = await readAll(db);
      const sameOwner =
        previousProfile?.environment === snapshot.environment &&
        previousProfile.ownerId === snapshot.ownerId &&
        previousProfile.subjectId === snapshot.subjectId;
      const profileLabel = displayLabel ?? (sameOwner ? previousProfile.displayLabel : undefined);
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
        ownerId: snapshot.ownerId,
        subjectId: snapshot.subjectId,
        minimumRevision: maximumRevision(
          sameOwner ? previousProfile.minimumRevision : undefined,
          snapshot.snapshotRevision,
        ),
        ...(profileLabel === undefined ? {} : { displayLabel: profileLabel }),
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

/** A read held in React state, tagged with the billing session it was read for. */
type SessionRead<T> = { readonly session: string; readonly value: T | undefined };

/**
 * Identifies the billing session a read answers. While identity is unknown the
 * device's saved profile, possibly another owner's, is readable; once an owner
 * signs in the children stay mounted, so a read tagged for the unknown session
 * must not be shown or sent for the new owner.
 */
const sessionReadKey = (environment: string | undefined, userId: string | undefined): string =>
  JSON.stringify([environment ?? null, userId ?? null]);

/**
 * The saved usage this device can show for `query`, including on a cold
 * offline start where the session is still indeterminate.
 *
 * @param query - The canonical usage query the page is displaying.
 * @returns The saved snapshot and account label, or `undefined`.
 */
export function useSavedUsage(query: UsageSnapshotQuery): SavedUsage | undefined {
  const { environment, userId } = useBillingSession();
  const session = sessionReadKey(environment, userId);
  const queryKey = useMemo(() => canonicalUsageQueryKey(query), [query]);
  const [saved, setSaved] = useState<SessionRead<SavedUsage> | undefined>(undefined);

  useEffect(() => {
    const cancelled = new AbortController();
    // async-iife: bootstrap — the effect body cannot itself be async
    void (async () => {
      const next = await readSavedUsage(queryKey, { environment, ownerId: userId });
      if (!cancelled.signal.aborted) {
        setSaved({ session, value: next });
      }
    })();
    return () => {
      cancelled.abort();
    };
  }, [environment, queryKey, session, userId]);

  return saved?.session === session ? saved.value : undefined;
}

/** React view of the durable account-revision fence, refreshed across tabs. */
export function useBillingRevisionMinimum(): BillingRevisionMinimum | undefined {
  const { environment, userId } = useBillingSession();
  const session = sessionReadKey(environment, userId);
  const [minimum, setMinimum] = useState<SessionRead<BillingRevisionMinimum> | undefined>(undefined);

  useEffect(() => {
    const cancelled = new AbortController();
    const refresh = async (): Promise<void> => {
      const next = await readBillingRevisionMinimum({ environment, ownerId: userId });
      if (!cancelled.signal.aborted) {
        setMinimum({ session, value: next });
      }
    };
    const refreshFromEvent = (): void => {
      void refresh();
    };
    refreshFromEvent();
    globalThis.addEventListener(revisionChangedEvent, refreshFromEvent);
    const channel = typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(revisionChangedEvent);
    channel?.addEventListener('message', refreshFromEvent);
    return () => {
      cancelled.abort();
      globalThis.removeEventListener(revisionChangedEvent, refreshFromEvent);
      channel?.close();
    };
  }, [environment, session, userId]);

  return minimum?.session === session ? minimum.value : undefined;
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
