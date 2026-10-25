import { createHash, randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import type { Database } from '#database/owner-lock.js';
import { assertActiveProjectLocked, assertProjectActive } from '#database/project-lifecycle.js';
import { projectGit, storageTombstone } from '#database/schema.js';
import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { lfsObjectLocations, tenantLfsObjectKey } from '#api/git/lfs-keys.js';
import { writeSpilledPushLog } from '#api/git/store/commit.js';
import { repositoryLocator } from '#api/git/store/locator.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import {
  decodeManifest,
  encodeManifest,
  indexKeyFor,
  isTombstoned,
  newIncarnation,
  succeedManifest,
} from '#api/git/store/manifest.js';
import type { Manifest, ManifestPack } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { markRetired } from '#api/git/store/sweep.js';
import type { CopyReader, DestinationVersion } from '#api/git/mirror/destination.js';
import { lfsPrefix, ownerMarkerPrefix, repositoryKey, repositoryPrefix } from '#api/git/mirror/keys.js';
import {
  digestStream,
  findSnapshot,
  indexVerifies,
  lfsVerifies,
  listCopy,
  packHash,
  packVerifies,
  readSnapshot,
  snapshotVersions,
} from '#api/git/mirror/snapshots.js';
import type { CopyIndex, ObjectDigest, ReadSnapshot } from '#api/git/mirror/snapshots.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';

/**
 * DR1, restore v2: rebuild one repository in the primary from the B2 second
 * copy alone (W13 Finding 4), through the read-only restore key
 * (`TAU_S3_RESTORE_*`: listFiles, readFiles, readFileRetentions).
 *
 * It keeps v1's three safety properties (`restore.ts`): it **never deletes or
 * overwrites** (every pack lands under a fresh key, a push-log segment or LFS
 * object the primary already holds is left alone, and the superseded packs are
 * only marked retired); it **rolls forward** under a fresh incarnation and a
 * generation above every one known, which fences any open lease; and it
 * **verifies before it writes**, streaming every object twice and holding none.
 * It closes v1's gaps against B2:
 *
 * - **Discovery by version listing.** B2 holds no `manifest.json`; the snapshot
 *   is found among `manifests/<G>-<incarnation>.json` versions, hidden names
 *   included (W13 Finding 3).
 * - **The trust root.** By default only the snapshot whose SHA-256 equals
 *   `project_git.copied_manifest_sha256` is restored. Any other needs the
 *   operator to name its generation **and** its SHA-256 (`--confirm-snapshot`),
 *   which `--list` prints. Among several versions of a pack, index or LFS key,
 *   the version used is one that verifies against its name.
 * - **The push-log chain.** Restoring into an empty prefix copies the segment
 *   chain byte for byte, so the restored manifest's `earlierPushes` resolves.
 * - **LFS.** Every LFS object the copy holds for the project is restored under
 *   its tenant key, verified against its oid, unless the primary holds it.
 * - **The generation floor.** The restored generation is above the one Postgres
 *   remembers (`project_git.generation`) and any `--generation-floor`, so the
 *   API's derived-state repair sees progress rather than regression.
 * - **Erasure.** An owner with a `storage_tombstone` row, or with a `tombstone-*`
 *   marker in the copy (from B2 alone), is refused before anything is read.
 *
 * Objects are written before the project lock is taken: a restore streams for
 * longer than the role's idle-in-transaction timeout. The lock is held only
 * around the manifest commit, which re-checks the project and the owner, so a
 * restore that loses either leaves only unnamed objects for the orphan sweep.
 */

/** Where restored LFS bytes go: the primary's driver. */
export type LfsTarget = Pick<ObjectStorageService, 'putBlobStream' | 'headBlob'>;

export type CopyRestoreArguments = {
  readonly database: Database;
  readonly copy: CopyReader;
  readonly primary: RepositoryStore;
  readonly lfs: LfsTarget;
  readonly locator: RepositoryLocator;
  /** Named in `committedBy` as `restore:<operator>` (I6). */
  readonly operator: string;
  /** Restore this generation instead of the trusted one; needs `confirmSnapshot` unless it is the trusted one. */
  readonly generation?: number;
  /** The SHA-256 of the snapshot to restore when it is not the trusted one, as `--list` prints it. */
  readonly confirmSnapshot?: string;
  /** Commit above this generation too. */
  readonly generationFloor?: number;
  /** Plan and print; write nothing. */
  readonly dryRun?: boolean;
  readonly report?: (line: string) => void;
  readonly signal?: AbortSignal;
};

