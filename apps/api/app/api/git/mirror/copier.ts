import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { repositoryLocator } from '#api/git/store/locator.js';
import { indexKeyFor, isTombstoned } from '#api/git/store/manifest.js';
import type { Manifest } from '#api/git/store/manifest.js';
import type { RepositoryLocator } from '#api/git/store/port.js';
import type { DestinationVersion, MirrorDestination } from '#api/git/mirror/destination.js';
import { MirrorFailure, failAt } from '#api/git/mirror/failure.js';
import {
  lfsKey,
  lfsPrefix,
  ownerMarkerKey,
  ownerMarkerPrefix,
  repositoryKey,
  repositoryPrefix,
  snapshotKey,
} from '#api/git/mirror/keys.js';
import type { MirrorMetrics, MirrorObjectKind } from '#api/git/mirror/metrics.js';
import { readWhole } from '#api/git/mirror/source.js';
import type { MirrorSource } from '#api/git/mirror/source.js';
import { packNameHash, transferObject } from '#api/git/mirror/transfer.js';
import type { Verification } from '#api/git/mirror/transfer.js';
import type { CopyCandidate, MirrorLedger, TombstonedOwner } from '#api/git/mirror/watermark.js';

/**
 * DM1, the generation-driven key copier (W13 B1–B6, Finding 2): one copy round
 * for one repository, the owner markers, and the shared retention step.
 *
 * A round copies the store's **current** generation, whatever the row says, so
 * a burst of pushes inside one poll becomes one snapshot and a stale row never
 * causes a stale snapshot, only a late one. Its order is the whole of its
 * safety:
 *
 * 1. read `manifest.json` from R2 (generation G);
 * 2. copy every pack, index and push-log segment G names that the copy lacks,
 *    each verified before and after the write;
 * 3. copy the project's LFS objects finalized at or before G's commit;
 * 4. write `manifests/<G>-<incarnation>.json` **last**, so no snapshot is ever
 *    visible before everything it names;
 * 5. keep the snapshot and every dependency locked (rolling retention, B6);
 * 6. only then advance `copied_generation` and record the snapshot's SHA-256.
 *
 * A crash anywhere leaves the watermark where it was, and the next round finds
 * what landed by version listing and finishes. Nothing here hides or deletes.
 */

const dayMilliseconds = 24 * 60 * 60 * 1000;

export type CopierContext = {
  readonly source: MirrorSource;
  readonly destination: MirrorDestination;
  readonly ledger: MirrorLedger;
  readonly metrics: MirrorMetrics;
  readonly now?: () => Date;
  /** Compliance retention given to every version and every extension (W13 B8: 30 days). */
  readonly retentionDays?: number;
  /** Extend when the earliest lock has fewer days than this left (W13 B6: 20). */
  readonly extendBelowDays?: number;
  /** Objects up to this many bytes are read once and held; larger ones are streamed twice. */
  readonly bufferLimit?: number;
  /** LFS rows read per batch. */
  readonly lfsBatch?: number;
  readonly report?: (event: Readonly<Record<string, unknown>>) => void;
  readonly signal?: AbortSignal;
};

export type RoundResult =
  | {
      readonly outcome: 'copied' | 'tombstoned';
      readonly generation: number;
      readonly objects: number;
    }
  | { readonly outcome: 'noop'; readonly generation: number | undefined }
  | { readonly outcome: 'failed'; readonly failure: MirrorFailure };

/** The retention clock of one pass: what every new version and extension is locked until. */
export type RetentionClock = {
  readonly at: Date;
  readonly until: Date;
  readonly floor: Date;
};

export const retentionClock = (context: CopierContext): RetentionClock => {
  const at = (context.now ?? (() => new Date()))();
  return {
    at,
    until: new Date(at.getTime() + (context.retentionDays ?? 30) * dayMilliseconds),
    floor: new Date(at.getTime() + (context.extendBelowDays ?? 20) * dayMilliseconds),
  };
};

/** The copy's versions under one prefix, by key, with hide markers counted apart. */
export type VersionIndex = {
  readonly versions: Map<string, DestinationVersion[]>;
  readonly hidden: number;
};

