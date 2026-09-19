/**
 * Browser workspace compute store engine over a dedicated IndexedDB database.
 *
 * One database per (origin, workspace), owned by the filesystem authority and
 * kept separate from the authority's own filesystem database rather than
 * grafted onto it (D7): a compute clear must never touch project bytes. The
 * workspace key is mapped to an opaque digest, so no project path, revision id
 * or agent id becomes a database name (I3).
 *
 * The record model is the SQLite engine's: separate action and content
 * identities, refcounted payloads so identical bytes are stored once, poison
 * markers, retention roots, a persisted generation and maintained counters.
 * `get` and `put` address records by key — publishing never enumerates
 * (U13, I11) — and reclamation is a bounded resumable cursor slice (U34).
 *
 * IndexedDB has no barrier that survives an unsupported strict commit, so
 * required durability is acknowledged only when the origin is persisted *and*
 * the browser honours `durability: 'strict'`; otherwise the honest answer is
 * `no-durable-storage`, never a false success (D8, I12).
 */

/* oxlint-disable no-await-in-loop -- every loop here issues requests inside one
   open IndexedDB transaction, whose lifetime ends the moment the event loop
   turn completes with no pending request; batching them with `Promise.all`
   would reorder the reads and writes a batch's atomicity depends on. */

import { canonicalizeComputeAction } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { admitCapacityWrite, measureCapacityDomain } from '@taucad/filesystem';
import type { CapacityMeasurement } from '@taucad/filesystem';
import {
  computeDiscoveryKey,
  divergentComputeActions,
  maximumDiscoveryCandidates,
  normalizeValidatedComputeEntries,
  opaqueWorkspaceName,
  validateComputeEntry,
  validateComputeGetInput,
  validateComputePutInput,
} from '#cache/compute-store-records.js';
import type { ValidatedComputeEntry } from '#cache/compute-store-records.js';
import { _registerComputeStore } from '#cache/kernel-compute-runtime.js';
import type {
  ComputeGeneration,
  ComputeGetInput,
  ComputeGetResult,
  ComputePinInput,
  ComputePinResult,
  ComputePutInput,
  ComputePutResult,
  ComputeReleaseInput,
  ComputeStore,
  ComputeStoreControl,
  ComputeStoreEngine,
  ComputeStoreEntry,
  ComputeStoreReport,
  ComputeStoreSession,
} from '#types/runtime-compute.types.js';

/** Store-local logical bound: total retained payload bytes (EQ9). */
const defaultLogicalQuota = 1024 * 1024 * 1024;
/** Store-local logical bound: one entry may not exceed this. */
const defaultMaxEntryBytes = 256 * 1024 * 1024;
/** Bytes written between capacity measurements before the origin is re-measured. */
const measurementPressureBytes = 64 * 1024 * 1024;
/** Records one `collect` slice deletes between budget checks. */
const collectChunk = 256;

const asGeneration = (value: number): ComputeGeneration => value as ComputeGeneration;

type RecordRow = {
  readonly actionDigest: string;
  readonly contentDigest: string;
  readonly mediaType: string;
  readonly determinism: 'byte-exact' | 'equivalent';
  readonly action: string;
  readonly generation: number;
  readonly byteLength: number;
};

type ContentRow = {
  readonly contentDigest: string;
  readonly bytes: ArrayBuffer;
  readonly byteLength: number;
  refs: number;
};

type Counters = { entries: number; logicalBytes: number; pinnedBytes: number; generation: number };

/**
 * Whether this origin granted persistent storage. A host without the API
 * answers `false`, which is the honest input to the durability decision.
 */
const probeOriginPersisted = async (): Promise<boolean> => {
  const storage = (globalThis as { navigator?: { storage?: { persisted?: () => Promise<boolean> } } }).navigator
    ?.storage;
  if (typeof storage?.persisted !== 'function') {
    return false;
  }
  return storage.persisted().catch(() => false);
};

/** Await one IndexedDB request. */
const request = async <T>(source: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    source.addEventListener('success', () => {
      resolve(source.result);
    });
    source.addEventListener('error', () => {
      reject(source.error ?? new Error('IndexedDB request failed.'));
    });
  });

/** Await one transaction's completion — the point at which its writes are visible together. */
const completed = async (transaction: IDBTransaction): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    transaction.addEventListener('complete', () => {
      resolve();
    });
    transaction.addEventListener('error', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
    });
    transaction.addEventListener('abort', () => {
      reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  });

/** A browser IDB engine plus its authority control facet. @public */
export type IndexedDbComputeEngine = {
  readonly engine: ComputeStoreEngine;
  /** Authority-side operations. Never a member of a kernel's compute scope (U25). */
  readonly control: (input: { readonly workspace: string }) => Promise<ComputeStoreControl>;
  /** Close every open database. */
  readonly dispose: () => Promise<void>;
};