export type CopyRestorePlan = {
  readonly snapshot: {
    readonly key: string;
    readonly versionId: string;
    readonly generation: number;
    readonly incarnation: string;
    readonly sha256: string;
    readonly trusted: boolean;
  };
  readonly packs: number;
  readonly packBytes: number;
  /** Segments the restore copies: the chain, when the primary has no manifest of its own. */
  readonly segments: number;
  readonly lfs: number;
  readonly lfsBytes: number;
  readonly floor: number;
  readonly nextGeneration: number;
};

export type CopyRestoreResult = {
  readonly plan: CopyRestorePlan;
  /** The committed manifest; `undefined` on a dry run. */
  readonly manifest?: Manifest;
  readonly packs: readonly string[];
  readonly segments: readonly string[];
  readonly lfs: { readonly restored: number; readonly present: number };
};

export type ListedSnapshot = {
  readonly generation: number;
  readonly incarnation: string;
  readonly versionId: string;
  readonly modifiedAt: string | undefined;
  readonly bytes: number;
  /** Empty when the version could not be read as a manifest of its key. */
  readonly sha256: string;
  readonly trusted: boolean;
};

const oidPattern = /^[\da-f]{64}$/u;

const segmentByteLimit = 1024 * 1024;

const chainLimit = 100_000;

type Row = { generation: number; copiedGeneration: number; copiedManifestSha256: string | undefined };

const readRow = async (database: Database, projectId: string): Promise<Row | undefined> => {
  const [row] = await database
    .select({
      generation: projectGit.generation,
      copiedGeneration: projectGit.copiedGeneration,
      copiedManifestSha256: projectGit.copiedManifestSha256,
    })
    .from(projectGit)
    .where(eq(projectGit.projectId, projectId))
    .limit(1);
  return row === undefined ? undefined : { ...row, copiedManifestSha256: row.copiedManifestSha256 ?? undefined };
};

/**
 * Refuses an erased or deleted owner: from Postgres when it has the row, and
 * from the copy alone when it does not. Any version under the owner's marker
 * prefix counts, a hidden one too: hiding a marker must not resurrect an owner.
 */
const refuseErased = async (
  args: Pick<CopyRestoreArguments, 'database' | 'copy' | 'locator' | 'signal'>,
): Promise<void> => {
  const [tombstone] = await args.database
    .select({ ownerId: storageTombstone.ownerId })
    .from(storageTombstone)
    .where(eq(storageTombstone.ownerId, args.locator.ownerId))
    .limit(1);
  if (tombstone !== undefined) {
    throw new RepositoryStoreError(
      'tombstoned',
      `${args.locator.ownerId} has a storage_tombstone row: a deleted or erased owner is never restored`,
    );
  }
  for await (const version of args.copy.listVersions(ownerMarkerPrefix(args.locator.ownerId), args.signal)) {
    throw new RepositoryStoreError(
      'tombstoned',
      `${args.locator.ownerId} has a tombstone marker in the copy (${version.key}): a deleted or erased owner is never restored`,
    );
  }
};

/** Every project of `ownerId` the copy holds a snapshot for, by version listing, sorted. */
export const copiedProjects = async (copy: CopyReader, ownerId: string, signal?: AbortSignal): Promise<string[]> => {
  const prefix = `tenants/${repositoryLocator({ ownerId, projectId: 'owner' }).ownerId}/repos/`;
  const projects = new Set<string>();
  for await (const version of copy.listVersions(prefix, signal)) {
    const projectId = /^([^/]+)\/manifests\//u.exec(version.key.slice(prefix.length))?.[1];
    if (projectId !== undefined) {
      projects.add(projectId);
    }
  }
  return [...projects].sort();
};