/** Discovers what the copy holds by **version** listing, never by name (W13 Finding 3). */
export const indexVersions = async (
  destination: MirrorDestination,
  prefix: string,
  signal?: AbortSignal,
): Promise<VersionIndex> => {
  const versions = new Map<string, DestinationVersion[]>();
  let hidden = 0;
  try {
    for await (const version of destination.listVersions(prefix, signal)) {
      if (version.isHideMarker) {
        hidden += 1;
        continue;
      }
      const list = versions.get(version.key) ?? [];
      list.push(version);
      versions.set(version.key, list);
    }
  } catch (error) {
    throw failAt('dest_write', error);
  }
  return { versions, hidden };
};

/** Whether the copy holds a version of `key`, of `bytes` when the length is known. */
const holds = (index: VersionIndex, key: string, bytes?: number): boolean =>
  (index.versions.get(key) ?? []).some((version) => bytes === undefined || version.bytes === bytes);

const sha256Hex = (bytes: Uint8Array<ArrayBuffer>): string => createHash('sha256').update(bytes).digest('hex');

const fromBytes = (bytes: Uint8Array<ArrayBuffer>) => async (): Promise<Readable> =>
  Readable.from([Buffer.from(bytes)]);

type RoundState = {
  readonly context: CopierContext;
  readonly locator: RepositoryLocator;
  readonly clock: RetentionClock;
  /** Version ids this round wrote, already locked until `clock.until`. */
  readonly written: Map<string, string>;
  objects: number;
};

const copyOne = async (
  state: RoundState,
  args: {
    key: string;
    kind: MirrorObjectKind;
    open: () => Promise<Readable>;
    verification: Verification;
    expectedBytes?: number;
  },
): Promise<void> => {
  const { context } = state;
  const copied = await transferObject({
    destination: context.destination,
    key: args.key,
    open: args.open,
    verification: args.verification,
    ...(args.expectedBytes === undefined ? {} : { expectedBytes: args.expectedBytes }),
    retainUntil: state.clock.until,
    ...(context.bufferLimit === undefined ? {} : { bufferLimit: context.bufferLimit }),
    ...(context.signal === undefined ? {} : { signal: context.signal }),
  });
  state.written.set(args.key, copied.versionId);
  state.objects += 1;
  context.metrics.copied(args.kind, copied.bytes);
};

const openRepositoryObject =
  (context: CopierContext, locator: RepositoryLocator, key: string) => async (): Promise<Readable> => {
    try {
      return await context.source.open(locator, key);
    } catch (error) {
      throw failAt('source_read', error);
    }
  };

/** Step 2: packs and their stored indexes. A pack the copy holds at its recorded length is skipped. */
const copyPacks = async (state: RoundState, manifest: Manifest, index: VersionIndex): Promise<void> => {
  for (const pack of manifest.packs) {
    const sha1 = packNameHash(pack.key);
    if (sha1 === undefined) {
      throw new MirrorFailure('verify', 'checksum', `pack key '${pack.key}' carries no hash`);
    }
    const key = repositoryKey(state.locator, pack.key);
    if (!holds(index, key, pack.bytes)) {
      // oxlint-disable-next-line no-await-in-loop -- one object in flight per repository, as hydration does
      await copyOne(state, {
        key,
        kind: 'pack',
        open: openRepositoryObject(state.context, state.locator, pack.key),
        verification: { kind: 'pack', sha1 },
        expectedBytes: pack.bytes,
      });
    }
    const indexKey = indexKeyFor(pack.key);
    if (pack.indexStored && !holds(index, repositoryKey(state.locator, indexKey))) {
      // oxlint-disable-next-line no-await-in-loop -- same
      await copyOne(state, {
        key: repositoryKey(state.locator, indexKey),
        kind: 'idx',
        open: openRepositoryObject(state.context, state.locator, indexKey),
        verification: { kind: 'none' },
      });
    }
  }
};

const segmentPrevious = (bytes: Uint8Array<ArrayBuffer>): string | undefined => {
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
    previous?: unknown;
  };
  return typeof parsed.previous === 'string' && /^pushes\/[\w.-]+\.json$/u.test(parsed.previous)
    ? parsed.previous
    : undefined;
};

