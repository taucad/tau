/* oxlint-disable new-cap -- NestJS's Logger is a class the module instantiates once */
import { createHash, randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { CommitToken, ManifestBytes, RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { compactLease, shouldCompact } from '#api/git/store/compaction.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import type { FaultInjector } from '#api/git/store/fault-points.js';
import { readLeaseReferences, runGit } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';
import {
  commitDeadlineMilliseconds,
  livePackBound,
  repositoryByteCeiling,
  retentionWindowMilliseconds,
} from '#api/git/store/limits.js';
import {
  ManifestError,
  assertGenerationSucceeds,
  assertSameIncarnation,
  decodeManifest,
  indexKeyFor,
  encodeManifest,
  isTombstoned,
  succeedManifest,
  tombstoneManifest,
} from '#api/git/store/manifest.js';
import type { Manifest, ManifestPack, RetiredPack } from '#api/git/store/manifest.js';
import { sweepRepository } from '#api/git/store/sweep.js';

/**
 * The commit protocol: what happens after stock `receive-pack` exits and
 * before the client is acknowledged (north star write path, steps 5–7).
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
      readonly compacted: boolean;
      readonly swept: readonly string[];
      /** The ref-map difference this commit recorded. */
      readonly moved: readonly MovedRef[];
    };

export type CommitLeaseArguments = {
  store: RepositoryStore;
  lease: RepositoryLease;
  /** The authenticated pusher, from the session and never from the request (NI16). */
  committedBy: string;
  /** Live packs tolerated before this committer compacts. */
  packBound?: number;
  /** Per-repository ceiling on non-LFS bytes (D20). */
  byteCeiling?: number;
  /** The clock, injectable so the retention and orphan windows are testable. */
  now?: () => Date;
  /** Epoch milliseconds. Past it the push is abandoned without a manifest write (NI5). */
  deadlineAt?: number;
  faults?: FaultInjector;
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

/** Attempts at a rate-limited manifest write: the first, then two retries at 200 ms and 600 ms. */
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

/**
 * The D20 ceiling, as a backstop behind `pre-receive`: the hook measures what
 * this push added, and this measures what the repository would then hold.
 */
const assertWithinCeiling = (
  live: ReadonlyArray<{ bytes: number }>,
  uploads: ReadonlyArray<{ bytes: number }>,
  byteCeiling: number,
): void => {
  const committedBytes =
    live.reduce((total, pack) => total + pack.bytes, 0) + uploads.reduce((total, upload) => total + upload.bytes, 0);
  if (committedBytes > byteCeiling) {
    throw new RepositoryStoreError(
      'ceiling-exceeded',
      `the repository would hold ${String(committedBytes)} bytes, past the ${String(byteCeiling)}-byte ceiling`,
    );
  }
};

/** Everything this module logs: a sweep that could not finish, and nothing else. */
const logger = new Logger('RepositoryCommit');

/** `packs/<git pack name>-<upload nonce>.pack`: unique to this upload, always (D16, NI4). */
const uploadKeyFor = (packFile: string): string =>
  `packs/${packFile.slice(0, -'.pack'.length)}-${randomBytes(8).toString('hex')}.pack`;

/**
 * Commits whatever the push left in the lease, or nothing.
 *
 * The caller withholds the entire HTTP response — headers included — until
 * this resolves (D4, NI2). A thrown `RepositoryStoreError` with code `lost` is
 * the 503 signal; every other code is a refusal the client should see.
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

  const references = await readLeaseReferences(lease.directory);
  if (sameReferences(references, lease.manifest?.refs ?? {})) {
    return { committed: false, reason: 'no-ref-change' };
  }

  await assertCommittable(lease);

  const hydrated = lease.manifest?.packs ?? [];
  const inLease = await packFilesIn(lease.directory);
  const arrived = inLease.filter((name) => !lease.hydratedPackFiles.has(name));

  const { compacted, keptPack, toUpload, retainedLive } = await planPacks({
    lease,
    hydrated,
    arrived,
    packBound,
    ...(args.faults === undefined ? {} : { faults: args.faults }),
  });
  const uploads = await Promise.all(
    toUpload.map(async (name) => {
      const file = path.join(lease.directory, 'objects/pack', name);
      const stats = await stat(file);
      return { name, bytes: stats.size, file };
    }),
  );
  assertWithinCeiling(retainedLive, uploads, byteCeiling);

  const uploaded: ManifestPack[] = [];
  for (const upload of uploads) {
    assertDeadline();
    // oxlint-disable-next-line no-await-in-loop -- one pack at a time bounds worker memory
    const pack = await uploadPack(store, lease.locator, upload);
    uploaded.push(pack);
  }
  await args.faults?.('after-pack-upload');

  const retiredNow: RetiredPack[] = hydrated
    .filter((pack) => compacted && pack.key !== keptPack?.key)
    .map((pack) => ({ key: pack.key, retiredAt: at.toISOString() }));
  const previouslyRetired = lease.manifest?.retired ?? [];
  const keptRetired = previouslyRetired.filter(
    (entry) => at.getTime() - Date.parse(entry.retiredAt) <= retentionWindowMilliseconds,
  );
  const droppedRetired = previouslyRetired.filter((entry) => !keptRetired.includes(entry)).map((entry) => entry.key);

  const next = succeedManifest(
    lease.manifest,
    {
      refs: references,
      packs: [...retainedLive, ...uploaded],
      retired: [...keptRetired, ...retiredNow],
      committedBy: args.committedBy,
    },
    at,
  );

  if (lease.manifest !== undefined) {
    // A self-check on the succession this commit is about to write: the base a
    // lease hydrated from is the base the next manifest must follow (NI6).
    assertGenerationSucceeds(lease.manifest, next);
  }

  await args.faults?.('before-manifest-commit');
  assertDeadline();
  const token = await writeManifest({
    store,
    locator: lease.locator,
    next,
    expected: lease.token,
    hydrated: lease.manifest,
  });
  await args.faults?.('after-manifest-commit');

  /*
   * Past this line the push is durable and the client is owed the truth about
   * it (NI2). The sweep is housekeeping on garbage nothing reads: if it fails,
   * or the worker dies inside it, the keys it would have removed simply wait
   * for the next compacting committer. Rejecting here would tell a client its
   * committed push failed, which is the one lie this protocol must not tell.
   */
  let swept: readonly string[] = [];
  try {
    swept = await sweepRepository({
      store,
      locator: lease.locator,
      committed: next,
      droppedRetired,
      at,
      // Orphan discovery rides the listing the compacting holder is already doing.
      scanOrphans: compacted,
      ...(args.faults === undefined ? {} : { faults: args.faults }),
    });
  } catch (error) {
    logger.warn(
      `sweep after generation ${String(next.generation)} of ${lease.locator.projectId} failed; ` +
        `${String(droppedRetired.length)} retired keys and any orphans remain for the next committer: ${String(error)}`,
    );
  }

  return {
    committed: true,
    manifest: next,
    token,
    compacted,
    swept,
    moved: movedReferences(lease.manifest?.refs ?? {}, references),
  };
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
  faults?: FaultInjector;
}): Promise<{
  compacted: boolean;
  keptPack: ManifestPack | undefined;
  toUpload: readonly string[];
  retainedLive: readonly ManifestPack[];
}> => {
  if (!shouldCompact(args.hydrated.length + args.arrived.length, args.packBound)) {
    return { compacted: false, keptPack: undefined, toUpload: args.arrived, retainedLive: args.hydrated };
  }

  const keptPack = [...args.hydrated].sort((left, right) => right.bytes - left.bytes)[0];
  const keptFile = keptPack === undefined ? undefined : leasePackFile(keptPack.key);
  await compactLease(args.lease, keptFile);
  await args.faults?.('mid-compaction');

  // Every pack in the lease is now this commit's except the one `--keep-pack`
  // preserved byte-for-byte; that one stays live under the key it already has,
  // so it is neither re-uploaded nor retired.
  const remaining = await packFilesIn(args.lease.directory);
  return {
    compacted: true,
    keptPack,
    toUpload: remaining.filter((name) => name !== keptFile),
    retainedLive: keptPack === undefined ? [] : [keptPack],
  };
};

