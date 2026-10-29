/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { createHash, randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { createReadStream } from 'node:fs';
import { open, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  CommitToken,
  ManifestBytes,
  ObjectBody,
  RepositoryLocator,
  RepositoryStore,
} from '#api/git/store/port.js';
import { compactLease, shouldCompact } from '#api/git/store/compaction.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import type { FaultInjector } from '#api/git/store/fault-points.js';
import { readLeaseReferences, runGit } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import {
  commitDeadlineMilliseconds,
  deferredCompactionPackLimit,
  livePackBound,
  repositoryByteCeiling,
  retentionWindowMilliseconds,
} from '#api/git/store/limits.js';
import { putRetirementMarker, sweepRepository } from '#api/git/store/sweep.js';
import type { SweepOutcome } from '#api/git/store/sweep.js';
import {
  ManifestError,
  assertGenerationSucceeds,
  assertSameIncarnation,
  compactionCommitter,
  decodeManifest,
  indexKeyFor,
  encodeManifest,
  isTombstoned,
  onlyCompactedSince,
  spilledPushLog,
  succeedManifest,
  tombstoneManifest,
} from '#api/git/store/manifest.js';
import type { Manifest, ManifestPack } from '#api/git/store/manifest.js';

/**
 * The commit protocol: what happens after stock `receive-pack` exits and
 * before the client is acknowledged (north star write path, steps 5–7), and
 * the compaction a push may leave owed for after that acknowledgement
 * ({@link compactCommitted}).
 *
 * Two things this file will not do, both from AR-A:
 *
 * - **It does not read git's exit code.** `receive-pack` exits 0 on a push it
 *   refused entirely, and a non-atomic push partly succeeds, so the signal
 *   that there is anything to commit is the difference between the lease's
 *   `for-each-ref` and the manifest's ref map — nothing else (E1-C, E4b).
 * - **It never runs inside a hook.** git refuses refs *after* `pre-receive`
 *   has accepted them, so a hook-side commit would durably record a ref git
 *   then refuses (E3, charter D17).
 */

/**
 * One ref the push moved. `before` is absent for a ref this push created, and
 * `after` for one it removed — which cannot happen while deletes are refused,
 * and is computed anyway so the shape does not lie.
 *
 * This is how W4 derives which tags a push published (D9/D19): materialization
 * is derived state computed from the committed ref-map difference, not from a
 * `post-receive` spool. **The lease installs no `post-receive` hook.**
 */
export type MovedRef = { readonly ref: string; readonly before?: string; readonly after?: string };

export type CommitResult =
  | { readonly committed: false; readonly reason: 'no-ref-change' }
  | {
      readonly committed: true;
      readonly manifest: Manifest;
      readonly token: CommitToken;
      /** Whether this commit's own manifest write carried a compaction. */
      readonly compacted: boolean;
      /**
       * The compaction this commit owes, when it left more than the pack bound
       * live because its caller deferred compaction past the reply: run it over
       * the same lease, before disposing it ({@link compactCommitted}).
       * Absent when nothing is owed.
       */
      readonly compaction?: (options?: DeferredCompactionOptions) => Promise<DeferredCompactionOutcome>;
      /**
       * The compacting holder's housekeeping (NI4), for the caller to run once
       * its reply no longer waits on it (W13b): the sweep lists `packs/` and
       * `retired/`, which grow with every push inside the retention window.
       * Resolves to the keys it deleted and the retired bytes it kept, or
       * `undefined` when this commit did not compact or the sweep failed, and
       * never rejects.
       */
      readonly sweep: () => Promise<SweepOutcome | undefined>;
      /** The ref-map difference this commit recorded. */
      readonly moved: readonly MovedRef[];
    };

export type CommitLeaseArguments = {
  store: RepositoryStore;
  lease: RepositoryLease;
  /** The authenticated pusher, from the session and never from the request (NI16). */
  committedBy: string;
  /** The cloud host the pusher's request came through (D21, EQ11); absent for the account's own push. */
  viaDevice?: string;
  /** Live packs tolerated before this committer compacts. */
  packBound?: number;
  /**
   * Leave a compaction this commit would make to the caller, to run after its
   * reply ({@link CommitResult}'s `compaction`), unless the repository would
   * then hold more than {@link deferredCompactionPackLimit} packs or pass the
   * byte ceiling uncompacted. Off by default: the commit compacts inline.
   */
  deferCompaction?: boolean;
  /**
   * Live packs past which a deferring commit compacts inline anyway; this
   * build's {@link deferredCompactionPackLimit} by default.
   */
  deferredPackLimit?: number;
  /** Per-repository ceiling on non-LFS bytes (D20). */
  byteCeiling?: number;
  /** The clock, injectable so the retention and orphan windows are testable. */
  now?: () => Date;
  /** Epoch milliseconds. Past it the push is abandoned without a manifest write (NI5). */
  deadlineAt?: number;
  faults?: FaultInjector;
  /** Told how long each phase took, in seconds, as it ends — failed or not (W14 OB2). */
  onPhase?: CommitPhaseObserver;
};

/**
 * The parts of one commit, in the order they run. `compaction` runs only on a
 * compacting commit and `manifest_read` only when the conditional write did
 * not certainly win; `object_puts` is one concurrent round however many
 * objects the commit stores.
 */
export type CommitPhase = 'prepare' | 'compaction' | 'hash' | 'object_puts' | 'manifest_write' | 'manifest_read';

export type CommitPhaseObserver = (phase: CommitPhase, seconds: number) => void;

/** Runs `run` as `phase`, reporting its duration whether it resolves or throws. */
const timed = async <T>(
  observer: CommitPhaseObserver | undefined,
  phase: CommitPhase,
  run: () => Promise<T>,
): Promise<T> => {
  const startedAt = performance.now();
  try {
    return await run();
  } finally {
    observer?.(phase, (performance.now() - startedAt) / 1000);
  }
};

/**
 * The caller's bounds, or this build's. The deadline is measured from before
 * the first upload, so no committer can still be naming keys by the time the
 * sweep's orphan threshold considers them abandoned (NI5).
 */
const resolveBounds = (
  args: CommitLeaseArguments,
): { at: Date; packBound: number; byteCeiling: number; deadlineAt: number } => ({
  at: (args.now ?? (() => new Date()))(),
  packBound: args.packBound ?? livePackBound,
  byteCeiling: args.byteCeiling ?? repositoryByteCeiling,
  deadlineAt: args.deadlineAt ?? Date.now() + commitDeadlineMilliseconds,
});

/**
 * Attempts at a rate-limited manifest write: the first, then two retries at
 * 200 ms and 600 ms. These are the only attempts: the adapter sends each one
 * as a single request with the AWS SDK's own retries off, so a contended key
 * sees three requests per push rather than up to nine (review FR21).
 */
const manifestWriteAttempts = 3;

/**
 * R2 bounds *concurrent* writes to one key, not their rate, and answers 429
 * with `retry-after: 5` (W0b). The AWS SDK surfaces that as an error named
 * `ServiceUnavailable`, so the classification is the HTTP status and never the
 * name. A retry of the same conditional write is safe: a 429 changed nothing.
 */
const isRateLimited = (error: unknown): boolean =>
  (error as { $metadata?: { httpStatusCode?: number } } | undefined)?.$metadata?.httpStatusCode === 429;

const byName = ([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number =>
  left < right ? -1 : 1;

const sameReferences = (left: Manifest['refs'], right: Manifest['refs']): boolean =>
  JSON.stringify(Object.entries(left).sort(byName)) === JSON.stringify(Object.entries(right).sort(byName));

const movedReferences = (before: Manifest['refs'], after: Manifest['refs']): MovedRef[] => {
  const moved: MovedRef[] = [];
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = before[name]?.oid;
    const now = after[name]?.oid;
    if (was === now) {
      continue;
    }
    moved.push({
      ref: name,
      ...(was === undefined ? {} : { before: was }),
      ...(now === undefined ? {} : { after: now }),
    });
  }
  return moved;
};

const packFilesIn = async (directory: string): Promise<string[]> => {
  const entries = await readdir(path.join(directory, 'objects/pack'));
  return entries.filter((name) => name.endsWith('.pack')).sort();
};

const looseObjectCount = async (directory: string): Promise<number> => {
  const output = await runGit(directory, ['count-objects', '-v']);
  const line = output.split('\n').find((candidate) => candidate.startsWith('count: '));
  return Number(line?.slice('count: '.length) ?? '0');
};

/**
 * The preconditions a commit has, checked over the lease **as the push left
 * it** — before any compaction, because `repack -a -d` would roll loose
 * objects into a pack and make the loose check vacuous on exactly the path
 * that needs it (north star write path step 6; AR-A attack 3). `repack` is
 * reachability-preserving and W0a measured `fsck --strict` clean after every
 * compaction at the ceiling, so checking connectivity here rather than after
 * loses nothing.
 *
 * There is deliberately no "a pack must have arrived" precondition. A push
 * that moves a ref to a commit the server already holds — a new branch at an
 * existing commit, a lightweight tag, `git push origin <sha>:refs/heads/x` —
 * sends no pack at all, and refusing it would refuse a legitimate push.
 * Connectivity is the guard that actually answers the question those pushes
 * raise, which is whether the objects the new refs name are present.
 */
const assertCommittable = async (lease: RepositoryLease): Promise<void> => {
  const loose = await looseObjectCount(lease.directory);
  if (loose > 0) {
    throw new RepositoryStoreError(
      'loose-objects',
      `the lease holds ${String(loose)} loose objects; committing would name refs whose objects are in no pack`,
    );
  }

  try {
    await runGit(lease.directory, ['fsck', '--connectivity-only', '--no-dangling', '--no-progress']);
  } catch (error) {
    throw new RepositoryStoreError('connectivity', 'the refs and packs about to be committed are not connected', {
      cause: error,
    });
  }
};

/** The bytes a commit of `live` plus `uploads` would hold. */
const committedBytesOf = (live: ReadonlyArray<{ bytes: number }>, uploads: ReadonlyArray<{ bytes: number }>): number =>
  live.reduce((total, pack) => total + pack.bytes, 0) + uploads.reduce((total, upload) => total + upload.bytes, 0);

const withinCeiling = (
  live: ReadonlyArray<{ bytes: number }>,
  uploads: ReadonlyArray<{ bytes: number }>,
  byteCeiling: number,
): boolean => committedBytesOf(live, uploads) <= byteCeiling;

/**
 * The D20 ceiling, as a backstop behind `pre-receive`: the hook measures what
 * this push added, and this measures what the repository would then hold.
 */
const assertWithinCeiling = (
  live: ReadonlyArray<{ bytes: number }>,
  uploads: ReadonlyArray<{ bytes: number }>,
  byteCeiling: number,
): void => {
  const committedBytes = committedBytesOf(live, uploads);
  if (committedBytes > byteCeiling) {
    throw new RepositoryStoreError(
      'ceiling-exceeded',
      `the repository would hold ${String(committedBytes)} bytes, past the ${String(byteCeiling)}-byte ceiling`,
    );
  }
};

/** Everything this module logs: a sweep that could not finish, and a commit that rebased or could not tell whether it may. */
const logger = new Logger('RepositoryCommit');

/** `packs/<git pack name>-<upload nonce>.pack`: unique to this upload, always (D16, NI4). */
const uploadKeyFor = (packFile: string): string =>
  `packs/${packFile.slice(0, -'.pack'.length)}-${randomBytes(8).toString('hex')}.pack`;

/**
 * Commits whatever the push left in the lease, or nothing.
 *
 * The caller withholds the entire HTTP response — headers included — until
 * this resolves (D4, NI2), and starts the result's `sweep`, and the
 * `compaction` a deferring caller is owed, only after that. A
 * thrown `RepositoryStoreError` with code `lost` is the 503 signal; every
 * other code is a refusal the client should see.
 */
// oxlint-disable-next-line max-lines-per-function -- the write path is one sequence; splitting it hides the order that makes it safe
export const commitLease = async (args: CommitLeaseArguments): Promise<CommitResult> => {
  const { store, lease } = args;
  const { at, packBound, byteCeiling, deadlineAt } = resolveBounds(args);
  const assertDeadline = (): void => {
    if (Date.now() > deadlineAt) {
      throw new RepositoryStoreError(
        'deadline',
        `the commit deadline for ${lease.locator.projectId} passed before the manifest was written`,
      );
    }
  };

  const prepared = await timed(args.onPhase, 'prepare', async () => {
    const references = await readLeaseReferences(lease.directory);
    if (sameReferences(references, lease.manifest?.refs ?? {})) {
      return undefined;
    }
    await assertCommittable(lease);
    const inLease = await packFilesIn(lease.directory);
    return { references, arrived: inLease.filter((name) => !lease.hydratedPackFiles.has(name)) };
  });
  if (prepared === undefined) {
    return { committed: false, reason: 'no-ref-change' };
  }
  const { references } = prepared;

  const hydrated = lease.manifest?.packs ?? [];
  const plan = async (defer: boolean): Promise<PackPlan & { uploads: PlannedUpload[] }> => {
    const planned = await planPacks({
      lease,
      hydrated,
      arrived: prepared.arrived,
      packBound,
      deferredPackLimit: args.deferredPackLimit ?? deferredCompactionPackLimit,
      defer,
      ...(args.faults === undefined ? {} : { faults: args.faults }),
      ...(args.onPhase === undefined ? {} : { onPhase: args.onPhase }),
    });
    return { ...planned, uploads: await plannedUploads(lease, planned.toUpload) };
  };
  let planned = await plan(args.deferCompaction === true);
  if (planned.owed && !withinCeiling(planned.retainedLive, planned.uploads, byteCeiling)) {
    /* Compaction can bring a repository back under the ceiling that its
       uncompacted packs pass, so a push near it compacts now rather than being
       refused for bytes the deferred compaction would have saved. */
    planned = await plan(false);
  }
  const { compacted, keptPack, retainedLive, uploads } = planned;
  assertWithinCeiling(retainedLive, uploads, byteCeiling);

  // Every upload key is chosen before anything is sent, so the successor
  // manifest — and the push-log segment it may spill — is known up front and
  // its objects can all go out in one round.
  const uploaded: ManifestPack[] = uploads.map((upload) => ({
    key: upload.key,
    bytes: upload.bytes,
    indexStored: true,
  }));
  const next = succeedManifest(
    lease.manifest,
    {
      refs: references,
      packs: [...retainedLive, ...uploaded],
      committedBy: args.committedBy,
      ...(args.viaDevice === undefined ? {} : { viaDevice: args.viaDevice }),
    },
    at,
  );

  // Each pack goes up with the index beside it (D33): the stored index removes
  // the 5.0–9.0 s `index-pack` term from every later hydrate for 0.17 % more
  // bytes. A hydrate that fetches it no longer runs `index-pack`, which was also
  // the only check of pack bytes on the way in, so corrupt bytes surface as a
  // git error on first read instead — the trade W1's port makes, since git
  // verifies what it reads.
  assertDeadline();
  const files = await timed(args.onPhase, 'hash', async () =>
    readyFiles(
      uploads.flatMap((upload) => [
        { key: upload.key, file: upload.file },
        { key: indexKeyFor(upload.key), file: `${upload.file.slice(0, -'.pack'.length)}.idx` },
      ]),
    ),
  );
  assertDeadline();
  await timed(args.onPhase, 'object_puts', async () =>
    putAll([
      ...files.map(
        (ready) => async (signal: AbortSignal) =>
          store.putObject(
            lease.locator,
            ready.key,
            ready.body,
            { contentLength: ready.contentLength, sha256: ready.sha256 },
            signal,
          ),
      ),
      // Retirement is recorded before the manifest that drops these packs, so no
      // committed manifest ever leaves a live-until-now pack without its marker.
      ...hydrated
        .filter((pack) => compacted && pack.key !== keptPack?.key)
        .map(
          (pack) => async (signal: AbortSignal) =>
            putRetirementMarker({ store, locator: lease.locator, packKey: pack.key, at }, signal),
        ),
      async (signal: AbortSignal) =>
        writeSpilledPushLog({ store, locator: lease.locator, base: lease.manifest, next, signal }),
    ]),
  );
  await args.faults?.('after-pack-upload');

  if (lease.manifest !== undefined) {
    // A self-check on the succession this commit is about to write: the base a
    // lease hydrated from is the base the next manifest must follow (NI6).
    assertGenerationSucceeds(lease.manifest, next);
  }

  await args.faults?.('before-manifest-commit');
  assertDeadline();
  let committed = next;
  let expected = lease.token;
  let base = lease.manifest;
  let rebased = false;
  let token: CommitToken;
  for (let rebases = 0; ; rebases += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- each write follows the manifest the one before lost to
      token = await writeManifest({
        store,
        locator: lease.locator,
        next: committed,
        expected,
        hydrated: base,
        ...(args.onPhase === undefined ? {} : { onPhase: args.onPhase }),
      });
      break;
    } catch (error) {
      const rebasable =
        error instanceof RepositoryStoreError &&
        error.code === 'lost' &&
        !compacted &&
        lease.manifest !== undefined &&
        rebases < maximumRebases;
      const over = rebasable
        ? // oxlint-disable-next-line no-await-in-loop -- as above
          await rebaseOverCompaction({ ...args, references, uploaded, arrived: prepared.arrived, at, byteCeiling })
        : undefined;
      if (over === undefined) {
        throw error;
      }
      assertDeadline();
      ({ next: committed, expected, base } = over);
      rebased = true;
    }
  }
  await args.faults?.('after-manifest-commit');

  /* A rebased commit's lease holds packs its manifest no longer names, so it
     owes no compaction: the one it rebased over already ran. */
  const owedFiles =
    planned.owed && !rebased
      ? new Map([
          ...hydrated.map((pack): [string, string] => [pack.key, leasePackFile(pack.key)]),
          ...uploads.map((upload): [string, string] => [upload.key, upload.name]),
        ])
      : undefined;

  return {
    committed: true,
    manifest: committed,
    token,
    compacted,
    ...(owedFiles === undefined
      ? {}
      : {
          compaction: async (options: DeferredCompactionOptions = {}) =>
            compactCommitted({
              ...options,
              store,
              lease,
              committed,
              token,
              packFiles: owedFiles,
              ...(options.faults === undefined && args.faults !== undefined ? { faults: args.faults } : {}),
            }),
        }),
    sweep: async () =>
      compacted
        ? sweepQuietly({
            store,
            locator: lease.locator,
            committed,
            at,
            ...(args.faults === undefined ? {} : { faults: args.faults }),
          })
        : undefined,
    moved: movedReferences(lease.manifest?.refs ?? {}, references),
  };
};

/** Rebases one commit makes over deferred compactions before it reports its race lost. */
const maximumRebases = 2;

/**
 * The successor a commit that lost its conditional write may write instead,
 * when what it lost to is only deferred compactions of the generation it
 * hydrated (review of push latency F2, finding 1).
 *
 * A deferred compaction runs after its push was answered, and only this
 * process's own pushes make it give way; a push spilled to another storage
 * member, a ref removal, or a push that arrived after its last check hydrated
 * the push's generation and would otherwise lose to a commit that moved no
 * ref. Rebasing is safe exactly when these hold, and is refused — the race is
 * lost as before — when any does not:
 *
 * - every generation since the lease's is a compaction's
 *   ({@link onlyCompactedSince}): same incarnation, same refs, and the objects
 *   those refs reach are all still in the newer manifest's packs;
 * - this commit compacted nothing itself, so its own uploads are the only
 *   packs it adds and it retires none;
 * - every object the new refs reach that the old refs did not is in this
 *   commit's own uploads ({@link carriesWhatItAdds}). A push that named an
 *   object the repository held unreferenced — which a compaction may have
 *   dropped — is refused here;
 * - the rebased repository still fits the byte ceiling.
 *
 * @returns The successor of the newer manifest, its token and that manifest; `undefined` to lose the race.
 */
const rebaseOverCompaction = async (args: {
  store: RepositoryStore;
  lease: RepositoryLease;
  committedBy: string;
  viaDevice?: string;
  references: Manifest['refs'];
  uploaded: readonly ManifestPack[];
  arrived: readonly string[];
  at: Date;
  byteCeiling: number;
}): Promise<{ next: Manifest; expected: CommitToken; base: Manifest } | undefined> => {
  const { store, lease } = args;
  const hydrated = lease.manifest;
  if (hydrated === undefined) {
    return undefined;
  }
  const current = await store.readManifest(lease.locator);
  if (current === undefined) {
    return undefined;
  }
  const newer = decodeManifest(current.manifest);
  if (!onlyCompactedSince(newer, hydrated) || !sameReferences(newer.refs, hydrated.refs)) {
    return undefined;
  }
  if (!withinCeiling(newer.packs, args.uploaded, args.byteCeiling)) {
    return undefined;
  }
  if (!(await carriesWhatItAdds({ lease, before: hydrated.refs, after: args.references, arrived: args.arrived }))) {
    return undefined;
  }
  const next = succeedManifest(
    newer,
    {
      refs: args.references,
      packs: [...newer.packs, ...args.uploaded],
      committedBy: args.committedBy,
      ...(args.viaDevice === undefined ? {} : { viaDevice: args.viaDevice }),
    },
    args.at,
  );
  assertGenerationSucceeds(newer, next);
  await writeSpilledPushLog({ store, locator: lease.locator, base: newer, next });
  logger.log(
    `generation ${String(newer.generation)} of ${lease.locator.projectId} is a deferred compaction of ` +
      `${String(hydrated.generation)}; this commit rebases onto it`,
  );
  return { next, expected: current.token, base: newer };
};

/**
 * Whether the packs this commit uploads hold every object its new refs reach
 * that its old refs did not. The rest of what the new refs reach, the old
 * refs reach too, and a compaction keeps all of that.
 *
 * Read from the lease: `rev-list --objects <new tips> --not <old tips>`, then
 * the uploaded packs' own indexes. Any failure answers `false`, which loses
 * the race as the commit would have without rebasing.
 */
const carriesWhatItAdds = async (args: {
  lease: RepositoryLease;
  before: Manifest['refs'];
  after: Manifest['refs'];
  arrived: readonly string[];
}): Promise<boolean> => {
  const added = [
    ...new Set(
      Object.entries(args.after)
        .filter(([name, tip]) => args.before[name]?.oid !== tip.oid)
        .map(([, tip]) => tip.oid),
    ),
  ];
  if (added.length === 0) {
    return true;
  }
  const old = [...new Set(Object.values(args.before).map((tip) => tip.oid))];
  try {
    const listed = await runGit(args.lease.directory, ['rev-list', '--objects', ...added, '--not', ...old]);
    const reached = listed
      .split('\n')
      .map((line) => line.split(' ', 1)[0] ?? '')
      .filter((oid) => oid.length > 0);
    if (reached.length === 0) {
      return true;
    }
    const held = new Set<string>();
    for (const name of args.arrived) {
      // oxlint-disable-next-line no-await-in-loop -- a push brings one pack, rarely two
      for (const oid of await packIndexNames(
        path.join(args.lease.directory, 'objects/pack', `${name.slice(0, -'.pack'.length)}.idx`),
        (reached[0]?.length ?? 40) / 2,
      )) {
        held.add(oid);
      }
    }
    return reached.every((oid) => held.has(oid));
  } catch (error) {
    logger.warn(`could not tell whether a commit to ${args.lease.locator.projectId} can rebase: ${String(error)}`);
    return false;
  }
};

/** The object names a version 2 pack index lists (`gitformat-pack`): after its header and fan-out table. */
const packIndexNames = async (file: string, hashBytes: number): Promise<string[]> => {
  const bytes = await readFile(file);
  const headerBytes = 8;
  const fanoutBytes = 256 * 4;
  if (bytes.readUInt32BE(0) !== 0xff_74_4f_63 || bytes.readUInt32BE(4) !== 2) {
    throw new Error(`${path.basename(file)} is not a version 2 pack index`);
  }
  const count = bytes.readUInt32BE(headerBytes + fanoutBytes - 4);
  const start = headerBytes + fanoutBytes;
  return Array.from({ length: count }, (_, index) =>
    bytes.subarray(start + index * hashBytes, start + (index + 1) * hashBytes).toString('hex'),
  );
};

/** What the caller of a deferred compaction controls. */
export type DeferredCompactionOptions = {
  /**
   * Asked before the repack, before the object puts and before the manifest
   * write: `true` gives up there, so a compaction never races a push this
   * process already knows is on its way. A give-up leaves at most unnamed
   * uploads and markers on live packs, which the sweep's rules already cover.
   */
  shouldAbandon?: () => boolean;
  /** The clock: the retirement markers' time. */
  now?: () => Date;
  /** Epoch milliseconds; past it the compaction gives up without a manifest write (NI5). */
  deadlineAt?: number;
  faults?: FaultInjector;
  /** Told how long each phase took, in seconds, as with a push. */
  onPhase?: CommitPhaseObserver;
};

/** How a deferred compaction ended. */
export type DeferredCompactionOutcome =
  | {
      readonly outcome: 'committed';
      readonly manifest: Manifest;
      readonly token: CommitToken;
      /** This compaction's sweep (NI4), as a compacting commit's; never rejects. */
      readonly sweep: () => Promise<SweepOutcome | undefined>;
    }
  /** Given up before its manifest write: told to, or past its deadline. */
  | { readonly outcome: 'abandoned' }
  /**
   * Given up because the manifest is no longer the push's generation: a
   * later writer committed first, so this compaction could only lose, and it
   * stopped before the repack or before any upload or retirement marker.
   */
  | { readonly outcome: 'superseded' }
  /** Another writer committed first; the next push past the bound owes it again. */
  | { readonly outcome: 'lost' };

/**
 * The compaction a push left owed, run over the push's own lease after the
 * client was answered (push latency F2/F4: a compacting commit's repack and
 * re-upload were the >5 s tail of the push reply).
 *
 * It is the inline compaction moved one manifest write later, and it keeps
 * every rule that one keeps:
 *
 * - **The same conditional write.** Its successor follows the push's
 *   committed manifest and is written against the push's token, so it either
 *   wins against exactly that generation or loses to whatever committed after.
 *   It reads the manifest before its repack and before its first put, and
 *   stops (`superseded`) once a later writer has committed. A writer that
 *   hydrated the push's generation and then finds the compaction committed
 *   rebases onto it rather than losing ({@link rebaseOverCompaction}).
 * - **Retirement before the manifest that drops a pack**, in the same round as
 *   the uploads, so no committed manifest leaves a live-until-now pack without
 *   its marker. A compaction that then loses leaves markers on packs that stay
 *   live, which only ever lengthen a retention (`sweep.ts`).
 * - **The refs do not move.** The lease holds exactly the refs and packs the
 *   push committed, and `repack -a -d --keep-pack` is reachability-preserving
 *   (W0a: `fsck --strict` clean), so the successor names the same refs over
 *   fewer packs and appends a push record that moved nothing.
 * - **The sweep follows its own committed manifest**, as a compacting push's
 *   does.
 *
 * @param args - The store and the push's lease, its committed manifest and
 *   token, and the lease file of every pack that manifest names.
 * @returns How it ended. Throws only for a failure of its own (a repack or a put).
 */
// oxlint-disable-next-line max-lines-per-function -- one sequence, in the order the push's own commit keeps
export const compactCommitted = async (
  args: DeferredCompactionOptions & {
    store: RepositoryStore;
    lease: RepositoryLease;
    committed: Manifest;
    token: CommitToken;
    /** Lease file name of every pack `committed` names, by key. */
    packFiles: ReadonlyMap<string, string>;
  },
): Promise<DeferredCompactionOutcome> => {
  const { store, lease, committed } = args;
  const at = (args.now ?? (() => new Date()))();
  const deadlineAt = args.deadlineAt ?? Date.now() + commitDeadlineMilliseconds;
  const abandoned = (): boolean => (args.shouldAbandon?.() ?? false) || Date.now() > deadlineAt;
  /* One manifest read before the repack and one before the first put: a
     compaction that can only lose its write spends neither, and leaves no
     marker on a pack the newer manifest still names. */
  const superseded = async (): Promise<boolean> => {
    const read = await store.readManifest(lease.locator);
    const current = read === undefined ? undefined : decodeManifest(read.manifest);
    return current?.generation !== committed.generation || current.incarnation !== committed.incarnation;
  };
  if (abandoned()) {
    return { outcome: 'abandoned' };
  }
  if (await superseded()) {
    return { outcome: 'superseded' };
  }

  const keptPack = [...committed.packs].sort((left, right) => right.bytes - left.bytes)[0];
  const keptFile = keptPack === undefined ? undefined : args.packFiles.get(keptPack.key);
  if (keptPack !== undefined && keptFile === undefined) {
    throw new Error(`the lease holds no file for ${keptPack.key}, which the committed manifest names`);
  }
  await timed(args.onPhase, 'compaction', async () => compactLease(lease, keptFile));
  await args.faults?.('mid-compaction');

  const remaining = await packFilesIn(lease.directory);
  const uploads = await plannedUploads(
    lease,
    remaining.filter((name) => name !== keptFile),
  );
  const next = succeedManifest(
    committed,
    {
      refs: committed.refs,
      packs: [
        ...(keptPack === undefined ? [] : [keptPack]),
        ...uploads.map((upload) => ({ key: upload.key, bytes: upload.bytes, indexStored: true })),
      ],
      committedBy: compactionCommitter,
    },
    at,
  );
  if (abandoned()) {
    return { outcome: 'abandoned' };
  }
  if (await superseded()) {
    return { outcome: 'superseded' };
  }

  const files = await timed(args.onPhase, 'hash', async () =>
    readyFiles(
      uploads.flatMap((upload) => [
        { key: upload.key, file: upload.file },
        { key: indexKeyFor(upload.key), file: `${upload.file.slice(0, -'.pack'.length)}.idx` },
      ]),
    ),
  );
  await timed(args.onPhase, 'object_puts', async () =>
    putAll([
      ...files.map(
        (ready) => async (signal: AbortSignal) =>
          store.putObject(
            lease.locator,
            ready.key,
            ready.body,
            { contentLength: ready.contentLength, sha256: ready.sha256 },
            signal,
          ),
      ),
      ...committed.packs
        .filter((pack) => pack.key !== keptPack?.key)
        .map(
          (pack) => async (signal: AbortSignal) =>
            putRetirementMarker({ store, locator: lease.locator, packKey: pack.key, at }, signal),
        ),
      async (signal: AbortSignal) =>
        writeSpilledPushLog({ store, locator: lease.locator, base: committed, next, signal }),
    ]),
  );
  await args.faults?.('after-pack-upload');
  assertGenerationSucceeds(committed, next);

  await args.faults?.('before-manifest-commit');
  if (abandoned()) {
    return { outcome: 'abandoned' };
  }
  let token: CommitToken;
  try {
    token = await writeManifest({
      store,
      locator: lease.locator,
      next,
      expected: args.token,
      hydrated: committed,
      ...(args.onPhase === undefined ? {} : { onPhase: args.onPhase }),
    });
  } catch (error) {
    if (error instanceof RepositoryStoreError && error.code === 'lost') {
      return { outcome: 'lost' };
    }
    throw error;
  }
  await args.faults?.('after-manifest-commit');

  return {
    outcome: 'committed',
    manifest: next,
    token,
    sweep: async () =>
      sweepQuietly({
        store,
        locator: lease.locator,
        committed: next,
        at,
        ...(args.faults === undefined ? {} : { faults: args.faults }),
      }),
  };
};

/**
 * The sweep, after a durable commit. The push is owed the truth about it
 * (NI2), and the sweep is housekeeping on garbage nothing reads: if it fails,
 * or the worker dies inside it, the keys it would have removed wait for the
 * next compacting committer. So it logs and never rejects.
 */
const sweepQuietly = async (args: Parameters<typeof sweepRepository>[0]): Promise<SweepOutcome | undefined> => {
  try {
    return await sweepRepository(args);
  } catch (error) {
    logger.warn(
      `sweep after generation ${String(args.committed.generation)} of ${args.locator.projectId} failed; ` +
        `expired and orphaned keys remain for the next compacting committer: ${String(error)}`,
    );
    return undefined;
  }
};

/**
 * Restores the pack bound, in the one form W0a found affordable at the
 * ceiling: `repack -a -d --keep-pack=<largest live pack>` (D33).
 *
 * A full `repack -a -d` rewrites every byte — 4.5–12.4 s at the ceiling, then
 * 6.2–8.8 s to re-upload the resulting gigabyte, both inside the withheld HTTP
 * response, so one push in eight would stall for 11–21 s. Keeping the largest
 * pack rolls only the tail into a new pack: 2.8 s, ~1.4 MiB uploaded, lease
 * disk peaking at 1.08× instead of 1.99×, `fsck --strict` clean. The kept pack
 * survives byte-for-byte under the key it already has, so the commit neither
 * re-uploads nor retires it.
 *
 * Returns the pack that was kept, `undefined` when it compacted with nothing
 * to keep, or `'not-compacted'`.
 */
const planPacks = async (args: {
  lease: RepositoryLease;
  hydrated: readonly ManifestPack[];
  arrived: readonly string[];
  packBound: number;
  /** Leave the compaction owed rather than run it, within `deferredPackLimit`. */
  defer: boolean;
  deferredPackLimit: number;
  faults?: FaultInjector;
  onPhase?: CommitPhaseObserver;
}): Promise<PackPlan> => {
  const live = args.hydrated.length + args.arrived.length;
  if (!shouldCompact(live, args.packBound)) {
    return {
      compacted: false,
      owed: false,
      keptPack: undefined,
      toUpload: args.arrived,
      retainedLive: args.hydrated,
    };
  }
  if (args.defer && live <= args.deferredPackLimit) {
    return {
      compacted: false,
      owed: true,
      keptPack: undefined,
      toUpload: args.arrived,
      retainedLive: args.hydrated,
    };
  }

  const keptPack = [...args.hydrated].sort((left, right) => right.bytes - left.bytes)[0];
  const keptFile = keptPack === undefined ? undefined : leasePackFile(keptPack.key);
  await timed(args.onPhase, 'compaction', async () => compactLease(args.lease, keptFile));
  await args.faults?.('mid-compaction');

  // Every pack in the lease is now this commit's except the one `--keep-pack`
  // preserved byte-for-byte; that one stays live under the key it already has,
  // so it is neither re-uploaded nor retired.
  const remaining = await packFilesIn(args.lease.directory);
  return {
    compacted: true,
    owed: false,
    keptPack,
    toUpload: remaining.filter((name) => name !== keptFile),
    retainedLive: keptPack === undefined ? [] : [keptPack],
  };
};

/** What a commit uploads and keeps: {@link planPacks}' answer. */
type PackPlan = {
  /** The commit compacts in its own manifest write. */
  compacted: boolean;
  /** The commit leaves more than the bound live, and its caller compacts after the reply. */
  owed: boolean;
  keptPack: ManifestPack | undefined;
  toUpload: readonly string[];
  retainedLive: readonly ManifestPack[];
};

/** One lease pack a commit uploads, under the key chosen for it before anything is sent. */
type PlannedUpload = { name: string; bytes: number; file: string; key: string };

const plannedUploads = async (lease: RepositoryLease, names: readonly string[]): Promise<PlannedUpload[]> =>
  Promise.all(
    names.map(async (name) => {
      const file = path.join(lease.directory, 'objects/pack', name);
      const stats = await stat(file);
      return { name, bytes: stats.size, file, key: uploadKeyFor(name) };
    }),
  );

/** Read size for hashing a lease file: one buffer, reused for every read. */
const hashReadBytes = 1024 * 1024;

/**
 * The base64 SHA-256 of a file, read through one reused buffer: the file is
 * never in memory whole, and the pass leaves no chunk garbage behind for the
 * upload pass to pile onto.
 */
const sha256OfFile = async (file: string, signal?: AbortSignal): Promise<string> => {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(hashReadBytes);
  const handle = await open(file, 'r');
  try {
    for (;;) {
      signal?.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- one buffer, so reads are sequential by construction
      const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, null);
      if (bytesRead === 0) {
        return hash.digest('base64');
      }
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
};

/**
 * A lease file at or below this size may be read once: hashed and sent from
 * the same bytes, which the adapter can then resend itself.
 */
const inMemoryObjectBytes = 4 * 1024 * 1024;

/**
 * The most lease bytes one commit holds in memory, however many packs it
 * uploads: a push normally leaves one pack, but a commit can carry up to
 * `livePackBound` arrived packs, and files past this budget are streamed. This
 * keeps DA4's bound — memory that does not grow with the pack or the pack
 * count.
 */
const inMemoryCommitBytes = 8 * 1024 * 1024;

/**
 * Reads a small lease file straight into one buffer of its stat size, with no
 * copy. A file that ended short is returned as what was read, so the declared
 * length matches the bytes the digest covers.
 */
const readWhole = async (file: string, size: number, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = new Uint8Array(new ArrayBuffer(size));
  const handle = await open(file, 'r');
  try {
    let filled = 0;
    while (filled < size) {
      signal.throwIfAborted();
      // oxlint-disable-next-line no-await-in-loop -- one buffer, filled in order
      const { bytesRead } = await handle.read(bytes, filled, size - filled, filled);
      if (bytesRead === 0) {
        return bytes.slice(0, filled);
      }
      filled += bytesRead;
    }
    return bytes;
  } finally {
    await handle.close();
  }
};

/**
 * Files hashed at once. Each streamed file holds a 1 MiB read buffer while it
 * hashes, so this bounds that memory beside the in-memory budget.
 */
const hashConcurrency = 4;

type ReadyFile = { key: string; body: ObjectBody; contentLength: number; sha256: string };

/**
 * The lease files a commit uploads, each with its digest and the body the
 * adapter reads.
 *
 * A small file, while the commit's in-memory budget lasts, is read once into
 * memory. Any other is hashed through one reused buffer and then streamed in a
 * second pass (DA4): memory is a read chunk, not the file — a pack at the D20
 * ceiling is a gigabyte, and the 1 GB VM cannot hold one beside the push that
 * produced it.
 *
 * The digest still guards the bytes. The adapter sends it as
 * `x-amz-checksum-sha256` and the backend refuses a body that does not match
 * it, so a file that changed between the passes is never stored under a
 * digest it does not have; above the single-part ceiling the adapter checks
 * the same digest itself before it completes the upload.
 *
 * Settled like the puts: one file that cannot be read stops the others' reads
 * and is rethrown only once none is still reading the lease.
 */
const readyFiles = async (files: ReadonlyArray<{ key: string; file: string }>): Promise<ReadyFile[]> => {
  const sizes = await settleAll(
    files.map(({ file }) => async () => {
      const stats = await stat(file);
      return stats.size;
    }),
    files.length,
  );
  let budget = inMemoryCommitBytes;
  const plans = files.map((entry, index) => {
    const size = sizes[index] ?? 0;
    const buffered = size <= inMemoryObjectBytes && size <= budget;
    if (buffered) {
      budget -= size;
    }
    return { ...entry, size, buffered };
  });
  return settleAll(
    plans.map((plan) => async (signal: AbortSignal): Promise<ReadyFile> => {
      if (plan.buffered) {
        const bytes = await readWhole(plan.file, plan.size, signal);
        return {
          key: plan.key,
          body: bytes,
          contentLength: bytes.byteLength,
          sha256: createHash('sha256').update(bytes).digest('base64'),
        };
      }
      return {
        key: plan.key,
        body: async () => createReadStream(plan.file),
        contentLength: plan.size,
        sha256: await sha256OfFile(plan.file, signal),
      };
    }),
    hashConcurrency,
  );
};

/**
 * Most object puts one commit has in flight. A push stores two objects, a
 * spilled segment one more, and a compaction up to `livePackBound` markers
 * besides, so this is one round for every commit the bound allows.
 */
const objectPutConcurrency = 12;

/**
 * Runs `tasks`, at most `concurrency` at once, and resolves with their results
 * in order once every one has succeeded.
 *
 * On the first failure the rest are told to stop through the signal and
 * nothing new starts, but this still waits for every task already started to
 * settle — settled rather than raced, as the hydrate's reads are — so the
 * caller never disposes the lease under a read or a stream still using it.
 * The error it rethrows is that first failure's own, unwrapped, so a refusal
 * is classified exactly as a one-at-a-time upload would have classified it.
 */
const settleAll = async <T>(
  tasks: ReadonlyArray<(signal: AbortSignal) => Promise<T>>,
  concurrency: number,
): Promise<T[]> => {
  const controller = new AbortController();
  const results: T[] = [];
  let failure: { reason: unknown } | undefined;
  let next = 0;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < tasks.length) {
      const index = next;
      next += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- each worker runs one task at a time; the workers run together
        const result = await tasks[index]?.(controller.signal);
        if (result !== undefined) {
          results[index] = result;
        }
      } catch (error) {
        failure ??= { reason: error };
        controller.abort();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  if (failure !== undefined) {
    throw failure.reason;
  }
  return results;
};

/**
 * Every object put of a commit, in one round of at most
 * {@link objectPutConcurrency}: the manifest write that follows is therefore
 * never reached with any object it names missing.
 */
const putAll = async (puts: ReadonlyArray<(signal: AbortSignal) => Promise<void>>): Promise<void> => {
  await settleAll(puts, objectPutConcurrency);
};

/**
 * Stores the push-log segment `next` spilled, if it spilled one (EQ11,
 * W13b). Every writer of a successor calls this before its manifest write,
 * so a committed `earlierPushes` always names a segment that exists.
 */
export const writeSpilledPushLog = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  base: Manifest | undefined;
  next: Manifest;
  signal?: AbortSignal;
}): Promise<void> => {
  const { store, locator } = args;
  args.signal?.throwIfAborted();
  const segment = spilledPushLog(args.base, args.next);
  if (segment === undefined) {
    return;
  }
  await store.putObject(
    locator,
    segment.key,
    segment.bytes,
    {
      contentLength: segment.bytes.byteLength,
      sha256: createHash('sha256').update(segment.bytes).digest('base64'),
    },
    args.signal,
  );
};