/** Every snapshot version the copy holds for the repository, newest first, each read and hashed. */
export const listCopySnapshots = async (
  args: Pick<CopyRestoreArguments, 'database' | 'copy' | 'locator' | 'signal'>,
): Promise<ListedSnapshot[]> => {
  const row = await readRow(args.database, args.locator.projectId);
  const index = await listCopy(args.copy, `${repositoryPrefix(args.locator)}manifests/`, args.signal);
  const listed: ListedSnapshot[] = [];
  for (const version of snapshotVersions(args.locator, index)) {
    // oxlint-disable-next-line no-await-in-loop -- small objects, listed for an operator
    const read = await readSnapshot(args.copy, version, args.signal).catch(() => undefined);
    listed.push({
      generation: version.generation,
      incarnation: version.incarnation,
      versionId: version.versionId,
      modifiedAt: version.modifiedAt?.toISOString(),
      bytes: version.bytes,
      sha256: read?.sha256Hex ?? '',
      trusted: read !== undefined && read.sha256Hex === row?.copiedManifestSha256,
    });
  }
  return listed;
};

/** The snapshot to restore: the trusted one, or the operator's named and confirmed one. */
const chooseSnapshot = async (
  args: CopyRestoreArguments,
  index: CopyIndex,
  row: Row | undefined,
): Promise<ReadSnapshot> => {
  const all = snapshotVersions(args.locator, index);
  const trusted = row?.copiedManifestSha256;
  const newest = all[0]?.generation;
  if (args.generation === undefined) {
    const found =
      trusted === undefined
        ? undefined
        : await findSnapshot(
            args.copy,
            [
              ...all.filter((version) => version.generation === row?.copiedGeneration),
              ...all.filter((version) => version.generation !== row?.copiedGeneration),
            ],
            trusted,
            args.signal,
          );
    if (found === undefined) {
      throw new RepositoryStoreError(
        'missing-pack',
        `no snapshot of ${args.locator.projectId} in the copy has the SHA-256 Postgres recorded (copied_manifest_sha256); newest generation found: ${String(newest ?? 'none')}. List them with --list and name one with --generation and --confirm-snapshot`,
      );
    }
    return found;
  }
  const named = all.filter((version) => version.generation === args.generation);
  if (trusted !== undefined) {
    const found = await findSnapshot(args.copy, named, trusted, args.signal);
    if (found !== undefined) {
      return found;
    }
  }
  if (args.confirmSnapshot !== undefined) {
    const found = await findSnapshot(args.copy, named, args.confirmSnapshot, args.signal);
    if (found !== undefined) {
      return found;
    }
  }
  throw new RepositoryStoreError(
    'missing-pack',
    `generation ${String(args.generation)} of ${args.locator.projectId} is not the snapshot the copier recorded: restoring it needs --confirm-snapshot <sha256> naming one of its versions (--list prints them)`,
  );
};

/** Two streamed reads of one copy version: the first verified by `accepts`, the second written by `write`. */
type Candidate = { version: DestinationVersion; digest: ObjectDigest };

// oxlint-disable-next-line max-params -- one key of one listing, under one rule
const firstVerifying = async (
  args: CopyRestoreArguments,
  versions: readonly DestinationVersion[],
  accepts: (digest: ObjectDigest, version: DestinationVersion) => boolean,
  label: string,
): Promise<Candidate | undefined> => {
  for (const version of versions) {
    args.signal?.throwIfAborted();
    // oxlint-disable-next-line no-await-in-loop -- one version at a time, newest first
    const digest = await digestStream(await args.copy.get(version.key, version.versionId, args.signal));
    if (accepts(digest, version)) {
      return { version, digest };
    }
    args.report?.(`skipped version ${version.versionId} of ${label}: it does not verify`);
  }
  return undefined;
};

const reopen = (args: CopyRestoreArguments, version: DestinationVersion) => async (): Promise<Readable> =>
  args.copy.get(version.key, version.versionId, args.signal);

const base64Of = (hex: string): string => Buffer.from(hex, 'hex').toString('base64');

/** `packs/pack-<hash>-<nonce>.pack`, unique to this upload as every pack key is (NI4). */
const restoredPackKey = (sha1: string): string => `packs/pack-${sha1}-${randomBytes(8).toString('hex')}.pack`;