/**
 * Uploads one pack and the index beside it (D33). The stored index removes the
 * 5.0–9.0 s `index-pack` term from every later hydrate for 0.17 % more bytes.
 *
 * Consequence worth stating: a hydrate that fetches a stored index no longer
 * runs `index-pack`, which was also the only thing verifying pack bytes on the
 * way in. Corrupt pack bytes now surface as a git error on first read rather
 * than at hydration. W1's port makes the same trade for the same reason — git
 * verifies what it reads — and D33 adopts it.
 */
const uploadPack = async (
  store: RepositoryStore,
  locator: RepositoryLocator,
  upload: { name: string; bytes: number; file: string },
): Promise<ManifestPack> => {
  const key = uploadKeyFor(upload.name);
  await putFile({ store, locator, key, file: upload.file });
  await putFile({
    store,
    locator,
    key: indexKeyFor(key),
    file: `${upload.file.slice(0, -'.pack'.length)}.idx`,
  });
  return { key, bytes: upload.bytes, indexStored: true };
};

const putFile = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  key: string;
  file: string;
}): Promise<void> => {
  const { store, locator, key } = args;
  const contents = await readFile(args.file);
  // A view over the read buffer rather than a copy of it: a pack at the D20
  // ceiling is a gigabyte, and it is already in memory once.
  const body = new Uint8Array(contents.buffer, contents.byteOffset, contents.length) as Uint8Array<ArrayBuffer>;
  await store.putObject(locator, key, body, {
    contentLength: body.byteLength,
    sha256: createHash('sha256').update(body).digest('base64'),
  });
};

