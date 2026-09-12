// oxlint-disable-next-line import/no-unassigned-import -- side-effect import polyfills IndexedDB for tests
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @nx/enforce-module-boundaries -- this first-party billing persistence owns the direct wire contract
import { wireUsageSnapshotSchema } from '@taucad/billing';
import type { UsageSnapshotQuery } from '@taucad/billing/hooks/use-usage-snapshot';
import {
  canonicalUsageQueryKey,
  purgeSavedUsage,
  readSavedUsage,
  writeSavedUsage,
} from '#db/billing-snapshot-store.js';

const timestamp = '2026-09-12T00:00:00.000Z';
const groupTotals = { accountDeltaCreditAtoms: '-12345', netUsedCreditAtoms: '12345', eventCount: '1' };

const receipt = (operationId: string) => ({
  schemaVersion: 1,
  environment: 'development',
  ownerId: 'user-a',
  subjectId: 'account-a',
  operationId,
  baseTransactionId: `txn_${operationId}`,
  terminalRevision: '7',
  policyVersion: 'policy_1',
  activationId: 'activation_1',
  meterContractId: 'meter_1',
  category: 'llm',
  model: { id: 'openai-gpt-5.6-luna', displayName: 'Luna', providerId: 'openai' },
  activity: { kind: 'agent', projectHint: null, chatHint: null, parentAttemptKey: null },
  historyVersion: 1,
  admittedAt: timestamp,
  dispatchIntentAt: timestamp,
  usageOccurredAt: timestamp,
  evidenceOccurredAt: timestamp,
  timingStatus: 'dispatch_intent',
  kind: 'base',
  resolvedAt: timestamp,
  executionStatus: 'succeeded',
  customerState: 'settled',
  authorizedMaxCreditAtoms: '20000',
  chargedCreditAtoms: '12345',
  accountDeltaCreditAtoms: '-12345',
  meteringStatus: 'complete',
  meterItems: [],
  tokens: {
    status: 'complete',
    uncachedInput: '1000',
    cacheRead: '0',
    cacheWrite: '0',
    inputTotal: '1000',
    output: '50',
    reasoning: '10',
  },
});

const buildSnapshot = (
  overrides: Record<string, unknown> = {},
  rows = [receipt('op_1')],
): ReturnType<typeof wireUsageSnapshotSchema.parse> =>
  wireUsageSnapshotSchema.parse({
    schemaVersion: 1,
    environment: 'development',
    ownerId: 'user-a',
    subjectId: 'account-a',
    snapshotRevision: '7',
    asOf: timestamp,
    query: {
      preset: 'last_30_days',
      fromDate: '2026-08-13',
      toDate: '2026-09-12',
      timeZone: 'UTC',
      models: [],
      activities: [],
      projects: [],
    },
    coverage: {
      historyStart: null,
      legacyBefore: null,
      complete: true,
      detailComplete: true,
      excludedUnknownTimeCount: '0',
    },
    availability: { state: 'available', reason: null },
    totals: groupTotals,
    rows: { items: rows, nextCursor: null, complete: true },
    ...overrides,
  });

const snapshotA = buildSnapshot();
const session = { environment: 'development', ownerId: 'user-a' };
const queryKey = canonicalUsageQueryKey({ range: 'last_30_days', models: [], activities: [], projects: [] });

/** The record shape the store writes, read back without going through the store. */
const rawRecords = async (): Promise<Array<{ key: string; ownerId: string }>> =>
  new Promise((resolve) => {
    const open = indexedDB.open('tau-billing', 1);
    open.onsuccess = () => {
      const db = open.result;
      const request = db.transaction('usageSnapshots', 'readonly').objectStore('usageSnapshots').getAll();
      request.addEventListener('success', () => {
        db.close();
        resolve(request.result as Array<{ key: string; ownerId: string }>);
      });
    };
  });

