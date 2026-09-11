/**
 * Native workspace compute store engine over `node:sqlite`.
 *
 * One database file per (host, workspace) under a host-resolved state
 * directory, never inside a revision root, worktree, slot or materialized tree
 * (D9, I4): the caller passes the directory its own state resolver produced and
 * the workspace key is mapped to an opaque digest filename, so no project path,
 * revision id or agent id reaches the filesystem.
 *
 * Every hot-path statement is a primary-key or index lookup — publishing never
 * enumerates existing records (U13, I11) — and `inspect` reads maintained
 * counters rather than recomputing reachability. Reclamation is a bounded
 * resumable slice, never part of a put or a render (U25, U34).
 *
 * `node:sqlite` is a Node builtin on this package's `>=24` engine floor, so
 * this engine adds no dependency. It is reached through a dynamic import so the
 * browser barrel never statically resolves a Node builtin — the same rule
 * `@taucad/filesystem`'s capacity domain follows.
 */

import { canonicalizeComputeAction } from '@taucad/cache-core';
import type { ActionDigest, ComputeAction } from '@taucad/cache-core';
import { admitCapacityWrite, measureCapacityDomain } from '@taucad/filesystem';
import type { CapacityMeasurement } from '@taucad/filesystem';
import type { DatabaseSync } from 'node:sqlite';
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
/** Bytes written between capacity measurements before the domain is re-measured (lane 17: "at bind and on pressure"). */
const measurementPressureBytes = 64 * 1024 * 1024;
/** Records one `collect` slice deletes between budget checks. */
const collectChunk = 256;

const asGeneration = (value: number): ComputeGeneration => value as ComputeGeneration;

/**
 * Hot-path SQL, exported so a conformance cell can assert with
 * `EXPLAIN QUERY PLAN` that none of it scans a table (U13, I11).
 * @internal
 */
export const _hotPathSql = {
  getRecord:
    'SELECT r.content_digest, r.media_type, r.determinism, r.action, c.bytes, c.byte_length ' +
    'FROM record r JOIN content c ON c.content_digest = r.content_digest ' +
    'WHERE r.action_digest = ? AND r.generation = ?',
  getPoison: 'SELECT 1 FROM poison WHERE action_digest = ?',
  getDiscovery: 'SELECT action_digest AS digest FROM discovery WHERE context = ? LIMIT ?',
  retainedContentProbe: 'SELECT 1 FROM retained_content WHERE content_digest = ? LIMIT 1',
  putRecordProbe: 'SELECT content_digest, byte_length FROM record WHERE action_digest = ?',
  putRoot: 'SELECT 1 FROM root WHERE action_digest = ? LIMIT 1',
} as const;

/** Recursive only over one touched root's explicit payload closure. @internal */
export const _closureContentSql =
  'WITH RECURSIVE retained(action_digest) AS (' +
  'SELECT ? UNION ' +
  'SELECT r.action_digest FROM retained p JOIN dependency d ON d.action_digest = p.action_digest JOIN record r ON r.content_digest = d.content_digest' +
  ') SELECT c.content_digest AS digest, c.byte_length AS bytes FROM content c WHERE c.content_digest IN (' +
  'SELECT r.content_digest FROM retained p JOIN record r ON r.action_digest = p.action_digest UNION ' +
  'SELECT d.content_digest FROM retained p JOIN dependency d ON d.action_digest = p.action_digest)';

const schema = [
  'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS content (content_digest TEXT PRIMARY KEY, bytes BLOB NOT NULL, byte_length INTEGER NOT NULL, refs INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS record (action_digest TEXT PRIMARY KEY, content_digest TEXT NOT NULL, media_type TEXT NOT NULL, determinism TEXT NOT NULL, action TEXT NOT NULL, generation INTEGER NOT NULL, byte_length INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS record_generation ON record (generation)',
  'CREATE INDEX IF NOT EXISTS record_content ON record (content_digest)',
  'CREATE TABLE IF NOT EXISTS poison (action_digest TEXT PRIMARY KEY)',
  'CREATE TABLE IF NOT EXISTS root (retention TEXT NOT NULL, action_digest TEXT NOT NULL, PRIMARY KEY (retention, action_digest))',
  'CREATE INDEX IF NOT EXISTS root_action ON root (action_digest)',
  'CREATE TABLE IF NOT EXISTS retained_content (retention TEXT NOT NULL, root_action TEXT NOT NULL, content_digest TEXT NOT NULL, PRIMARY KEY (retention, root_action, content_digest))',
  'CREATE INDEX IF NOT EXISTS retained_content_digest ON retained_content (content_digest)',
  'CREATE INDEX IF NOT EXISTS retained_content_root ON retained_content (root_action)',
  // D28/I21: only explicit payload references form mandatory storage closure.
  // Semantic `action` ancestry is deliberately not recorded here, so evicting an
  // optional ancestor never makes a self-contained result incomplete.
  'CREATE TABLE IF NOT EXISTS dependency (action_digest TEXT NOT NULL, content_digest TEXT NOT NULL, PRIMARY KEY (action_digest, content_digest))',
  'CREATE TABLE IF NOT EXISTS discovery (context TEXT NOT NULL, action_digest TEXT NOT NULL, PRIMARY KEY (context, action_digest))',
] as const;