/** The file name a manifest key has inside a lease. */
const leasePackFile = (key: string): string => path.posix.basename(key);

/**
 * The conditional write, plus the two things the W1 hand-off says a caller
 * must do about `lost`.
 *
 * `lost` means "did not certainly win", not "certainly did not write": the AWS
 * SDK retries a PUT on a transport error, so a first attempt that landed and a
 * retry that then fails its own precondition both report `lost`. Before
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
}): Promise<CommitToken> => {
  const { store, locator, expected, hydrated } = args;
  const bytes = encodeManifest(args.next);

  for (let attempt = 1; attempt <= manifestWriteAttempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- a retry is by definition sequential
      const result = await store.commitManifest(locator, bytes, expected);
      if (result !== 'lost') {
        return result;
      }
      break;
    } catch (error) {
      if (isRateLimited(error) && attempt < manifestWriteAttempts) {
        // oxlint-disable-next-line no-await-in-loop -- same reason
        await delay(200 * 3 ** (attempt - 1));
        continue;
      }
      break;
    }
  }

  return reconcile({ store, locator, bytes, hydrated });
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
export const commitTombstone = async (args: {
  store: RepositoryStore;
  locator: RepositoryLocator;
  committedBy: string;
  erasureVerified?: boolean;
  at?: Date;
}): Promise<{ manifest: Manifest; token: CommitToken }> => {
  const at = args.at ?? new Date();
  const read = await args.store.readManifest(args.locator);
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
            retired: [],
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

  const token = await args.store.commitManifest(args.locator, encodeManifest(next), read?.token ?? 'absent');
  if (token === 'lost') {
    throw new RepositoryStoreError('lost', `another writer changed ${args.locator.projectId} before the tombstone`);
  }

  return { manifest: next, token };
};