/** The file name a manifest key has inside a lease. */
const leasePackFile = (key: string): string => path.posix.basename(key);

/**
 * The conditional write, plus the two things the W1 hand-off says a caller
 * must do about `lost`.
 *
 * `lost` means "did not certainly win", not "certainly did not write": a
 * first attempt that landed while its response was lost, and the retry of it
 * that then fails its own precondition, both report `lost`. The adapter no
 * longer lets the AWS SDK make such retries (FR21), but this loop still does,
 * and a throw can still be a write that reached the backend. Before
 * answering 503 the committer re-reads and compares bytes; if the store holds
 * what it sent, it won. If the store holds a *different* incarnation, the
 * repository was purged and re-registered under the lease, which is not a
 * retryable race.
 */
const writeManifest = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  next: Manifest;
  expected: CommitToken | 'absent';
  hydrated: Manifest | undefined;
  onPhase?: CommitPhaseObserver;
}): Promise<CommitToken> => {
  const { store, locator, expected, hydrated } = args;
  const bytes = encodeManifest(args.next);

  const won = await timed(args.onPhase, 'manifest_write', async () => {
    for (let attempt = 1; attempt <= manifestWriteAttempts; attempt += 1) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- a retry is by definition sequential
        const result = await store.commitManifest(locator, bytes, expected);
        return result === 'lost' ? undefined : result;
      } catch (error) {
        if (isRateLimited(error) && attempt < manifestWriteAttempts) {
          // oxlint-disable-next-line no-await-in-loop -- same reason
          await delay(200 * 3 ** (attempt - 1));
          continue;
        }
        return undefined;
      }
    }
    return undefined;
  });

  return won ?? timed(args.onPhase, 'manifest_read', async () => reconcile({ store, locator, bytes, hydrated }));
};