/** Step 2: the push-log chain from `earlierPushes` back to the first segment the copy already holds. */
const copySegments = async (state: RoundState, manifest: Manifest, index: VersionIndex): Promise<void> => {
  const seen = new Set<string>();
  let next = manifest.earlierPushes ?? undefined;
  while (next !== undefined && !seen.has(next) && !holds(index, repositoryKey(state.locator, next))) {
    seen.add(next);
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      // oxlint-disable-next-line no-await-in-loop -- the chain is followed one link at a time
      bytes = await readWhole(await state.context.source.open(state.locator, next));
    } catch (error) {
      throw failAt('source_read', error);
    }
    // oxlint-disable-next-line no-await-in-loop -- same
    await copyOne(state, {
      key: repositoryKey(state.locator, next),
      kind: 'segment',
      open: fromBytes(bytes),
      verification: { kind: 'none' },
      expectedBytes: bytes.byteLength,
    });
    next = segmentPrevious(bytes);
  }
};

/**
 * Step 3: LFS objects finalized at or before G's commit and not yet copied. They
 * are a precondition for advancing the watermark, though the manifest does not
 * name them (W13 Finding 1). Each is verified against its own oid.
 */
const copyLfs = async (state: RoundState, manifest: Manifest): Promise<void> => {
  const { context, locator } = state;
  const batch = context.lfsBatch ?? 100;
  const finalizedBy = new Date(manifest.committedAt);
  let index: VersionIndex | undefined;
  let after: string | undefined;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- keyset pages
    const pending = await context.ledger.pendingLfs(locator.projectId, finalizedBy, batch, after);
    if (pending.length === 0) {
      return;
    }
    // oxlint-disable-next-line no-await-in-loop -- listed once, only when there is something to copy
    index ??= await indexVersions(context.destination, lfsPrefix(locator), context.signal);
    const copied: string[] = [];
    for (const object of pending) {
      const key = lfsKey(locator, object.oid);
      if (!holds(index, key, object.sizeBytes)) {
        // oxlint-disable-next-line no-await-in-loop -- one object in flight per repository
        await copyOne(state, {
          key,
          kind: 'lfs',
          open: async () => {
            let stream: Readable | undefined;
            try {
              stream = await context.source.openLfs(locator, object.oid);
            } catch (error) {
              throw failAt('source_read', error);
            }
            if (stream === undefined) {
              throw new MirrorFailure('source_read', 'source_missing', `the primary holds no LFS object ${object.oid}`);
            }
            return stream;
          },
          verification: { kind: 'lfs', sha256Hex: object.oid },
          expectedBytes: object.sizeBytes,
        });
      }
      copied.push(object.oid);
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- recorded per batch so a crash repeats at most one batch
      await context.ledger.markLfsCopied(locator.projectId, copied, state.clock.at);
    } catch (error) {
      throw failAt('watermark', error);
    }
    after = pending.at(-1)?.oid;
  }
};

/** Step 4: the snapshot, byte for byte the manifest R2 holds, written last. */
// oxlint-disable-next-line max-params -- a step of one round, over the round's state and listing
const writeSnapshot = async (
  state: RoundState,
  manifest: Manifest,
  bytes: Uint8Array<ArrayBuffer>,
  index: VersionIndex,
): Promise<{ key: string; sha256Hex: string }> => {
  const key = snapshotKey(state.locator, manifest.generation, manifest.incarnation);
  const digest = sha256Hex(bytes);
  const base64 = Buffer.from(digest, 'hex').toString('base64');
  for (const version of index.versions.get(key) ?? []) {
    if (version.bytes !== bytes.byteLength) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- at most a crashed round's one version
    const head = await state.context.destination
      .head(key, version.versionId, state.context.signal)
      .catch(() => undefined);
    if (head?.sha256 === base64) {
      return { key, sha256Hex: digest };
    }
  }
  await copyOne(state, {
    key,
    kind: 'manifest',
    open: fromBytes(bytes),
    verification: { kind: 'none' },
    expectedBytes: bytes.byteLength,
  });
  return { key, sha256Hex: digest };
};

/**
 * Every bucket key the newest snapshot depends on, itself included (W13 B6): its
 * packs and indexes, every push-log segment the copy holds for the repository (a
 * superset of the chain: a lost racer's few-kilobyte segment is locked too), and
 * the project's copied LFS objects.
 */