/**
 * The store directory must be host state, never a project tree.
 *
 * A `.tau` segment is the tree-local family — `.tau/cache`, `.tau/workspaces`,
 * `.tau/revisions` — that D9/I4 place the store outside of. The host's own
 * state-directory resolver produces the right location; this only refuses the
 * wrong one loudly instead of silently seeding cache bytes into a revision.
 */
const assertHostStateDirectory = (directory: string): void => {
  if (!(directory.startsWith('/') || /^[A-Za-z]:[/\\]/.test(directory))) {
    throw new TypeError('Compute store directory must be an absolute host path.');
  }
  if (directory.split(/[/\\]/).includes('.tau')) {
    throw new TypeError(
      'Compute store directory must live outside every revision root: resolve the host state directory instead of a .tau path.',
    );
  }
};

type Counters = { entries: number; logicalBytes: number; pinnedBytes: number; generation: number };

const readCounters = (db: DatabaseSync): Counters => {
  const rows = db.prepare('SELECT key, value FROM meta').all() as Array<{ key: string; value: number }>;
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return {
    entries: map.get('entries') ?? 0,
    logicalBytes: map.get('logical_bytes') ?? 0,
    pinnedBytes: map.get('pinned_bytes') ?? 0,
    generation: map.get('generation') ?? 1,
  };
};

const writeCounters = (db: DatabaseSync, counters: Counters): void => {
  const statement = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
  const write = (key: string, value: number): void => {
    statement.run(key, value, value);
  };
  write('entries', counters.entries);
  write('logical_bytes', counters.logicalBytes);
  write('pinned_bytes', counters.pinnedBytes);
  write('generation', counters.generation);
};

const closureContent = (db: DatabaseSync, actionDigest: string): Array<{ digest: string; bytes: number }> =>
  db.prepare(_closureContentSql).all(actionDigest) as Array<{ digest: string; bytes: number }>;

const addRoot = (store: Store, retention: string, actionDigest: string): void => {
  store.db.prepare('INSERT OR IGNORE INTO root (retention, action_digest) VALUES (?, ?)').run(retention, actionDigest);
  const occupied = store.db.prepare(_hotPathSql.retainedContentProbe);
  const insert = store.db.prepare(
    'INSERT OR IGNORE INTO retained_content (retention, root_action, content_digest) VALUES (?, ?, ?)',
  );
  for (const content of closureContent(store.db, actionDigest)) {
    const wasPinned = occupied.get(content.digest) !== undefined;
    const result = insert.run(retention, actionDigest, content.digest);
    if (result.changes > 0 && !wasPinned) {
      store.counters.pinnedBytes += content.bytes;
    }
  }
};

const removeMemberships = (store: Store, column: 'retention' | 'root_action', value: string): void => {
  const rows = store.db
    .prepare(`SELECT DISTINCT content_digest AS digest FROM retained_content WHERE ${column} = ?`)
    .all(value) as Array<{ digest: string }>;
  store.db.prepare(`DELETE FROM retained_content WHERE ${column} = ?`).run(value);
  const occupied = store.db.prepare(_hotPathSql.retainedContentProbe);
  const content = store.db.prepare('SELECT byte_length AS bytes FROM content WHERE content_digest = ?');
  for (const { digest } of rows) {
    if (occupied.get(digest) === undefined) {
      store.counters.pinnedBytes -= (content.get(digest) as { bytes: number } | undefined)?.bytes ?? 0;
    }
  }
};

/** One open database and the counters maintained beside it. */
type Store = {
  readonly db: DatabaseSync;
  readonly file: string;
  counters: Counters;
  measurement: CapacityMeasurement | undefined;
  writtenSinceMeasure: number;
  sessions: number;
};