const restorePack = async (args: CopyRestoreArguments, pack: ManifestPack, index: CopyIndex): Promise<ManifestPack> => {
  const sha1 = packHash(pack.key);
  if (sha1 === undefined) {
    throw new RepositoryStoreError('missing-pack', `pack key '${pack.key}' does not carry the hash git named it with`);
  }
  const chosen = await firstVerifying(
    args,
    index.versions.get(repositoryKey(args.locator, pack.key)) ?? [],
    (digest) => packVerifies(digest, sha1, pack.bytes),
    pack.key,
  );
  if (chosen === undefined) {
    throw new RepositoryStoreError('missing-pack', `no version of '${pack.key}' in the copy hashes to its name`);
  }
  const key = restoredPackKey(sha1);
  await args.primary.putObject(args.locator, key, reopen(args, chosen.version), {
    contentLength: chosen.digest.bytes,
    sha256: Buffer.from(chosen.digest.sha256Hex, 'hex').toString('base64'),
  });
  let indexStored = false;
  if (pack.indexStored) {
    const stored = await firstVerifying(
      args,
      index.versions.get(repositoryKey(args.locator, indexKeyFor(pack.key))) ?? [],
      (digest) => indexVerifies(digest, sha1),
      indexKeyFor(pack.key),
    );
    if (stored === undefined) {
      // Hydration rebuilds an index the manifest does not claim (`index-pack`), so the pack still restores.
      args.report?.(`no version of ${indexKeyFor(pack.key)} verifies: restoring ${pack.key} without its index`);
    } else {
      await args.primary.putObject(args.locator, indexKeyFor(key), reopen(args, stored.version), {
        contentLength: stored.digest.bytes,
        sha256: Buffer.from(stored.digest.sha256Hex, 'hex').toString('base64'),
      });
      indexStored = true;
    }
  }
  args.report?.(`restored ${pack.key} -> ${key} (${String(chosen.digest.bytes)} bytes)`);
  return { key, bytes: pack.bytes, indexStored };
};

const readSegment = async (
  args: CopyRestoreArguments,
  version: DestinationVersion,
): Promise<{ bytes: Uint8Array<ArrayBuffer>; previous: string | undefined } | undefined> => {
  if (version.bytes > segmentByteLimit) {
    return undefined;
  }
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of await args.copy.get(version.key, version.versionId, args.signal)) {
    chunks.push(Buffer.from(chunk as Uint8Array<ArrayBuffer>));
  }
  const bytes = new Uint8Array(Buffer.concat(chunks));
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { previous?: unknown; pushes?: unknown };
    if (!Array.isArray(parsed.pushes)) {
      return undefined;
    }
    if (parsed.previous === null || parsed.previous === undefined) {
      return { bytes, previous: undefined };
    }
    return typeof parsed.previous === 'string' && /^pushes\/[\w.-]+\.json$/u.test(parsed.previous)
      ? { bytes, previous: parsed.previous }
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The push-log chain from `earlierPushes` to its first segment, as the copy
 * holds it. A segment names no hash, so the version used is the **oldest** that
 * parses: the copier writes each segment key once, and a later version is not
 * the copier's.
 */
const readChain = async (
  args: CopyRestoreArguments,
  manifest: Manifest,
  index: CopyIndex,
): Promise<Array<{ key: string; bytes: Uint8Array<ArrayBuffer> }>> => {
  const chain: Array<{ key: string; bytes: Uint8Array<ArrayBuffer> }> = [];
  const seen = new Set<string>();
  let next = manifest.earlierPushes ?? undefined;
  while (next !== undefined) {
    if (seen.has(next) || seen.size >= chainLimit) {
      throw new RepositoryStoreError(
        'missing-pack',
        `the push-log chain of ${args.locator.projectId} loops at '${next}'`,
      );
    }
    seen.add(next);
    const versions = [...(index.versions.get(repositoryKey(args.locator, next)) ?? [])].reverse();
    let found: { bytes: Uint8Array<ArrayBuffer>; previous: string | undefined } | undefined;
    for (const version of versions) {
      // oxlint-disable-next-line no-await-in-loop -- segments are a few kilobytes, followed one link at a time
      found = await readSegment(args, version);
      if (found !== undefined) {
        break;
      }
    }
    if (found === undefined) {
      throw new RepositoryStoreError(
        'missing-pack',
        `the copy holds no readable '${next}': the push-log chain of ${args.locator.projectId} is incomplete`,
      );
    }
    chain.push({ key: next, bytes: found.bytes });
    next = found.previous;
  }
  return chain;
};