// oxlint-disable-next-line max-params -- the snapshot's manifest and what the copy holds for it
export const dependencyKeys = (
  locator: RepositoryLocator,
  manifest: Manifest,
  repository: VersionIndex,
  lfs: ReadonlySet<string>,
): string[] => {
  const keys = new Set<string>([snapshotKey(locator, manifest.generation, manifest.incarnation)]);
  for (const pack of manifest.packs) {
    keys.add(repositoryKey(locator, pack.key));
    if (pack.indexStored) {
      keys.add(repositoryKey(locator, indexKeyFor(pack.key)));
    }
  }
  for (const key of repository.versions.keys()) {
    if (key.startsWith(`${repositoryPrefix(locator)}pushes/`)) {
      keys.add(key);
    }
  }
  for (const oid of lfs) {
    keys.add(lfsKey(locator, oid));
  }
  return [...keys];
};

/**
 * Step 5, shared with the daily retention sweep: extends every version of every
 * dependency to `clock.until` (never beyond now + 30 days), except versions this
 * pass wrote, which already carry it. Returns the earliest lock now held, which
 * is `clock.until` because every dependency was just given it.
 */
export const extendDependencies = async (
  context: CopierContext,
  args: {
    keys: readonly string[];
    indexes: readonly VersionIndex[];
    written: ReadonlyMap<string, string>;
    clock: RetentionClock;
  },
): Promise<Date> => {
  let extended = 0;
  try {
    for (const key of args.keys) {
      const versions = args.indexes.flatMap((index) => index.versions.get(key) ?? []);
      for (const version of versions) {
        if (args.written.get(key) === version.versionId) {
          continue;
        }
        // oxlint-disable-next-line no-await-in-loop -- free, bounded calls; sequential keeps the failure precise
        await context.destination.extendRetention(key, version.versionId, args.clock.until, context.signal);
        extended += 1;
      }
    }
  } catch (error) {
    context.metrics.extension('extended', extended);
    context.metrics.extension('failed');
    throw new MirrorFailure('retention', failAt('retention', error).reason, 'a retention extension failed', {
      cause: error,
    });
  }
  context.metrics.extension('extended', extended);
  return args.clock.until;
};

/** The time the first uncopied generation was committed: from the push log, else the row's pending time. */
const firstUncopiedAt = (candidate: CopyCandidate, manifest: Manifest): Date | undefined => {
  const record = manifest.pushes.find((push) => push.generation === candidate.copiedGeneration + 1);
  return record === undefined ? candidate.copyPendingSince : new Date(record.committedAt);
};

/**
 * The owner marker (W13 B2): written once per deletion and never extended, so
 * an erased owner's copy ends with its last lock (B6, at most about 31 days).
 */
export const ensureOwnerMarker = async (context: CopierContext, owner: TombstonedOwner): Promise<boolean> => {
  const key = ownerMarkerKey(owner.ownerId, owner.deletedAt);
  const index = await indexVersions(context.destination, ownerMarkerPrefix(owner.ownerId), context.signal);
  if (holds(index, key)) {
    return false;
  }
  const bytes = new TextEncoder().encode(
    JSON.stringify({
      format: 1,
      ownerId: owner.ownerId,
      deletedAt: owner.deletedAt.toISOString(),
      purgeAfter: owner.purgeAfter.toISOString(),
      erasure: owner.erasure,
    }),
  );
  const state: RoundState = {
    context,
    locator: repositoryLocator({ ownerId: owner.ownerId, projectId: 'marker' }),
    clock: retentionClock(context),
    written: new Map(),
    objects: 0,
  };
  await copyOne(state, {
    key,
    kind: 'owner_marker',
    open: fromBytes(bytes),
    verification: { kind: 'none' },
    expectedBytes: bytes.byteLength,
  });
  return true;
};

/**
 * Writes every unmarked owner's marker and records it, so the copier learns of a
 * deletion within one poll. An owner whose marker fails is counted and left
 * unmarked for the next poll; it never holds up the others. Returns the number
 * marked.
 */
export const markTombstonedOwners = async (context: CopierContext, limit = 100): Promise<number> => {
  const owners = await context.ledger.unmarkedTombstones(limit);
  let marked = 0;
  for (const owner of owners) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- few rows, each one marker
      await ensureOwnerMarker(context, owner);
      // oxlint-disable-next-line no-await-in-loop -- recorded only after the marker is verified
      await context.ledger.markTombstone(owner.ownerId, retentionClock(context).at);
      marked += 1;
    } catch (error) {
      const failure = failAt('dest_write', error);
      context.metrics.failure(failure.stage, failure.reason);
      context.report?.({
        event: 'tau_mirror.owner_marker_failed',
        stage: failure.stage,
        reason: failure.reason,
        error: failure.message,
      });
    }
  }
  return marked;
};