/** A native SQLite engine plus its authority control facet. @public */
export type SqliteComputeEngine = {
  readonly engine: ComputeStoreEngine;
  /** Authority-side operations. Never a member of a kernel's compute scope (U25). */
  readonly control: (input: { readonly workspace: string }) => Promise<ComputeStoreControl>;
  /** Close every open database. */
  readonly dispose: () => Promise<void>;
};

/** Options for {@link createSqliteComputeEngine}. @public */
export type SqliteComputeEngineOptions = {
  /**
   * Absolute host state directory, produced by the host's own state-directory
   * resolver. Must be outside every revision root, worktree and slot.
   */
  readonly directory: string;
  /** Total retained payload bytes this store may hold. Defaults to 1 GiB. */
  readonly logicalQuota?: number;
  /** Largest single entry. Defaults to 256 MiB. */
  readonly maxEntryBytes?: number;
  /**
   * Bytes kept free for revision writes in the store's capacity domain. Passed
   * through to `admitCapacityWrite`; omit for its measured default.
   */
  readonly reserveBytes?: number;
};

/**
 * Create the native workspace compute store engine.
 *
 * @param options - Host state directory and store-local logical bounds.
 * @returns The engine, its authority control facet and a disposer.
 * @public
 *
 * @example <caption>Bind a durable store at the host authority</caption>
 * ```typescript
 * import { createSqliteComputeEngine } from '@taucad/runtime/node';
 *
 * const store = createSqliteComputeEngine({ directory: '/Users/me/Library/Application Support/tau/compute' });
 * const control = await store.control({ workspace: 'node:/Users/me/project' });
 * ```
 */