/** Options for {@link createIndexedDbComputeEngine}. @public */
export type IndexedDbComputeEngineOptions = {
  /**
   * The authority's own `IDBFactory`, usually `globalThis.indexedDB`.
   *
   * Required rather than defaulted: D7 gives the browser filesystem-manager
   * authority ownership of this database, and `tau-lint(no-direct-indexeddb)`
   * codifies that boundary, so the owner passes its factory in instead of a
   * portable module reaching for the global.
   */
  readonly factory: IDBFactory;
  /** Database name prefix owned by the app shell. Defaults to `tau-compute-`. */
  readonly databasePrefix?: string;
  /** Total retained payload bytes this store may hold. Defaults to 1 GiB. */
  readonly logicalQuota?: number;
  /** Largest single entry. Defaults to 256 MiB. */
  readonly maxEntryBytes?: number;
  /** Bytes kept free for revision writes in the origin's quota pool. */
  readonly reserveBytes?: number;
  /**
   * Whether this origin's storage is persisted. Defaults to
   * `navigator.storage.persisted()`. Persistence is necessary but not
   * sufficient for required durability — the strict-commit probe must also
   * pass — and it is injectable because a browser's answer is the calibration
   * this engine cannot derive.
   */
  readonly persisted?: () => Promise<boolean>;
};

type Store = {
  readonly db: IDBDatabase;
  readonly name: string;
  counters: Counters;
  durable: boolean;
  measurement: CapacityMeasurement | undefined;
  writtenSinceMeasure: number;
};

/**
 * Create the browser workspace compute store engine.
 *
 * @param options - Database prefix, store-local bounds and the persistence probe.
 * @returns The engine, its authority control facet and a disposer.
 * @public
 *
 * @example <caption>Bind a durable store at the browser authority</caption>
 * ```typescript
 * import { createIndexedDbComputeEngine } from '@taucad/runtime/host';
 *
 * const store = createIndexedDbComputeEngine({ factory: globalThis.indexedDB });
 * const control = await store.control({ workspace: 'indexeddb:tau' });
 * ```
 */