const runRound = async (context: CopierContext, candidate: CopyCandidate): Promise<RoundResult> => {
  const locator = repositoryLocator({
    ownerId: candidate.ownerId,
    projectId: candidate.projectId,
  });
  const clock = retentionClock(context);
  let read;
  try {
    read = await context.source.readManifest(locator);
  } catch (error) {
    throw failAt('source_read', error);
  }
  if (read === undefined) {
    throw new MirrorFailure(
      'source_read',
      'source_missing',
      `Postgres records generation ${String(candidate.generation)} but the primary holds no manifest`,
    );
  }
  const { manifest, bytes } = read;
  if (manifest.generation <= candidate.copiedGeneration) {
    await context.ledger.settle(candidate.projectId, manifest.generation);
    return { outcome: 'noop', generation: manifest.generation };
  }

  const state: RoundState = {
    context,
    locator,
    clock,
    written: new Map(),
    objects: 0,
  };
  const repository = await indexVersions(context.destination, repositoryPrefix(locator), context.signal);
  if (repository.hidden > 0) {
    context.report?.({
      event: 'tau_mirror.hidden_versions',
      projectId: candidate.projectId,
      count: repository.hidden,
    });
  }

  if (isTombstoned(manifest)) {
    // The tombstone is copied as a snapshot and nothing is extended: the data's locks lapse on their own.
    const owner = await context.ledger.tombstone(candidate.ownerId);
    if (owner !== undefined) {
      await ensureOwnerMarker(context, owner);
    }
    const snapshot = await writeSnapshot(state, manifest, bytes, repository);
    await record(context, candidate.projectId, {
      generation: manifest.generation,
      manifestSha256: snapshot.sha256Hex,
      lockedUntil: undefined,
    });
    return {
      outcome: 'tombstoned',
      generation: manifest.generation,
      objects: state.objects,
    };
  }

  await copyPacks(state, manifest, repository);
  await copySegments(state, manifest, repository);
  await copyLfs(state, manifest);
  const snapshot = await writeSnapshot(state, manifest, bytes, repository);

  let lockedUntil = candidate.copyLockedUntil;
  if (lockedUntil === undefined || lockedUntil < clock.floor) {
    const lfsIndex = await indexVersions(context.destination, lfsPrefix(locator), context.signal);
    const lfs = await context.ledger.copiedLfs(candidate.projectId);
    // The listing predates this round's segment uploads; they are already locked to `until`.
    const keys = [...dependencyKeys(locator, manifest, repository, lfs), ...state.written.keys()];
    lockedUntil = await extendDependencies(context, {
      keys: [...new Set(keys)],
      indexes: [repository, lfsIndex],
      written: state.written,
      clock,
    });
  }

  await record(context, candidate.projectId, {
    generation: manifest.generation,
    manifestSha256: snapshot.sha256Hex,
    lockedUntil,
  });
  const committed = firstUncopiedAt(candidate, manifest);
  if (committed !== undefined) {
    context.metrics.delay(((context.now ?? (() => new Date()))().getTime() - committed.getTime()) / 1000);
  }
  return {
    outcome: 'copied',
    generation: manifest.generation,
    objects: state.objects,
  };
};

const record = async (
  context: CopierContext,
  projectId: string,
  copy: {
    generation: number;
    manifestSha256: string;
    lockedUntil: Date | undefined;
  },
): Promise<void> => {
  try {
    await context.ledger.recordCopy(projectId, copy);
  } catch (error) {
    throw failAt('watermark', error);
  }
};

/**
 * One copy round for one repository. Never throws: a failure is counted with its
 * stage and reason, reported, and leaves the watermark where it was.
 */
export const copyRepository = async (context: CopierContext, candidate: CopyCandidate): Promise<RoundResult> => {
  let result: RoundResult;
  try {
    result = await runRound(context, candidate);
  } catch (error) {
    const failure = failAt('source_read', error);
    context.metrics.failure(failure.stage, failure.reason);
    context.report?.({
      event: 'tau_mirror.round_failed',
      projectId: candidate.projectId,
      stage: failure.stage,
      reason: failure.reason,
      error: failure.message,
    });
    result = { outcome: 'failed', failure };
  }
  context.metrics.round(result.outcome);
  return result;
};