/** Whether the primary already holds the LFS object at either of its locations, at its size. */
// oxlint-disable-next-line max-params -- one object of one project
const primaryHoldsLfs = async (args: CopyRestoreArguments, oid: string, bytes: number): Promise<boolean> => {
  for (const location of lfsObjectLocations(args.locator.ownerId, args.locator.projectId, oid)) {
    // oxlint-disable-next-line no-await-in-loop -- the legacy key is asked only when the tenant key is absent
    const head = await args.lfs.headBlob({
      ...location,
      ...(args.signal === undefined ? {} : { signal: args.signal }),
    });
    if (head?.size === bytes) {
      return true;
    }
  }
  return false;
};

const restoreLfs = async (
  args: CopyRestoreArguments,
  index: CopyIndex,
): Promise<{ restored: number; present: number }> => {
  const prefix = lfsPrefix(args.locator);
  let restored = 0;
  let present = 0;
  for (const [key, versions] of index.versions) {
    const oid = key.slice(prefix.length);
    if (!oidPattern.test(oid)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- one object in flight
    const chosen = await firstVerifying(args, versions, (digest) => lfsVerifies(digest, oid), `LFS ${oid}`);
    if (chosen === undefined) {
      throw new RepositoryStoreError('missing-pack', `no version of LFS object ${oid} in the copy is its oid`);
    }
    // oxlint-disable-next-line no-await-in-loop -- same
    if (await primaryHoldsLfs(args, oid, chosen.digest.bytes)) {
      present += 1;
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- same
    const put = await args.lfs.putBlobStream({
      namespace: 'tenants',
      key: tenantLfsObjectKey(args.locator.ownerId, args.locator.projectId, oid),
      // oxlint-disable-next-line no-await-in-loop -- the second read, pinned to the first's digest
      body: await args.copy.get(chosen.version.key, chosen.version.versionId, args.signal),
      contentLength: chosen.digest.bytes,
      contentType: 'application/octet-stream',
      checksumSha256: base64Of(oid),
      // Create only: an object that appeared meanwhile is the same bytes, and is never overwritten.
      ifNoneMatch: '*',
      tier: 'private',
      ...(args.signal === undefined ? {} : { signal: args.signal }),
    });
    if (put.alreadyExisted) {
      present += 1;
    } else {
      restored += 1;
    }
  }
  return { restored, present };
};

/** The objects restore will write, by count and bytes, for the plan. */
const plan = (
  snapshot: ReadSnapshot,
  args: { trusted: boolean; segments: number; lfsIndex: CopyIndex; floor: number; current: Manifest | undefined },
): CopyRestorePlan => {
  const lfs = [...args.lfsIndex.versions.values()].map((versions) => versions[0]?.bytes ?? 0);
  return {
    snapshot: {
      key: snapshot.version.key,
      versionId: snapshot.version.versionId,
      generation: snapshot.manifest.generation,
      incarnation: snapshot.manifest.incarnation,
      sha256: snapshot.sha256Hex,
      trusted: args.trusted,
    },
    packs: snapshot.manifest.packs.length,
    packBytes: snapshot.manifest.packs.reduce((sum, pack) => sum + pack.bytes, 0),
    segments: args.segments,
    lfs: lfs.length,
    lfsBytes: lfs.reduce((sum, bytes) => sum + bytes, 0),
    floor: args.floor,
    nextGeneration: Math.max(args.current?.generation ?? 0, snapshot.manifest.generation, args.floor) + 1,
  };
};

/** Restores one repository from the copy. Throws, having committed nothing, on any refusal. */
export const restoreFromCopy = async (args: CopyRestoreArguments): Promise<CopyRestoreResult> => {
  assertSingletonProcessGroup();
  await assertProjectActive(args.database, args.locator.projectId);
  await refuseErased(args);
  const row = await readRow(args.database, args.locator.projectId);

  const index = await listCopy(args.copy, repositoryPrefix(args.locator), args.signal);
  const snapshot = await chooseSnapshot(args, index, row);
  if (isTombstoned(snapshot.manifest)) {
    throw new RepositoryStoreError(
      'tombstoned',
      `the snapshot of generation ${String(snapshot.manifest.generation)} is a tombstone: a purged repository is not restored`,
    );
  }
  const read = await args.primary.readManifest(args.locator, args.signal);
  const current = read === undefined ? undefined : decodeManifest(read.manifest);
  if (isTombstoned(current)) {
    throw new RepositoryStoreError(
      'tombstoned',
      `${args.locator.projectId} is tombstoned in the primary; a purged repository is not restored by this command`,
    );
  }
  const floor = Math.max(args.generationFloor ?? 0, row?.generation ?? 0);
  // Into an empty prefix the snapshot is the base, and its chain must come with it.
  const chain = current === undefined ? await readChain(args, snapshot.manifest, index) : [];
  const lfsIndex = await listCopy(args.copy, lfsPrefix(args.locator), args.signal);
  const planned = plan(snapshot, {
    trusted: snapshot.sha256Hex === row?.copiedManifestSha256,
    segments: chain.length,
    lfsIndex,
    floor,
    current,
  });
  args.report?.(
    `${args.dryRun === true ? 'would restore' : 'restoring'} ${args.locator.ownerId}/${args.locator.projectId} from snapshot generation ${String(planned.snapshot.generation)} (${planned.snapshot.trusted ? 'trusted' : 'operator-confirmed'}, sha256 ${planned.snapshot.sha256}): ${String(planned.packs)} packs (${String(planned.packBytes)} bytes), ${String(planned.segments)} push-log segments, ${String(planned.lfs)} LFS objects (${String(planned.lfsBytes)} bytes); commits generation ${String(planned.nextGeneration)} under a new incarnation`,
  );
  if (args.dryRun === true) {
    return { plan: planned, packs: [], segments: [], lfs: { restored: 0, present: 0 } };
  }

  const packs: ManifestPack[] = [];
  for (const pack of snapshot.manifest.packs) {
    // oxlint-disable-next-line no-await-in-loop -- one pack in flight at a time, as hydration does
    packs.push(await restorePack(args, pack, index));
  }
  const held = new Set<string>();
  if (chain.length > 0) {
    for await (const object of args.primary.listObjects(args.locator, 'pushes/')) {
      held.add(object.key);
    }
  }
  for (const segment of chain) {
    if (held.has(segment.key)) {
      continue;
    }
    // oxlint-disable-next-line no-await-in-loop -- a few kilobytes each
    await args.primary.putObject(args.locator, segment.key, segment.bytes, {
      contentLength: segment.bytes.byteLength,
      sha256: createHash('sha256').update(segment.bytes).digest('base64'),
    });
  }
  const lfs = await restoreLfs(args, lfsIndex);

  /*
   * As v1: the base is the primary's own manifest when it has one (its push log
   * continues), else the snapshot (whose chain was just copied), carrying the
   * highest generation known so the successor is above all of them.
   */
  const base: Manifest = {
    ...(current ?? snapshot.manifest),
    generation: Math.max(current?.generation ?? 0, snapshot.manifest.generation, floor),
  };
  const at = new Date();
  const next = succeedManifest(
    base,
    {
      refs: snapshot.manifest.refs,
      packs,
      committedBy: `restore:${args.operator}`,
      incarnation: newIncarnation(),
      tombstone: null,
    },
    at,
  );

  await args.database.transaction(async (transaction) => {
    // The project lock, held only around the commit: never the owner lock after it.
    await assertActiveProjectLocked(transaction, args.locator.projectId);
    await refuseErased({ ...args, database: transaction as unknown as Database });
    await markRetired({
      store: args.primary,
      locator: args.locator,
      packKeys: (current?.packs ?? []).map((pack) => pack.key),
      at,
    });
    await writeSpilledPushLog({ store: args.primary, locator: args.locator, base, next });
    const token = await args.primary.commitManifest(args.locator, encodeManifest(next), read?.token ?? 'absent');
    if (token === 'lost') {
      throw new RepositoryStoreError(
        'lost',
        `${args.locator.projectId} changed in the primary while it was being restored; nothing was removed, run the restore again`,
      );
    }
  });

  args.report?.(`committed generation ${String(next.generation)} under incarnation ${next.incarnation}`);
  return {
    plan: planned,
    manifest: next,
    packs: packs.map((pack) => pack.key),
    segments: chain.map((segment) => segment.key),
    lfs,
  };
};