export const createIndexedDbComputeEngine = (options: IndexedDbComputeEngineOptions): IndexedDbComputeEngine => {
  const prefix = options.databasePrefix ?? 'tau-compute-';
  const logicalQuota = options.logicalQuota ?? defaultLogicalQuota;
  const maxEntryBytes = options.maxEntryBytes ?? defaultMaxEntryBytes;
  const stores = new Map<string, Store>();
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = async <T>(work: () => Promise<T> | T): Promise<T> => {
    // The chain is the queue: `await` here would serialize this call against the
    // previous one only, not append to a shared tail, so `then` is the operation.
    // oxlint-disable-next-line promise/prefer-await-to-then -- explicit chaining builds the queue tail.
    const run = queue.then(work, work);
    // oxlint-disable-next-line promise/prefer-await-to-then -- the tail must not reject.
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  /**
   * Does this browser honour a strict commit?
   *
   * A browser that ignores the option silently would let a required
   * acknowledgement rest on nothing, so the option is offered and its
   * acceptance observed; when it cannot be observed the store is not durable.
   */
  const probeStrictCommit = (db: IDBDatabase): boolean => {
    try {
      const transaction = db.transaction(['meta'], 'readwrite', { durability: 'strict' });
      const honoured = transaction.durability === 'strict';
      transaction.abort();
      return honoured;
    } catch {
      return false;
    }
  };

  const openStore = async (workspace: string): Promise<Store> => {
    const existing = stores.get(workspace);
    if (existing) {
      return existing;
    }
    const name = `${prefix}${await opaqueWorkspaceName(workspace)}`;
    const openRequest = options.factory.open(name, 1);
    openRequest.addEventListener('upgradeneeded', () => {
      const db = openRequest.result;
      db.createObjectStore('meta', { keyPath: 'key' });
      db.createObjectStore('content', { keyPath: 'contentDigest' });
      const records = db.createObjectStore('record', { keyPath: 'actionDigest' });
      records.createIndex('generation', 'generation');
      records.createIndex('contentDigest', 'contentDigest');
      db.createObjectStore('poison', { keyPath: 'actionDigest' });
      const roots = db.createObjectStore('root', { keyPath: ['retention', 'actionDigest'] });
      roots.createIndex('retention', 'retention');
      roots.createIndex('actionDigest', 'actionDigest');
      const dependencies = db.createObjectStore('dependency', { keyPath: ['actionDigest', 'contentDigest'] });
      dependencies.createIndex('actionDigest', 'actionDigest');
      const discovery = db.createObjectStore('discovery', { keyPath: ['context', 'actionDigest'] });
      discovery.createIndex('context', 'context');
      discovery.createIndex('actionDigest', 'actionDigest');
      const retained = db.createObjectStore('retainedContent', {
        keyPath: ['retention', 'rootAction', 'contentDigest'],
      });
      retained.createIndex('retention', 'retention');
      retained.createIndex('rootAction', 'rootAction');
      retained.createIndex('contentDigest', 'contentDigest');
    });
    const db = await request(openRequest);
    const metaTransaction = db.transaction(['meta'], 'readonly');
    const rows = (await request(metaTransaction.objectStore('meta').getAll())) as Array<{
      key: string;
      value: number;
    }>;
    const map = new Map(rows.map((row) => [row.key, row.value]));
    const persisted = await (options.persisted ?? probeOriginPersisted)();
    const store: Store = {
      db,
      name,
      counters: {
        entries: map.get('entries') ?? 0,
        logicalBytes: map.get('logicalBytes') ?? 0,
        pinnedBytes: map.get('pinnedBytes') ?? 0,
        generation: map.get('generation') ?? 1,
      },
      // D8: persistence permission alone is not proof of a transaction barrier.
      durable: persisted && probeStrictCommit(db),
      measurement: await measureCapacityDomain({ kind: 'origin' }),
      writtenSinceMeasure: 0,
    };
    stores.set(workspace, store);
    return store;
  };

  const writeCounters = (transaction: IDBTransaction, counters: Counters): void => {
    const meta = transaction.objectStore('meta');
    meta.put({ key: 'entries', value: counters.entries });
    meta.put({ key: 'logicalBytes', value: counters.logicalBytes });
    meta.put({ key: 'pinnedBytes', value: counters.pinnedBytes });
    meta.put({ key: 'generation', value: counters.generation });
  };

  const readTransactionCounters = async (transaction: IDBTransaction): Promise<Counters> => {
    const rows = (await request(transaction.objectStore('meta').getAll())) as Array<{ key: string; value: number }>;
    const values = new Map(rows.map((row) => [row.key, row.value]));
    return {
      entries: values.get('entries') ?? 0,
      logicalBytes: values.get('logicalBytes') ?? 0,
      pinnedBytes: values.get('pinnedBytes') ?? 0,
      generation: values.get('generation') ?? 1,
    };
  };

  const readActionClosure = async (transaction: IDBTransaction, seeds: Iterable<string>): Promise<Set<string>> => {
    const records = transaction.objectStore('record');
    const dependencies = transaction.objectStore('dependency').index('actionDigest');
    const retained = new Set(seeds);
    const pending = [...retained];
    while (pending.length > 0) {
      const actionDigest = pending.pop();
      if (actionDigest === undefined) {
        continue;
      }
      for (const dependency of (await request(dependencies.getAll(actionDigest))) as Array<{ contentDigest: string }>) {
        const child = (await request(records.index('contentDigest').get(dependency.contentDigest))) as
          | RecordRow
          | undefined;
        if (child && !retained.has(child.actionDigest)) {
          retained.add(child.actionDigest);
          pending.push(child.actionDigest);
        }
      }
    }
    return retained;
  };

  const readRetainedActions = async (transaction: IDBTransaction): Promise<Set<string>> => {
    const roots = (await request(transaction.objectStore('root').getAll())) as Array<{ actionDigest: string }>;
    return readActionClosure(
      transaction,
      roots.map(({ actionDigest }) => actionDigest),
    );
  };

  const readClosureContent = async (
    transaction: IDBTransaction,
    actionDigest: string,
  ): Promise<Map<string, number>> => {
    const retained = await readActionClosure(transaction, [actionDigest]);
    const records = transaction.objectStore('record');
    const dependencies = transaction.objectStore('dependency').index('actionDigest');
    const contents = transaction.objectStore('content');
    const digests = new Map<string, number>();
    for (const actionDigest of retained) {
      const record = (await request(records.get(actionDigest))) as RecordRow | undefined;
      if (record) {
        digests.set(record.contentDigest, record.byteLength);
      }
      for (const dependency of (await request(dependencies.getAll(actionDigest))) as Array<{ contentDigest: string }>) {
        const content = (await request(contents.get(dependency.contentDigest))) as ContentRow | undefined;
        if (content) {
          digests.set(dependency.contentDigest, content.byteLength);
        }
      }
    }
    return digests;
  };

  const addRoot = async (input: {
    readonly transaction: IDBTransaction;
    readonly counters: Counters;
    readonly retention: string;
    readonly actionDigest: string;
  }): Promise<void> => {
    const { transaction, counters, retention, actionDigest } = input;
    transaction.objectStore('root').put({ retention, actionDigest });
    const retained = transaction.objectStore('retainedContent');
    const occupied = retained.index('contentDigest');
    for (const [contentDigest, byteLength] of await readClosureContent(transaction, actionDigest)) {
      const wasPinned = (await request(occupied.getKey(contentDigest))) !== undefined;
      const key: IDBValidKey = [retention, actionDigest, contentDigest];
      if ((await request(retained.getKey(key))) === undefined) {
        retained.put({ retention, rootAction: actionDigest, contentDigest });
        if (!wasPinned) {
          counters.pinnedBytes += byteLength;
        }
      }
    }
  };

  const removeMemberships = async (input: {
    readonly transaction: IDBTransaction;
    readonly counters: Counters;
    readonly indexName: 'retention' | 'rootAction';
    readonly value: string;
  }): Promise<void> => {
    const { transaction, counters, indexName, value } = input;
    const retained = transaction.objectStore('retainedContent');
    const rows = (await request(retained.index(indexName).getAll(value))) as Array<{
      retention: string;
      rootAction: string;
      contentDigest: string;
    }>;
    for (const row of rows) {
      retained.delete([row.retention, row.rootAction, row.contentDigest]);
    }
    const contents = transaction.objectStore('content');
    for (const contentDigest of new Set(rows.map((row) => row.contentDigest))) {
      if ((await request(retained.index('contentDigest').getKey(contentDigest))) === undefined) {
        const content = (await request(contents.get(contentDigest))) as ContentRow | undefined;
        counters.pinnedBytes -= content?.byteLength ?? 0;
      }
    }
  };

  const admit = async (
    store: Store,
    bytes: number,
  ): Promise<'admit' | 'refuse-unmeasured' | { readonly evict: number }> => {
    if (store.measurement === undefined || store.writtenSinceMeasure >= measurementPressureBytes) {
      store.measurement = await measureCapacityDomain({ kind: 'origin' });
      store.writtenSinceMeasure = 0;
    }
    const measurement: CapacityMeasurement =
      store.measurement.outcome === 'measured'
        ? {
            outcome: 'measured',
            freeBytes: Math.max(store.measurement.freeBytes - store.writtenSinceMeasure, 0),
            totalBytes: store.measurement.totalBytes,
          }
        : store.measurement;
    const decision = admitCapacityWrite({
      measurement,
      request: { bytes, kind: 'cache' },
      ...(options.reserveBytes === undefined ? {} : { reserveBytes: options.reserveBytes }),
    });
    if (decision.decision === 'admit') {
      return 'admit';
    }
    return decision.code === 'capacity-unmeasured' ? 'refuse-unmeasured' : { evict: decision.shortfallBytes };
  };

  /** Delete one record inside an open transaction, maintaining refcounts and counters. */
  const deleteRecord = async (
    transaction: IDBTransaction,
    counters: Counters,
    actionDigest: string,
  ): Promise<number> => {
    const records = transaction.objectStore('record');
    const row = (await request(records.get(actionDigest))) as RecordRow | undefined;
    if (!row) {
      return 0;
    }
    records.delete(actionDigest);
    const discovery = transaction.objectStore('discovery');
    for (const key of await request(discovery.index('actionDigest').getAllKeys(actionDigest))) {
      discovery.delete(key);
    }
    const contents = transaction.objectStore('content');
    const dependencies = transaction.objectStore('dependency');
    const dependencyRows = (await request(dependencies.index('actionDigest').getAll(actionDigest))) as Array<{
      actionDigest: string;
      contentDigest: string;
    }>;
    for (const dependency of dependencyRows) {
      dependencies.delete([dependency.actionDigest, dependency.contentDigest]);
      const dependencyContent = (await request(contents.get(dependency.contentDigest))) as ContentRow | undefined;
      if (dependencyContent) {
        const remaining = dependencyContent.refs - 1;
        if (remaining <= 0) {
          contents.delete(dependency.contentDigest);
        } else {
          contents.put({ ...dependencyContent, refs: remaining });
        }
      }
    }
    const content = (await request(contents.get(row.contentDigest))) as ContentRow | undefined;
    if (content) {
      const remaining = content.refs - 1;
      if (remaining <= 0) {
        contents.delete(row.contentDigest);
      } else {
        contents.put({ ...content, refs: remaining });
      }
    }
    // A fenced record left over from an earlier generation was already removed
    // from the counters by `clear`; subtracting again would drive them negative.
    if (row.generation === counters.generation) {
      counters.entries -= 1;
      counters.logicalBytes -= row.byteLength;
    }
    return row.byteLength;
  };

  /** Reclaim unleased entries up to `target` bytes. Rooted data is never a candidate (D26). */
  const evictUnleased = async (store: Store, target: number): Promise<number> => {
    const transaction = store.db.transaction(
      ['record', 'content', 'dependency', 'root', 'meta', 'discovery', 'retainedContent'],
      'readwrite',
    );
    const counters = { ...store.counters };
    let reclaimed = 0;
    const cursorRequest = transaction.objectStore('record').openKeyCursor();
    const candidates: string[] = [];
    await new Promise<void>((resolve, reject) => {
      cursorRequest.addEventListener('success', () => {
        const cursor = cursorRequest.result;
        if (!cursor || candidates.length >= collectChunk) {
          resolve();
          return;
        }
        if (typeof cursor.key === 'string') {
          candidates.push(cursor.key);
        }
        cursor.continue();
      });
      cursorRequest.addEventListener('error', () => {
        reject(cursorRequest.error ?? new Error('IndexedDB cursor failed.'));
      });
    });
    const retained = transaction.objectStore('retainedContent').index('contentDigest');
    for (const actionDigest of candidates) {
      if (reclaimed >= target) {
        break;
      }
      const row = (await request(transaction.objectStore('record').get(actionDigest))) as RecordRow | undefined;
      if (row && (await request(retained.getKey(row.contentDigest))) !== undefined) {
        continue;
      }
      reclaimed += await deleteRecord(transaction, counters, actionDigest);
    }
    writeCounters(transaction, counters);
    await completed(transaction);
    store.counters = counters;
    return reclaimed;
  };

  const open = async (input: {
    readonly workspace: string;
    readonly signal?: AbortSignal;
  }): Promise<ComputeStoreSession> => {
    input.signal?.throwIfAborted();
    const store = await serialize(async () => openStore(input.workspace));
    store.counters = await readTransactionCounters(store.db.transaction(['meta'], 'readonly'));
    const opened = asGeneration(store.counters.generation);
    let closed = false;
    const assertOpen = (): void => {
      if (closed) {
        throw new Error('This compute store session is closed.');
      }
    };

    return {
      generation: opened,
      durable: store.durable,

      get: async (get: ComputeGetInput): Promise<ComputeGetResult> => {
        assertOpen();
        get.signal?.throwIfAborted();
        validateComputeGetInput(get);
        return serialize(async (): Promise<ComputeGetResult> => {
          store.counters = await readTransactionCounters(store.db.transaction(['meta'], 'readonly'));
          if (get.generation !== store.counters.generation) {
            return { status: 'stale-generation', generation: asGeneration(store.counters.generation) };
          }
          const resident = new Set(get.resident ?? []);
          const transaction = store.db.transaction(
            ['record', 'content', 'dependency', 'poison', 'discovery'],
            'readonly',
          );
          const records = transaction.objectStore('record');
          const contents = transaction.objectStore('content');
          const dependencies = transaction.objectStore('dependency');
          const poison = transaction.objectStore('poison');
          const entries: ComputeStoreEntry[] = [];
          const omitted: Array<{ digest: ActionDigest; reason: 'missing' | 'poisoned' | 'budget' }> = [];
          let bytes = 0;
          const candidates = get.discovery
            ? (
                (await request(
                  transaction
                    .objectStore('discovery')
                    .index('context')
                    .getAll(computeDiscoveryKey(get.discovery), maximumDiscoveryCandidates),
                )) as Array<{ actionDigest: ActionDigest }>
              ).map(({ actionDigest }) => actionDigest)
            : [];
          for (const digest of new Set([...get.digests, ...candidates])) {
            if (resident.has(digest)) {
              continue;
            }
            if ((await request(poison.getKey(digest))) !== undefined) {
              omitted.push({ digest, reason: 'poisoned' });
              continue;
            }
            const row = (await request(records.get(digest))) as RecordRow | undefined;
            if (!row || row.generation !== store.counters.generation) {
              omitted.push({ digest, reason: 'missing' });
              continue;
            }
            const requiredContent = (
              (await request(dependencies.index('actionDigest').getAll(digest))) as Array<{ contentDigest: string }>
            ).map(({ contentDigest }) => contentDigest as ComputeStoreEntry['contentDigest']);
            let complete = true;
            for (const dependency of requiredContent) {
              if ((await request(contents.getKey(dependency))) === undefined) {
                complete = false;
                break;
              }
            }
            if (!complete) {
              omitted.push({ digest, reason: 'missing' });
              continue;
            }
            if (entries.length >= get.maxEntries || bytes + row.byteLength > get.maxBytes) {
              omitted.push({ digest, reason: 'budget' });
              continue;
            }
            const content = (await request(contents.get(row.contentDigest))) as ContentRow | undefined;
            if (!content) {
              // An incomplete closure is a miss, never a partial hit.
              omitted.push({ digest, reason: 'missing' });
              continue;
            }
            entries.push({
              action: JSON.parse(row.action) as ComputeAction,
              actionDigest: digest,
              // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the field is the stored content digest.
              contentDigest: row.contentDigest as ComputeStoreEntry['contentDigest'],
              mediaType: row.mediaType,
              bytes: new Uint8Array(content.bytes),
              requiredContent,
              determinism: row.determinism,
            });
            bytes += row.byteLength;
          }
          return { status: 'ok', entries, omitted };
        });
      },

      put: async (put: ComputePutInput): Promise<ComputePutResult> => {
        assertOpen();
        put.signal?.throwIfAborted();
        validateComputePutInput(put);
        if (put.durability === 'required') {
          if (!store.durable) {
            return { status: 'no-durable-storage' };
          }
          if (put.retention === undefined) {
            return { status: 'unavailable', reason: 'Required durability needs an authorized retention owner.' };
          }
        }
        // Oversized records are refused before I/O; quota uses incremental bytes below.
        if (put.entries.some((entry) => entry.bytes.byteLength > maxEntryBytes)) {
          return { status: 'quota', logicalBytes: store.counters.logicalBytes, logicalQuota };
        }
        const records: ValidatedComputeEntry[] = [];
        for (const entry of put.entries) {
          const valid = await validateComputeEntry(entry);
          if (valid) {
            records.push(valid);
          }
        }
        put.signal?.throwIfAborted();
        const validated = normalizeValidatedComputeEntries(records);
        const divergent = divergentComputeActions(validated);
        const poisonedBatchActions = new Set<ActionDigest>();
        for (const digest of divergent) {
          if (validated.some(({ entry }) => entry.actionDigest === digest && entry.determinism === 'byte-exact')) {
            poisonedBatchActions.add(digest);
          }
        }

        return serialize(async (): Promise<ComputePutResult> => {
          store.counters = await readTransactionCounters(store.db.transaction(['meta'], 'readonly'));
          if (put.generation !== store.counters.generation) {
            return { status: 'stale-generation', generation: asGeneration(store.counters.generation) };
          }
          const probe = store.db.transaction(['record'], 'readonly').objectStore('record');
          let incrementalBytes = 0;
          for (const { entry } of validated) {
            if ((await request(probe.getKey(entry.actionDigest))) === undefined) {
              incrementalBytes += entry.bytes.byteLength;
            }
          }
          if (store.counters.logicalBytes + incrementalBytes > logicalQuota) {
            return { status: 'quota', logicalBytes: store.counters.logicalBytes, logicalQuota };
          }
          let decision = await admit(store, incrementalBytes);
          if (typeof decision === 'object') {
            await evictUnleased(store, decision.evict);
            store.measurement = undefined;
            store.counters = await readTransactionCounters(store.db.transaction(['meta'], 'readonly'));
            decision = await admit(store, incrementalBytes);
          }
          if (typeof decision === 'object') {
            return { status: 'quota', logicalBytes: store.counters.logicalBytes, logicalQuota };
          }
          if (decision === 'refuse-unmeasured') {
            return { status: 'unavailable', reason: 'Capacity domain is unmeasurable; caching is skipped.' };
          }

          const required = put.durability === 'required';
          let counters = { ...store.counters };
          const published: ActionDigest[] = [];
          const inserted = new Set<ActionDigest>();
          const conflicts: Array<{ digest: ActionDigest; outcome: 'poisoned' | 'first-writer-retained' }> = [];
          // Data, payloads and initial roots become visible together (D11).
          const transaction = store.db.transaction(
            ['record', 'content', 'dependency', 'poison', 'root', 'meta', 'discovery', 'retainedContent'],
            'readwrite',
            required ? { durability: 'strict' } : undefined,
          );
          const records = transaction.objectStore('record');
          const contents = transaction.objectStore('content');
          const dependenciesStore = transaction.objectStore('dependency');
          const poison = transaction.objectStore('poison');
          const roots = transaction.objectStore('root');
          const discovery = transaction.objectStore('discovery');
          try {
            counters = await readTransactionCounters(transaction);
            if (put.generation !== counters.generation) {
              transaction.abort();
              return { status: 'stale-generation', generation: asGeneration(counters.generation) };
            }
            for (const digest of poisonedBatchActions) {
              await removeMemberships({ transaction, counters, indexName: 'rootAction', value: digest });
              await deleteRecord(transaction, counters, digest);
              poison.put({ actionDigest: digest });
              const rooted = await request(roots.index('actionDigest').getAllKeys(digest));
              for (const key of rooted) {
                roots.delete(key);
              }
              conflicts.push({ digest, outcome: 'poisoned' });
            }
            const candidates: ValidatedComputeEntry[] = [];
            for (const candidate of validated) {
              if (poisonedBatchActions.has(candidate.entry.actionDigest)) {
                continue;
              }
              if ((await request(poison.getKey(candidate.entry.actionDigest))) !== undefined) {
                continue;
              }
              const existing = (await request(records.get(candidate.entry.actionDigest))) as RecordRow | undefined;
              if (existing === undefined || existing.contentDigest === candidate.entry.contentDigest) {
                candidates.push(candidate);
              }
            }
            const publishable: ValidatedComputeEntry[] = [];
            const produced = new Set<ComputeStoreEntry['contentDigest']>();
            const accepted = new Set<ActionDigest>();
            let changed = true;
            while (changed) {
              changed = false;
              for (const candidate of candidates) {
                if (accepted.has(candidate.entry.actionDigest)) {
                  continue;
                }
                let hasClosure = true;
                for (const dependency of candidate.dependencies) {
                  if (!produced.has(dependency) && (await request(contents.getKey(dependency))) === undefined) {
                    hasClosure = false;
                    break;
                  }
                }
                if (hasClosure) {
                  publishable.push(candidate);
                  produced.add(candidate.entry.contentDigest);
                  accepted.add(candidate.entry.actionDigest);
                  changed = true;
                }
              }
            }
            const candidateContent = produced;
            const handledEquivalentBatchActions = new Set<ActionDigest>();
            for (const { entry, dependencies } of validated) {
              if (poisonedBatchActions.has(entry.actionDigest)) {
                continue;
              }
              if (divergent.has(entry.actionDigest)) {
                if (handledEquivalentBatchActions.has(entry.actionDigest)) {
                  continue;
                }
                handledEquivalentBatchActions.add(entry.actionDigest);
                conflicts.push({ digest: entry.actionDigest, outcome: 'first-writer-retained' });
              }
              let complete = true;
              for (const dependency of dependencies) {
                if (!candidateContent.has(dependency) && (await request(contents.getKey(dependency))) === undefined) {
                  complete = false;
                  break;
                }
              }
              if (!complete) {
                continue;
              }
              if ((await request(poison.getKey(entry.actionDigest))) !== undefined) {
                conflicts.push({ digest: entry.actionDigest, outcome: 'poisoned' });
                continue;
              }
              const existing = (await request(records.get(entry.actionDigest))) as RecordRow | undefined;
              if (existing && existing.contentDigest !== entry.contentDigest) {
                // I6: publish-once is never last-writer-wins.
                if (entry.determinism === 'equivalent') {
                  conflicts.push({ digest: entry.actionDigest, outcome: 'first-writer-retained' });
                  continue;
                }
                await removeMemberships({
                  transaction,
                  counters,
                  indexName: 'rootAction',
                  value: entry.actionDigest,
                });
                await deleteRecord(transaction, counters, entry.actionDigest);
                poison.put({ actionDigest: entry.actionDigest });
                const rooted = await request(roots.index('actionDigest').getAllKeys(entry.actionDigest));
                for (const key of rooted) {
                  roots.delete(key);
                }
                conflicts.push({ digest: entry.actionDigest, outcome: 'poisoned' });
                continue;
              }
              if (!existing) {
                inserted.add(entry.actionDigest);
                const content = (await request(contents.get(entry.contentDigest))) as ContentRow | undefined;
                if (content) {
                  // Deduplicate identical bytes, not merely equal action names.
                  contents.put({ ...content, refs: content.refs + 1 });
                } else {
                  const buffer: ArrayBuffer = Uint8Array.from(entry.bytes).buffer;
                  contents.put({
                    contentDigest: entry.contentDigest,
                    bytes: buffer,
                    byteLength: entry.bytes.byteLength,
                    refs: 1,
                  });
                }
                records.put({
                  actionDigest: entry.actionDigest,
                  contentDigest: entry.contentDigest,
                  mediaType: entry.mediaType,
                  determinism: entry.determinism,
                  action: canonicalizeComputeAction(entry.action),
                  generation: counters.generation,
                  byteLength: entry.bytes.byteLength,
                } satisfies RecordRow);
                for (const dependency of dependencies) {
                  dependenciesStore.put({ actionDigest: entry.actionDigest, contentDigest: dependency });
                }
                counters.entries += 1;
                counters.logicalBytes += entry.bytes.byteLength;
              }
              if (put.discovery) {
                discovery.put({ context: computeDiscoveryKey(put.discovery), actionDigest: entry.actionDigest });
              }
              published.push(entry.actionDigest);
            }
            for (const { entry, dependencies } of validated) {
              if (!inserted.has(entry.actionDigest)) {
                continue;
              }
              for (const dependency of dependencies) {
                const content = (await request(contents.get(dependency))) as ContentRow | undefined;
                if (content) {
                  contents.put({ ...content, refs: content.refs + 1 });
                }
              }
            }
            if (required && put.retention !== undefined) {
              for (const digest of published) {
                await addRoot({ transaction, counters, retention: put.retention.name, actionDigest: digest });
              }
            }
            writeCounters(transaction, counters);
            await completed(transaction);
          } catch (error) {
            try {
              transaction.abort();
            } catch {
              // Already settled.
            }
            return { status: 'unavailable', reason: String(error) };
          }
          store.counters = counters;
          store.writtenSinceMeasure += incrementalBytes;
          // The honest entries of a conflicting batch still commit (U23, I6).
          return { status: 'committed', published, conflicts };
        });
      },

      pin: async (pin: ComputePinInput): Promise<ComputePinResult> => {
        assertOpen();
        pin.signal?.throwIfAborted();
        if (!store.durable) {
          // D8, I12: an unsupported strict commit is never a false success.
          return { status: 'no-durable-storage' };
        }
        return serialize(async (): Promise<ComputePinResult> => {
          store.counters = await readTransactionCounters(store.db.transaction(['meta'], 'readonly'));
          if (pin.generation !== store.counters.generation) {
            return { status: 'stale-generation', generation: asGeneration(store.counters.generation) };
          }
          let counters = { ...store.counters };
          const transaction = store.db.transaction(
            ['record', 'content', 'dependency', 'root', 'meta', 'retainedContent'],
            'readwrite',
            { durability: 'strict' },
          );
          const records = transaction.objectStore('record');
          counters = await readTransactionCounters(transaction);
          if (pin.generation !== counters.generation) {
            transaction.abort();
            return { status: 'stale-generation', generation: asGeneration(counters.generation) };
          }
          const missing: ActionDigest[] = [];
          const found: Array<{ digest: ActionDigest; byteLength: number }> = [];
          for (const digest of pin.digests) {
            const row = (await request(records.get(digest))) as RecordRow | undefined;
            if (row && row.generation === counters.generation) {
              found.push({ digest, byteLength: row.byteLength });
            } else {
              missing.push(digest);
            }
          }
          if (missing.length > 0) {
            transaction.abort();
            return { status: 'missing', digests: missing };
          }
          for (const { digest, byteLength } of found) {
            await addRoot({ transaction, counters, retention: pin.retention.name, actionDigest: digest });
            void byteLength;
          }
          writeCounters(transaction, counters);
          await completed(transaction);
          store.counters = counters;
          return { status: 'pinned', pinned: found.map(({ digest }) => digest) };
        });
      },

      release: async (release: ComputeReleaseInput): Promise<{ readonly status: 'released' }> => {
        release.signal?.throwIfAborted();
        return serialize(async () => {
          let counters = { ...store.counters };
          const transaction = store.db.transaction(
            ['record', 'content', 'dependency', 'root', 'meta', 'retainedContent'],
            'readwrite',
          );
          counters = await readTransactionCounters(transaction);
          const roots = transaction.objectStore('root');
          const owned = (await request(roots.index('retention').getAll(release.retention.name))) as Array<{
            retention: string;
            actionDigest: string;
          }>;
          for (const root of owned) {
            roots.delete([root.retention, root.actionDigest]);
          }
          await removeMemberships({
            transaction,
            counters,
            indexName: 'retention',
            value: release.retention.name,
          });
          writeCounters(transaction, counters);
          await completed(transaction);
          store.counters = counters;
          return { status: 'released' };
        });
      },

      close: async () => {
        closed = true;
      },
    };
  };

  const control = async (input: { readonly workspace: string }): Promise<ComputeStoreControl> => {
    const store = await serialize(async () => openStore(input.workspace));
    return {
      inspect: async ({ signal }): Promise<ComputeStoreReport> => {
        signal?.throwIfAborted();
        return serialize(async (): Promise<ComputeStoreReport> => {
          store.counters = await readTransactionCounters(store.db.transaction(['meta'], 'readonly'));
          // Maintained counters only (I11, U21). The origin's estimate covers
          // every store in it, so this database's physical share is not
          // separable and is reported unsupported rather than faked.
          return {
            entries: store.counters.entries,
            logicalBytes: store.counters.logicalBytes,
            pinnedBytes: store.counters.pinnedBytes,
            pendingBytes: 0,
            generation: asGeneration(store.counters.generation),
            physicalBytes: { status: 'unsupported' },
          };
        });
      },

      clear: async ({ signal }) => {
        signal?.throwIfAborted();
        return serialize(async () => {
          const transaction = store.db.transaction(
            ['record', 'content', 'dependency', 'poison', 'root', 'meta', 'discovery'],
            'readwrite',
          );
          const authoritative = await readTransactionCounters(transaction);
          const next = authoritative.generation + 1;
          const records = transaction.objectStore('record');
          const poison = transaction.objectStore('poison');
          poison.clear();
          transaction.objectStore('discovery').clear();
          // D26: required roots and their data survive and stay reusable.
          const rootedKeys = await readRetainedActions(transaction);
          let retained = 0;
          let entries = 0;
          for (const actionDigest of rootedKeys) {
            const row = (await request(records.get(actionDigest))) as RecordRow | undefined;
            if (!row) {
              continue;
            }
            records.put({ ...row, generation: next });
            retained += row.byteLength;
            entries += 1;
          }
          const counters: Counters = {
            generation: next,
            entries,
            logicalBytes: retained,
            pinnedBytes: authoritative.pinnedBytes,
          };
          writeCounters(transaction, counters);
          await completed(transaction);
          store.counters = counters;
          return { status: 'cleared', generation: asGeneration(next), retained } as const;
        });
      },

      collect: async ({ budget, cursor, signal }) => {
        signal?.throwIfAborted();
        return serialize(async () => {
          const deadline = Date.now() + budget;
          let position = cursor;
          let reclaimed = 0;
          for (;;) {
            let counters = { ...store.counters };
            const transaction = store.db.transaction(
              ['record', 'content', 'dependency', 'meta', 'discovery'],
              'readwrite',
            );
            counters = await readTransactionCounters(transaction);
            const records = transaction.objectStore('record');
            const range = position === undefined ? null : IDBKeyRange.lowerBound(position, true);
            const cursorRequest = records.openKeyCursor(range);
            const slice: string[] = [];
            await new Promise<void>((resolve, reject) => {
              cursorRequest.addEventListener('success', () => {
                const openCursor = cursorRequest.result;
                if (!openCursor || slice.length >= collectChunk) {
                  resolve();
                  return;
                }
                if (typeof openCursor.key === 'string') {
                  slice.push(openCursor.key);
                }
                openCursor.continue();
              });
              cursorRequest.addEventListener('error', () => {
                reject(cursorRequest.error ?? new Error('IndexedDB cursor failed.'));
              });
            });
            if (slice.length === 0) {
              transaction.abort();
              return { status: 'complete', reclaimed } as const;
            }
            for (const actionDigest of slice) {
              const row = (await request(records.get(actionDigest))) as RecordRow | undefined;
              // A record rooted during this pass carries the live generation and
              // is therefore never a candidate: the generation stamp is the
              // write barrier, rechecked inside the sweep transaction.
              if (row && row.generation < counters.generation) {
                reclaimed += await deleteRecord(transaction, counters, actionDigest);
              }
              position = actionDigest;
            }
            writeCounters(transaction, counters);
            await completed(transaction);
            store.counters = counters;
            if (Date.now() >= deadline) {
              return { status: 'incomplete', reclaimed, cursor: position } as const;
            }
          }
        });
      },
    };
  };

  return {
    engine: { open },
    control,
    dispose: async () => {
      await serialize(() => {
        for (const store of stores.values()) {
          store.db.close();
        }
        stores.clear();
      });
    },
  };
};

/**
 * Mint an opaque durable store spec backed by browser IndexedDB.
 *
 * @param input - The engine and the workspace key this spec addresses.
 * @returns The opaque spec to place in `{ mode: 'durable', store }`.
 * @public
 *
 * @example <caption>Compose a durable binding in the browser</caption>
 * ```typescript
 * import { createIndexedDbComputeEngine, fromIndexedDb } from '@taucad/runtime/host';
 *
 * const store = createIndexedDbComputeEngine({ factory: globalThis.indexedDB });
 * const binding = { mode: 'durable', store: fromIndexedDb({ store, workspace: 'indexeddb:tau' }) } as const;
 * ```
 */
export const fromIndexedDb = (input: {
  readonly store: IndexedDbComputeEngine;
  readonly workspace: string;
}): ComputeStore => {
  // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the brand is established by registration.
  const spec = {} as ComputeStore;
  const control: ComputeStoreControl = {
    inspect: async (request) => {
      const authority = await input.store.control({ workspace: input.workspace });
      return authority.inspect(request);
    },
    clear: async (request) => {
      const authority = await input.store.control({ workspace: input.workspace });
      return authority.clear(request);
    },
    collect: async (request) => {
      const authority = await input.store.control({ workspace: input.workspace });
      return authority.collect(request);
    },
  };
  return _registerComputeStore({ spec, engine: input.store.engine, workspace: input.workspace, control });
};