export const createSqliteComputeEngine = (options: SqliteComputeEngineOptions): SqliteComputeEngine => {
  assertHostStateDirectory(options.directory);
  const logicalQuota = options.logicalQuota ?? defaultLogicalQuota;
  const maxEntryBytes = options.maxEntryBytes ?? defaultMaxEntryBytes;
  const stores = new Map<string, Store>();
  /**
   * Serializes every database operation of this engine. `node:sqlite` is
   * synchronous, so the queue bounds how much of it runs back to back; it does
   * not move the work off this thread. A host whose filesystem/control plane
   * shares the thread composes the engine on its own store worker (D7).
   */
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

  const openStore = async (workspace: string): Promise<Store> => {
    const existing = stores.get(workspace);
    if (existing) {
      return existing;
    }
    const [sqlite, { mkdir }, nodePath] = await Promise.all([
      import('node:sqlite'),
      import('node:fs/promises'),
      import('node:path'),
    ]);
    await mkdir(options.directory, { recursive: true });
    const file = nodePath.join(options.directory, `${await opaqueWorkspaceName(workspace)}.sqlite`);
    const db = new sqlite.DatabaseSync(file);
    // Measured connection settings (D7). WAL lets a reader run while a writer
    // commits; `busy_timeout` is what makes two processes on one file wait
    // instead of failing; `synchronous` is raised to FULL only for the required
    // barrier, so disposable commits do not pay an fsync each.
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA auto_vacuum = INCREMENTAL');
    for (const statement of schema) {
      db.exec(statement);
    }
    const counters = readCounters(db);
    writeCounters(db, counters);
    const store: Store = {
      db,
      file,
      counters,
      measurement: await measureCapacityDomain({ kind: 'volume', path: options.directory }),
      writtenSinceMeasure: 0,
      sessions: 0,
    };
    stores.set(workspace, store);
    return store;
  };

  /**
   * Admit a batch against the physical capacity domain.
   *
   * The measurement is taken at bind and refreshed on pressure rather than on
   * every put, and the bytes written since then are subtracted so the decision
   * stays conservative between measurements.
   */
  const admit = async (
    store: Store,
    bytes: number,
  ): Promise<'admit' | 'refuse-unmeasured' | { readonly evict: number }> => {
    if (store.measurement === undefined || store.writtenSinceMeasure >= measurementPressureBytes) {
      store.measurement = await measureCapacityDomain({ kind: 'volume', path: options.directory });
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

  /** Reclaim unleased entries up to `target` bytes. Rooted data is never a candidate (D26). */
  const evictUnleased = (store: Store, target: number): number => {
    const rows = store.db
      .prepare(
        'SELECT r.action_digest AS actionDigest, r.byte_length AS byteLength FROM record r ' +
          'WHERE NOT EXISTS (SELECT 1 FROM retained_content p WHERE p.content_digest = r.content_digest) LIMIT ?',
      )
      .all(collectChunk) as Array<{ actionDigest: string; byteLength: number }>;
    let reclaimed = 0;
    for (const row of rows) {
      if (reclaimed >= target) {
        break;
      }
      reclaimed += deleteRecord(store, row.actionDigest);
    }
    writeCounters(store.db, store.counters);
    return reclaimed;
  };

  /** Delete one record, drop its unreferenced payload, and maintain the counters. */
  const deleteRecord = (store: Store, actionDigest: string): number => {
    const row = store.db
      .prepare(
        'SELECT content_digest AS contentDigest, byte_length AS byteLength, generation FROM record WHERE action_digest = ?',
      )
      .get(actionDigest) as { contentDigest: string; byteLength: number; generation: number } | undefined;
    if (!row) {
      return 0;
    }
    store.db.prepare('DELETE FROM record WHERE action_digest = ?').run(actionDigest);
    store.db.prepare('DELETE FROM discovery WHERE action_digest = ?').run(actionDigest);
    const dependencies = store.db
      .prepare('SELECT content_digest AS digest FROM dependency WHERE action_digest = ?')
      .all(actionDigest) as Array<{ digest: string }>;
    store.db.prepare('DELETE FROM dependency WHERE action_digest = ?').run(actionDigest);
    store.db.prepare('UPDATE content SET refs = refs - 1 WHERE content_digest = ?').run(row.contentDigest);
    store.db.prepare('DELETE FROM content WHERE content_digest = ? AND refs <= 0').run(row.contentDigest);
    for (const { digest } of dependencies) {
      store.db.prepare('UPDATE content SET refs = refs - 1 WHERE content_digest = ?').run(digest);
      store.db.prepare('DELETE FROM content WHERE content_digest = ? AND refs <= 0').run(digest);
    }
    // A fenced record left over from an earlier generation was already removed
    // from the counters by `clear`; subtracting again would drive them negative.
    if (row.generation === store.counters.generation) {
      store.counters.entries -= 1;
      store.counters.logicalBytes -= row.byteLength;
    }
    return row.byteLength;
  };

  const open = async (input: {
    readonly workspace: string;
    readonly signal?: AbortSignal;
  }): Promise<ComputeStoreSession> => {
    input.signal?.throwIfAborted();
    const store = await serialize(async () => openStore(input.workspace));
    store.counters = readCounters(store.db);
    store.sessions += 1;
    const opened = asGeneration(store.counters.generation);
    let closed = false;
    const assertOpen = (): void => {
      if (closed) {
        throw new Error('This compute store session is closed.');
      }
    };

    return {
      generation: opened,
      durable: true,
      get: async (request: ComputeGetInput): Promise<ComputeGetResult> => {
        assertOpen();
        request.signal?.throwIfAborted();
        validateComputeGetInput(request);
        return serialize((): ComputeGetResult => {
          store.counters = readCounters(store.db);
          if (request.generation !== store.counters.generation) {
            return { status: 'stale-generation', generation: asGeneration(store.counters.generation) };
          }
          const resident = new Set(request.resident ?? []);
          const poisonStatement = store.db.prepare(_hotPathSql.getPoison);
          const recordStatement = store.db.prepare(_hotPathSql.getRecord);
          const entries: ComputeStoreEntry[] = [];
          const omitted: Array<{ digest: ActionDigest; reason: 'missing' | 'poisoned' | 'budget' }> = [];
          let bytes = 0;
          const candidates = request.discovery
            ? (
                store.db
                  .prepare(_hotPathSql.getDiscovery)
                  .all(computeDiscoveryKey(request.discovery), maximumDiscoveryCandidates) as Array<{
                  digest: ActionDigest;
                }>
              ).map(({ digest }) => digest)
            : [];
          for (const digest of new Set([...request.digests, ...candidates])) {
            if (resident.has(digest)) {
              continue;
            }
            if (poisonStatement.get(digest) !== undefined) {
              omitted.push({ digest, reason: 'poisoned' });
              continue;
            }
            const row = recordStatement.get(digest, store.counters.generation) as
              | {
                  content_digest: string;
                  media_type: string;
                  determinism: string;
                  action: string;
                  bytes: Uint8Array<ArrayBuffer>;
                  byte_length: number;
                }
              | undefined;
            if (!row) {
              omitted.push({ digest, reason: 'missing' });
              continue;
            }
            const missingDependency = store.db
              .prepare(
                'SELECT 1 FROM dependency d LEFT JOIN content c ON c.content_digest = d.content_digest WHERE d.action_digest = ? AND c.content_digest IS NULL LIMIT 1',
              )
              .get(digest);
            if (missingDependency !== undefined) {
              omitted.push({ digest, reason: 'missing' });
              continue;
            }
            if (entries.length >= request.maxEntries || bytes + row.byte_length > request.maxBytes) {
              omitted.push({ digest, reason: 'budget' });
              continue;
            }
            entries.push({
              action: JSON.parse(row.action) as ComputeAction,
              actionDigest: digest,
              // oxlint-disable-next-line typescript-eslint/consistent-type-assertions -- the column is the stored content digest.
              contentDigest: row.content_digest as ComputeStoreEntry['contentDigest'],
              mediaType: row.media_type,
              bytes: new Uint8Array(row.bytes),
              requiredContent: (
                store.db
                  .prepare('SELECT content_digest AS digest FROM dependency WHERE action_digest = ?')
                  .all(digest) as Array<{ digest: ComputeStoreEntry['contentDigest'] }>
              ).map(({ digest: dependency }) => dependency),
              determinism: row.determinism === 'equivalent' ? 'equivalent' : 'byte-exact',
            });
            bytes += row.byte_length;
          }
          return { status: 'ok', entries, omitted };
        });
      },

      put: async (request: ComputePutInput): Promise<ComputePutResult> => {
        assertOpen();
        request.signal?.throwIfAborted();
        validateComputePutInput(request);
        if (request.durability === 'required' && request.retention === undefined) {
          return { status: 'unavailable', reason: 'Required durability needs an authorized retention owner.' };
        }
        // Reject oversized records before I/O; quota itself is decided from
        // transaction-authoritative incremental bytes below.
        if (request.entries.some((entry) => entry.bytes.byteLength > maxEntryBytes)) {
          return { status: 'quota', logicalBytes: store.counters.logicalBytes, logicalQuota };
        }
        const records: ValidatedComputeEntry[] = [];
        for (const entry of request.entries) {
          // oxlint-disable-next-line no-await-in-loop -- validation order is the batch's order.
          const valid = await validateComputeEntry(entry);
          if (valid) {
            records.push(valid);
          }
        }
        request.signal?.throwIfAborted();
        const validated = normalizeValidatedComputeEntries(records);
        const divergent = divergentComputeActions(validated);
        const poisonedBatchActions = new Set<ActionDigest>();
        for (const digest of divergent) {
          if (validated.some(({ entry }) => entry.actionDigest === digest && entry.determinism === 'byte-exact')) {
            poisonedBatchActions.add(digest);
          }
        }

        return serialize(async (): Promise<ComputePutResult> => {
          store.counters = readCounters(store.db);
          if (request.generation !== store.counters.generation) {
            return { status: 'stale-generation', generation: asGeneration(store.counters.generation) };
          }
          // Physical admission (lane 17 recipe): evict unleased entries up to
          // the shortfall and retry once; a second refusal skips caching and
          // lets the primary result stand.
          const incrementalBytes = validated.reduce(
            (total, { entry }) =>
              total +
              (store.db.prepare('SELECT 1 FROM record WHERE action_digest = ?').get(entry.actionDigest) === undefined
                ? entry.bytes.byteLength
                : 0),
            0,
          );
          if (store.counters.logicalBytes + incrementalBytes > logicalQuota) {
            return { status: 'quota', logicalBytes: store.counters.logicalBytes, logicalQuota };
          }
          let decision = await admit(store, incrementalBytes);
          if (typeof decision === 'object') {
            store.db.exec('BEGIN IMMEDIATE');
            try {
              evictUnleased(store, decision.evict);
              store.db.exec('COMMIT');
            } catch (error) {
              store.db.exec('ROLLBACK');
              throw error;
            }
            store.measurement = undefined;
            store.counters = readCounters(store.db);
            decision = await admit(store, incrementalBytes);
          }
          if (typeof decision === 'object') {
            return { status: 'quota', logicalBytes: store.counters.logicalBytes, logicalQuota };
          }
          if (decision === 'refuse-unmeasured') {
            return { status: 'unavailable', reason: 'Capacity domain is unmeasurable; caching is skipped.' };
          }

          const required = request.durability === 'required';
          if (required) {
            store.db.exec('PRAGMA synchronous = FULL');
          }
          const published: ActionDigest[] = [];
          const inserted = new Set<ActionDigest>();
          const conflicts: Array<{ digest: ActionDigest; outcome: 'poisoned' | 'first-writer-retained' }> = [];
          const before = { ...store.counters };
          store.db.exec('BEGIN IMMEDIATE');
          try {
            store.counters = readCounters(store.db);
            if (request.generation !== store.counters.generation) {
              store.db.exec('ROLLBACK');
              return { status: 'stale-generation', generation: asGeneration(store.counters.generation) };
            }
            const contentProbe = store.db.prepare('SELECT 1 FROM content WHERE content_digest = ?');
            const poisonProbe = store.db.prepare(_hotPathSql.getPoison);
            const recordProbe = store.db.prepare(_hotPathSql.putRecordProbe);
            for (const digest of poisonedBatchActions) {
              removeMemberships(store, 'root_action', digest);
              deleteRecord(store, digest);
              store.db.prepare('INSERT OR IGNORE INTO poison (action_digest) VALUES (?)').run(digest);
              store.db.prepare('DELETE FROM root WHERE action_digest = ?').run(digest);
              conflicts.push({ digest, outcome: 'poisoned' });
            }
            const candidates = validated.filter(({ entry }) => {
              if (poisonedBatchActions.has(entry.actionDigest)) {
                return false;
              }
              if (poisonProbe.get(entry.actionDigest) !== undefined) {
                return false;
              }
              const existing = recordProbe.get(entry.actionDigest) as { content_digest: string } | undefined;
              return existing === undefined || existing.content_digest === entry.contentDigest;
            });
            const publishable: ValidatedComputeEntry[] = [];
            const produced = new Set<ComputeStoreEntry['contentDigest']>();
            const accepted = new Set<ActionDigest>();
            let changed = true;
            while (changed) {
              changed = false;
              for (const candidate of candidates) {
                if (
                  !accepted.has(candidate.entry.actionDigest) &&
                  candidate.dependencies.every(
                    (dependency) => produced.has(dependency) || contentProbe.get(dependency) !== undefined,
                  )
                ) {
                  publishable.push(candidate);
                  accepted.add(candidate.entry.actionDigest);
                  produced.add(candidate.entry.contentDigest);
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
              if (
                dependencies.some(
                  (dependency) => !candidateContent.has(dependency) && contentProbe.get(dependency) === undefined,
                )
              ) {
                continue;
              }
              if (poisonProbe.get(entry.actionDigest) !== undefined) {
                conflicts.push({ digest: entry.actionDigest, outcome: 'poisoned' });
                continue;
              }
              const existing = recordProbe.get(entry.actionDigest) as
                | { content_digest: string; byte_length: number }
                | undefined;
              if (existing && existing.content_digest !== entry.contentDigest) {
                // I6: publish-once is never last-writer-wins.
                if (entry.determinism === 'equivalent') {
                  conflicts.push({ digest: entry.actionDigest, outcome: 'first-writer-retained' });
                  continue;
                }
                removeMemberships(store, 'root_action', entry.actionDigest);
                deleteRecord(store, entry.actionDigest);
                store.db.prepare('INSERT OR IGNORE INTO poison (action_digest) VALUES (?)').run(entry.actionDigest);
                store.db.prepare('DELETE FROM root WHERE action_digest = ?').run(entry.actionDigest);
                conflicts.push({ digest: entry.actionDigest, outcome: 'poisoned' });
                continue;
              }
              if (!existing) {
                inserted.add(entry.actionDigest);
                // Deduplicate identical bytes, not merely equal action names.
                const content = store.db
                  .prepare('SELECT refs FROM content WHERE content_digest = ?')
                  .get(entry.contentDigest) as { refs: number } | undefined;
                if (content) {
                  store.db
                    .prepare('UPDATE content SET refs = refs + 1 WHERE content_digest = ?')
                    .run(entry.contentDigest);
                } else {
                  store.db
                    .prepare('INSERT INTO content (content_digest, bytes, byte_length, refs) VALUES (?, ?, ?, 1)')
                    .run(entry.contentDigest, entry.bytes, entry.bytes.byteLength);
                }
                store.db
                  .prepare(
                    'INSERT INTO record (action_digest, content_digest, media_type, determinism, action, generation, byte_length) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  )
                  .run(
                    entry.actionDigest,
                    entry.contentDigest,
                    entry.mediaType,
                    entry.determinism,
                    canonicalizeComputeAction(entry.action),
                    store.counters.generation,
                    entry.bytes.byteLength,
                  );
                const dependencyStatement = store.db.prepare(
                  'INSERT OR IGNORE INTO dependency (action_digest, content_digest) VALUES (?, ?)',
                );
                for (const dependency of dependencies) {
                  dependencyStatement.run(entry.actionDigest, dependency);
                }
                store.counters.entries += 1;
                store.counters.logicalBytes += entry.bytes.byteLength;
              }
              if (request.discovery) {
                store.db
                  .prepare('INSERT OR IGNORE INTO discovery (context, action_digest) VALUES (?, ?)')
                  .run(computeDiscoveryKey(request.discovery), entry.actionDigest);
              }
              published.push(entry.actionDigest);
            }
            for (const { entry, dependencies } of validated) {
              if (!inserted.has(entry.actionDigest)) {
                continue;
              }
              for (const dependency of dependencies) {
                store.db.prepare('UPDATE content SET refs = refs + 1 WHERE content_digest = ?').run(dependency);
              }
            }
            if (required && request.retention !== undefined) {
              for (const digest of published) {
                addRoot(store, request.retention.name, digest);
              }
            }
            writeCounters(store.db, store.counters);
            store.db.exec('COMMIT');
          } catch (error) {
            store.db.exec('ROLLBACK');
            store.counters = before;
            if (required) {
              store.db.exec('PRAGMA synchronous = NORMAL');
            }
            return { status: 'unavailable', reason: String(error) };
          }
          if (required) {
            // The barrier a required acknowledgement rests on: the commit was
            // fsynced, and the WAL frames are folded back into the database.
            store.db.exec('PRAGMA wal_checkpoint(FULL)');
            store.db.exec('PRAGMA synchronous = NORMAL');
          }
          store.writtenSinceMeasure += incrementalBytes;
          // The honest entries of a conflicting batch still commit (U23, I6).
          return { status: 'committed', published, conflicts };
        });
      },

      pin: async (request: ComputePinInput): Promise<ComputePinResult> => {
        assertOpen();
        request.signal?.throwIfAborted();
        return serialize((): ComputePinResult => {
          store.counters = readCounters(store.db);
          if (request.generation !== store.counters.generation) {
            return { status: 'stale-generation', generation: asGeneration(store.counters.generation) };
          }
          const probe = store.db.prepare(
            'SELECT byte_length AS byteLength FROM record WHERE action_digest = ? AND generation = ?',
          );
          const missing: ActionDigest[] = [];
          const found: Array<{ digest: ActionDigest; byteLength: number }> = [];
          for (const digest of request.digests) {
            const row = probe.get(digest, store.counters.generation) as { byteLength: number } | undefined;
            if (row) {
              found.push({ digest, byteLength: row.byteLength });
            } else {
              missing.push(digest);
            }
          }
          if (missing.length > 0) {
            return { status: 'missing', digests: missing };
          }
          store.db.exec('PRAGMA synchronous = FULL');
          store.db.exec('BEGIN IMMEDIATE');
          try {
            store.counters = readCounters(store.db);
            for (const { digest, byteLength } of found) {
              addRoot(store, request.retention.name, digest);
              void byteLength;
            }
            writeCounters(store.db, store.counters);
            store.db.exec('COMMIT');
          } catch (error) {
            store.db.exec('ROLLBACK');
            store.db.exec('PRAGMA synchronous = NORMAL');
            throw error;
          }
          store.db.exec('PRAGMA wal_checkpoint(FULL)');
          store.db.exec('PRAGMA synchronous = NORMAL');
          return { status: 'pinned', pinned: found.map(({ digest }) => digest) };
        });
      },

      release: async (request: ComputeReleaseInput): Promise<{ readonly status: 'released' }> => {
        request.signal?.throwIfAborted();
        return serialize(() => {
          store.db.exec('BEGIN IMMEDIATE');
          try {
            store.counters = readCounters(store.db);
            removeMemberships(store, 'retention', request.retention.name);
            store.db.prepare('DELETE FROM root WHERE retention = ?').run(request.retention.name);
            writeCounters(store.db, store.counters);
            store.db.exec('COMMIT');
          } catch (error) {
            store.db.exec('ROLLBACK');
            throw error;
          }
          return { status: 'released' };
        });
      },

      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        await serialize(() => {
          store.sessions -= 1;
        });
      },
    };
  };

  const control = async (input: { readonly workspace: string }): Promise<ComputeStoreControl> => {
    const store = await serialize(async () => openStore(input.workspace));
    return {
      inspect: async ({ signal }): Promise<ComputeStoreReport> => {
        signal?.throwIfAborted();
        return serialize(async () => {
          store.counters = readCounters(store.db);
          // Maintained counters only: no reachability recomputation, no walk (I11, U21).
          const { stat } = await import('node:fs/promises');
          let physical = 0;
          for (const suffix of ['', '-wal', '-shm']) {
            try {
              // oxlint-disable-next-line no-await-in-loop -- three fixed sidecars; ordering keeps the sum simple.
              const sidecar = await stat(`${store.file}${suffix}`);
              physical += sidecar.size;
            } catch {
              // A missing WAL/SHM sidecar contributes nothing.
            }
          }
          return {
            entries: store.counters.entries,
            logicalBytes: store.counters.logicalBytes,
            pinnedBytes: store.counters.pinnedBytes,
            pendingBytes: 0,
            generation: asGeneration(store.counters.generation),
            physicalBytes: { status: 'known', bytes: physical },
          };
        });
      },

      clear: async ({ signal }) => {
        signal?.throwIfAborted();
        return serialize(() => {
          store.db.exec('BEGIN IMMEDIATE');
          try {
            store.counters = readCounters(store.db);
            const next = store.counters.generation + 1;
            // D26: required roots and their data survive the clear and stay
            // reusable; everything else is fenced immediately and reclaimed
            // asynchronously by `collect`.
            store.db
              .prepare(
                'WITH RECURSIVE retained(action_digest) AS (' +
                  'SELECT action_digest FROM root UNION ' +
                  'SELECT r.action_digest FROM retained p JOIN dependency d ON d.action_digest = p.action_digest JOIN record r ON r.content_digest = d.content_digest' +
                  ') UPDATE record SET generation = ? WHERE action_digest IN (SELECT action_digest FROM retained)',
              )
              .run(next);
            store.db.exec('DELETE FROM poison');
            store.db.exec('DELETE FROM discovery');
            const retained = store.db
              .prepare(
                'SELECT COUNT(*) AS entries, COALESCE(SUM(byte_length), 0) AS bytes FROM record WHERE generation = ?',
              )
              .get(next) as { entries: number; bytes: number };
            store.counters = {
              generation: next,
              entries: retained.entries,
              logicalBytes: retained.bytes,
              pinnedBytes: store.counters.pinnedBytes,
            };
            writeCounters(store.db, store.counters);
            store.db.exec('COMMIT');
            return { status: 'cleared', generation: asGeneration(next), retained: retained.bytes } as const;
          } catch (error) {
            store.db.exec('ROLLBACK');
            throw error;
          }
        });
      },

      collect: async ({ budget, cursor, signal }) => {
        signal?.throwIfAborted();
        return serialize(async () => {
          store.counters = readCounters(store.db);
          const deadline = Date.now() + budget;
          let position = cursor ?? '';
          let reclaimed = 0;
          const select = store.db.prepare(
            'SELECT action_digest AS actionDigest FROM record WHERE generation < ? AND action_digest > ? ORDER BY action_digest LIMIT ?',
          );
          for (;;) {
            const rows = select.all(store.counters.generation, position, collectChunk) as Array<{
              actionDigest: string;
            }>;
            if (rows.length === 0) {
              // Physical reclamation is maintenance, never part of a put (U25).
              store.db.exec('PRAGMA incremental_vacuum');
              writeCounters(store.db, store.counters);
              return { status: 'complete', reclaimed } as const;
            }
            store.db.exec('BEGIN IMMEDIATE');
            try {
              for (const row of rows) {
                // A record rooted during this pass carries the live generation
                // and is therefore never a candidate: the write barrier is the
                // generation stamp itself, checked inside the sweep transaction.
                reclaimed += deleteRecord(store, row.actionDigest);
                position = row.actionDigest;
              }
              writeCounters(store.db, store.counters);
              store.db.exec('COMMIT');
            } catch (error) {
              store.db.exec('ROLLBACK');
              throw error;
            }
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
 * Mint an opaque durable store spec backed by native SQLite.
 *
 * The spec carries no path, handle or port: it is a same-realm brand the
 * runtime resolves to this engine, so a `durable` binding can cross a
 * composition boundary without a filesystem location travelling with it.
 *
 * @param input - The engine and the workspace key this spec addresses.
 * @returns The opaque spec to place in `{ mode: 'durable', store }`.
 * @public
 *
 * @example <caption>Compose a durable binding</caption>
 * ```typescript
 * import { createSqliteComputeEngine, fromSqlite } from '@taucad/runtime/node';
 *
 * const store = createSqliteComputeEngine({ directory: '/var/lib/tau/compute' });
 * const binding = { mode: 'durable', store: fromSqlite({ store, workspace: 'node:/srv/project' }) } as const;
 * ```
 */
export const fromSqlite = (input: {
  readonly store: SqliteComputeEngine;
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