/**
 * What a write that did not certainly win actually did.
 *
 * Three things reach here and none of them means "the manifest is unchanged".
 * A `lost` result may be a *won* write the AWS SDK retried after a transport
 * error, whose retry then failed its own precondition (W1's hand-off). A throw
 * may be a write that reached the backend while its response did not. And an
 * exhausted rate limit is a lost race for the client's purposes — 503 and
 * retry — not a transport error to propagate as a 500.
 *
 * So the committer reads the manifest back and compares bytes before it
 * classifies anything. If the store holds what it sent, it won. If the store
 * holds a different *incarnation*, the repository was purged and re-registered
 * under the lease, which is not retryable at all (AR-A E7).
 */
const reconcile = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  bytes: ManifestBytes;
  hydrated: Manifest | undefined;
}): Promise<CommitToken> => {
  const { store, locator, bytes, hydrated } = args;
  const current = await store.readManifest(locator);
  if (current !== undefined && Buffer.from(current.manifest).equals(Buffer.from(bytes))) {
    return current.token;
  }
  if (current !== undefined && isTombstoned(decodeManifest(current.manifest))) {
    throw new RepositoryStoreError('tombstoned', 'This project has been deleted.');
  }
  if (current !== undefined && hydrated !== undefined) {
    try {
      assertSameIncarnation(hydrated, decodeManifest(current.manifest));
    } catch (error) {
      if (error instanceof ManifestError && error.code === 'incarnation-changed') {
        throw new RepositoryStoreError('incarnation-changed', error.message, { cause: error });
      }
      throw error;
    }
  }

  throw new RepositoryStoreError(
    'lost',
    `another writer committed ${locator.projectId} first; this push is not durable`,
  );
};