const writeRaw = async (key: string, value: Record<string, unknown>): Promise<void> =>
  new Promise((resolve) => {
    const open = indexedDB.open('tau-billing', 1);
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction('usageSnapshots', 'readwrite');
      transaction.objectStore('usageSnapshots').put({ key, ...value });
      transaction.addEventListener('complete', () => {
        db.close();
        resolve();
      });
    };
  });

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  // An unscoped purge also lifts the module-level owner restriction left by a previous case.
  await purgeSavedUsage();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('billing snapshot store', () => {
  // ── Envelope-scoped persistence ──────────────────────────────────────────
  it('should save a snapshot and read it back for the same canonical query', async () => {
    await expect(writeSavedUsage(snapshotA, queryKey, 'a@example.test')).resolves.toBe('saved');

    await expect(readSavedUsage(queryKey, session)).resolves.toEqual({
      snapshot: snapshotA,
      label: 'a@example.test',
    });
  });

  it('should fall back to the subject when no display label was stored', async () => {
    await writeSavedUsage(snapshotA, queryKey);

    await expect(readSavedUsage(queryKey, session)).resolves.toMatchObject({ label: 'account-a' });
  });

  it('should key a different canonical query separately', async () => {
    await writeSavedUsage(snapshotA, queryKey);

    await expect(readSavedUsage(canonicalUsageQueryKey({ range: 'all_time' }), session)).resolves.toBeUndefined();
  });

  it('should normalize property order so an equivalent query hits the same record', () => {
    const left: UsageSnapshotQuery = { range: 'custom', startDate: '2026-08-13', endDate: '2026-09-12' };
    const right: UsageSnapshotQuery = { endDate: '2026-09-12', range: 'custom', startDate: '2026-08-13' };

    expect(canonicalUsageQueryKey(left)).toBe(canonicalUsageQueryKey(right));
  });

  // ── Cross-account and corrupt records ────────────────────────────────────
  it('should never return a record belonging to another owner', async () => {
    await writeSavedUsage(snapshotA, queryKey);

    await expect(readSavedUsage(queryKey, { environment: 'development', ownerId: 'user-b' })).resolves.toBeUndefined();
  });

  it('should never return a record from another environment', async () => {
    await writeSavedUsage(snapshotA, queryKey);

    await expect(readSavedUsage(queryKey, { environment: 'staging', ownerId: 'user-a' })).resolves.toBeUndefined();
  });

  it('should read the selected profile on a cold start with no resolved session', async () => {
    await writeSavedUsage(snapshotA, queryKey);

    await expect(readSavedUsage(queryKey)).resolves.toMatchObject({ snapshot: snapshotA });
  });

  it('should remove a record that no longer validates instead of rendering it', async () => {
    await writeSavedUsage(snapshotA, queryKey);
    const [stored] = await rawRecords();
    await writeRaw(stored?.key ?? '', {
      environment: 'development',
      ownerId: 'user-a',
      subjectId: 'account-a',
      queryKey,
      savedAt: Date.now(),
      rowCount: 1,
      snapshot: { ...snapshotA, totals: { netUsedCreditAtoms: '12345' } },
    });

    await expect(readSavedUsage(queryKey, session)).resolves.toBeUndefined();
    await expect(rawRecords()).resolves.toHaveLength(0);
  });

  it('should refuse a saved revision older than a known receipt revision', async () => {
    await writeSavedUsage(snapshotA, queryKey);

    await expect(readSavedUsage(queryKey, session, '8')).resolves.toBeUndefined();
    await expect(readSavedUsage(queryKey, session, '7')).resolves.toMatchObject({ snapshot: snapshotA });
  });

  // ── Local ceiling ────────────────────────────────────────────────────────
  it('should evict the oldest query pages past the 1,000 row ceiling', async () => {
    let clock = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => {
      clock += 1000;
      return clock;
    });
    const fullPage = buildSnapshot(
      {},
      Array.from({ length: 200 }, (_, index) => receipt(`op_${index}`)),
    );
    const keys = Array.from({ length: 6 }, (_, index) =>
      canonicalUsageQueryKey({ range: 'custom', cursor: `c${index}` }),
    );
    // The store's mutex runs these in submission order, so each save sees the
    // previous one's record when it evaluates the ceiling.
    await Promise.all(keys.map(async (key) => writeSavedUsage(fullPage, key)));

    await expect(readSavedUsage(keys[0] ?? '', session)).resolves.toBeUndefined();
    await expect(readSavedUsage(keys[5] ?? '', session)).resolves.toMatchObject({ snapshot: fullPage });
    await expect(rawRecords()).resolves.toHaveLength(5);
  });

  // ── Purge ────────────────────────────────────────────────────────────────
  it('should clear every snapshot and the profile on an unscoped purge', async () => {
    await writeSavedUsage(snapshotA, queryKey);

    await purgeSavedUsage();

    await expect(readSavedUsage(queryKey, session)).resolves.toBeUndefined();
    await expect(readSavedUsage(queryKey)).resolves.toBeUndefined();
    await expect(rawRecords()).resolves.toHaveLength(0);
  });

  it('should keep the newly bound owner and drop the previous one', async () => {
    const snapshotB = buildSnapshot({ ownerId: 'user-b', subjectId: 'account-b' }, [
      { ...receipt('op_b'), ownerId: 'user-b', subjectId: 'account-b' },
    ]);
    await writeSavedUsage(snapshotA, queryKey);
    await writeSavedUsage(snapshotB, queryKey);

    await purgeSavedUsage({ environment: 'development', ownerId: 'user-b' });

    await expect(readSavedUsage(queryKey, { environment: 'development', ownerId: 'user-a' })).resolves.toBeUndefined();
    await expect(readSavedUsage(queryKey, { environment: 'development', ownerId: 'user-b' })).resolves.toMatchObject({
      snapshot: snapshotB,
    });
    await expect(rawRecords()).resolves.toHaveLength(1);
  });

  it('should refuse a save for an owner the last purge did not keep', async () => {
    // The other tab still renders user-a; its refetch after the purge broadcast must not write user-a back.
    await writeSavedUsage(snapshotA, queryKey);
    await purgeSavedUsage({ environment: 'development', ownerId: 'user-b' });

    await expect(writeSavedUsage(snapshotA, queryKey)).resolves.toBe('stale');

    await expect(rawRecords()).resolves.toHaveLength(0);
    await expect(readSavedUsage(queryKey)).resolves.toBeUndefined();
  });

  it('should discard a save that was already in flight when a purge started', async () => {
    const pending = writeSavedUsage(snapshotA, queryKey);
    const purged = purgeSavedUsage();

    await expect(pending).resolves.toBe('stale');
    await purged;
    await expect(readSavedUsage(queryKey, session)).resolves.toBeUndefined();
  });

  // ── Storage unavailable ──────────────────────────────────────────────────
  it('should report offline saving as unavailable when storage is disabled', async () => {
    vi.stubGlobal('indexedDB', undefined);

    await expect(writeSavedUsage(snapshotA, queryKey)).resolves.toBe('unavailable');
    await expect(readSavedUsage(queryKey, session)).resolves.toBeUndefined();
    await expect(purgeSavedUsage()).resolves.toBeUndefined();
  });
});