/**
 * Writes the tombstone manifest (D10, NI12). It goes through the same
 * conditional write as a push, which is the whole point: it fences every
 * in-flight writer *and* any creator of a new generation 1, so a project id
 * cannot be deleted and re-registered onto the bytes that are about to be
 * purged. Only after this does W6's purge job touch a byte.
 */
export const commitTombstone = async (
  args: {
    store: RepositoryStore;
    locator: RepositoryLocator;
    committedBy: string;
    erasureVerified?: boolean;
    at?: Date;
  },
  signal?: AbortSignal,
): Promise<{ manifest: Manifest; token: CommitToken }> => {
  signal?.throwIfAborted();
  const at = args.at ?? new Date();
  const read = await args.store.readManifest(args.locator, signal);
  const current = read === undefined ? undefined : decodeManifest(read.manifest);

  if (current !== undefined && isTombstoned(current)) {
    return { manifest: current, token: read?.token ?? { token: '' } };
  }

  const next =
    current === undefined
      ? succeedManifest(
          undefined,
          {
            refs: {},
            packs: [],
            committedBy: args.committedBy,
            tombstone: {
              tombstonedAt: at.toISOString(),
              purgeAfter: new Date(
                at.getTime() + (args.erasureVerified === true ? 0 : retentionWindowMilliseconds),
              ).toISOString(),
            },
          },
          at,
        )
      : tombstoneManifest(current, {
          committedBy: args.committedBy,
          at,
          ...(args.erasureVerified === undefined ? {} : { erasureVerified: args.erasureVerified }),
        });

  await writeSpilledPushLog({
    store: args.store,
    locator: args.locator,
    base: current,
    next,
    ...(signal === undefined ? {} : { signal }),
  });
  signal?.throwIfAborted();
  const token = await args.store.commitManifest(args.locator, encodeManifest(next), read?.token ?? 'absent', signal);
  if (token === 'lost') {
    throw new RepositoryStoreError('lost', `another writer changed ${args.locator.projectId} before the tombstone`);
  }

  return { manifest: next, token };
};
