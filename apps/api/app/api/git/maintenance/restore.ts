import type { Database } from '#database/owner-lock.js';
import { assertActiveProjectLocked } from '#database/project-lifecycle.js';
import { createHash, randomBytes } from 'node:crypto';
import type { Readable } from 'node:stream';
import { repositoryLocator } from '#api/git/store/locator.js';
import { writeSpilledPushLog } from '#api/git/store/commit.js';
import { RepositoryStoreError } from '#api/git/store/errors.js';
import { markRetired } from '#api/git/store/sweep.js';
import {
  decodeManifest,
  encodeManifest,
  isTombstoned,
  newIncarnation,
  succeedManifest,
} from '#api/git/store/manifest.js';
import type { Manifest, ManifestPack } from '#api/git/store/manifest.js';
import type { RepositoryLocator, RepositoryStore } from '#api/git/store/port.js';
import { assertSingletonProcessGroup } from '#api/git/maintenance/singleton.js';

/**
 * Restore: rebuild a repository in the primary store from a manifest and the
 * packs it names, held anywhere the port can reach (charter W6, S6, NI7).
 *
 * This is the half of the independent copy that ships now. The copy job is
 * deferred to DG1, and when it lands nothing here changes: `source` is a
 * `RepositoryStore` over another account, so pointing at B2 is a locator and a
 * credential, never a mechanism.
 *
 * Three properties make a restore safe to run against a live primary:
 *
 * - **It never deletes.** The primary's own packs and its previous manifest
 *   stay exactly where they are; the packs that manifest listed are marked
 *   retired, so they age out under the ordinary retention rules (NI4) rather
 *   than as orphans. A restore that turns out to be wrong is undone by
 *   restoring again, not by recovering deleted bytes.
 * - **It rolls forward.** The new manifest carries a generation above both
 *   stores' and a fresh incarnation nonce, so a lease that was open across the
 *   restore loses its conditional write and is told the repository was
 *   re-created rather than silently committing over the restored refs (NI6,
 *   AR-A E7).
 * - **It verifies before it writes.** Every pack is checked against the hash
 *   git put in its own name before a byte reaches the primary, so a corrupted
 *   or truncated source object fails the restore instead of becoming the
 *   repository.
 *
 * It streams (DA4): each object is read twice and held never. The first read
 * verifies it and takes its SHA-256; the second is uploaded under that digest,
 * which the primary checks against what it receives (above the single-part
 * ceiling the adapter checks it before completing). A source that answers the
 * second read with different bytes is therefore refused, not restored, and
 * memory does not grow with the pack: the maintenance VM is 512 MB and a pack
 * at the D20 ceiling is a gigabyte. The price is reading every object twice
 * from the source, which doubles a restore's source egress.
 */

export type RestoreArguments = {
  database: Database;
  /** The store holding the copy. At DG1 this is B2; today it is a second bucket. */
  source: RepositoryStore;
  /** The store the repository is restored into. */
  primary: RepositoryStore;
  locator: RepositoryLocator;
  /** Named in `committedBy` as `restore:<operator>`, so the roll-forward is attributable (I6). */
  operator: string;
  report?: (line: string) => void;
};

export type RestoreResult = {
  manifest: Manifest;
  /** The keys the restored packs were written under in the primary. */
  packs: readonly string[];
  sourceGeneration: number;
};

/** `pack-<40 hex>` out of a `packs/…` key: the SHA-1 git derived the name from. */
const packHashPattern = /^packs\/pack-([\da-f]{40})-/u;

/** Bytes of a pack's trailing checksum, which is its name. SHA-1, as every Tau repository is. */
const packTrailerBytes = 20;

/**
 * One streamed read of a stored object: its length, its SHA-256 for the
 * upload, and git's pack checksum — the SHA-1 of everything before the last
 * 20 bytes, and those 20 bytes. The trailer is held back a chunk at a time, so
 * the read never holds more than one chunk and 20 bytes.
 */
type Scanned = { bytes: number; sha256: string; packDigest: string; packTrailer: string };

const scan = async (body: Readable): Promise<Scanned> => {
  const sha256 = createHash('sha256');
  const sha1 = createHash('sha1');
  let held = Buffer.alloc(0);
  let bytes = 0;
  for await (const chunk of body) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('unexpected readable chunk');
    }
    sha256.update(chunk);
    bytes += chunk.byteLength;
    if (chunk.byteLength >= packTrailerBytes) {
      sha1.update(held);
      sha1.update(chunk.subarray(0, chunk.byteLength - packTrailerBytes));
      // A copy, so the 20 held bytes do not keep the whole chunk alive.
      held = Buffer.from(chunk.subarray(chunk.byteLength - packTrailerBytes));
      continue;
    }
    const pending = Buffer.concat([held, chunk]);
    const release = Math.max(0, pending.byteLength - packTrailerBytes);
    sha1.update(pending.subarray(0, release));
    held = pending.subarray(release);
  }
  return {
    bytes,
    sha256: sha256.digest('base64'),
    packDigest: sha1.digest('hex'),
    packTrailer: held.byteLength === packTrailerBytes ? held.toString('hex') : '',
  };
};

/**
 * A pack's own checksum, which git also uses as its file name: the trailing
 * hash of a pack file is the digest of everything before it, and `pack-<hash>`
 * repeats it. Checking the bytes against the key therefore proves both that
 * the object is intact and that it is the object the manifest asked for —
 * without trusting the store, the transport or the copier.
 */
const assertPackMatchesKey = (key: string, scanned: Scanned): void => {
  const named = packHashPattern.exec(key)?.[1];
  if (named === undefined) {
    throw new RepositoryStoreError('missing-pack', `pack key '${key}' does not carry the hash git named it with`);
  }

  if (scanned.packDigest !== named || scanned.packTrailer !== named) {
    throw new RepositoryStoreError('missing-pack', `pack '${key}' does not hash to the name it is stored under`);
  }
};

/** `packs/pack-<hash>-<nonce>.pack`, unique to this upload as every pack key is (NI4). */
const restoredKey = (sourceKey: string): string =>
  `packs/pack-${packHashPattern.exec(sourceKey)?.[1] ?? ''}-${randomBytes(8).toString('hex')}.pack`;

const indexKeyOf = (packKey: string): string => `${packKey.slice(0, -'.pack'.length)}.idx`;

/**
 * The manifest to restore from: the source store's current one.
 *
 * DG1's copy job also keeps every manifest it saw under
 * `manifests/<generation>-<token>.json` (D11), and restoring from a named
 * generation belongs with the writer that makes those keys exist. Nothing
 * writes them today, so there is nothing here to read them.
 */
/** The source adapter is explicitly selected by the operator, independent of the primary account. */
const sourceLocator = (args: RestoreArguments): RepositoryLocator =>
  repositoryLocator({ ownerId: args.locator.ownerId, projectId: args.locator.projectId });

const readSourceManifest = async (args: RestoreArguments): Promise<Manifest> => {
  const read = await args.source.readManifest(sourceLocator(args));
  if (read === undefined) {
    throw new RepositoryStoreError('missing-pack', `the source store holds no manifest for ${args.locator.projectId}`);
  }
  return decodeManifest(read.manifest);
};

/**
 * Copies one source object to `target` in the primary in two streamed reads,
 * the second pinned to the first's SHA-256. `verify` sees the first read
 * before anything is written.
 */
const copyObject = async (
  args: RestoreArguments,
  copy: { from: string; to: string; verify?: (scanned: Scanned) => void },
): Promise<Scanned> => {
  const read = async (): Promise<Readable> => args.source.getObject(sourceLocator(args), copy.from);
  const scanned = await scan(await read());
  copy.verify?.(scanned);
  await args.primary.putObject(args.locator, copy.to, read, { contentLength: scanned.bytes, sha256: scanned.sha256 });
  return scanned;
};

/** Copies one pack, and its stored index when the source kept one, into the primary. */
const restorePack = async (args: RestoreArguments, pack: ManifestPack): Promise<ManifestPack> => {
  const key = restoredKey(pack.key);
  const scanned = await copyObject(args, {
    from: pack.key,
    to: key,
    verify: (first) => {
      assertPackMatchesKey(pack.key, first);
    },
  });

  if (pack.indexStored) {
    await copyObject(args, { from: indexKeyOf(pack.key), to: indexKeyOf(key) });
  }

  args.report?.(`restored ${pack.key} -> ${key} (${String(scanned.bytes)} bytes)`);
  return { key, bytes: pack.bytes, indexStored: pack.indexStored };
};

export const restoreRepository = async (args: RestoreArguments): Promise<RestoreResult> => {
  assertSingletonProcessGroup();
  return args.database.transaction(async (transaction) => {
    // Operator restore holds only the project lock. Never acquire owner after it.
    await assertActiveProjectLocked(transaction, args.locator.projectId);
    return restoreActiveRepository(args);
  });
};

const restoreActiveRepository = async (args: RestoreArguments): Promise<RestoreResult> => {
  const source = await readSourceManifest(args);
  if (isTombstoned(source)) {
    throw new RepositoryStoreError('tombstoned', `the source manifest for ${args.locator.projectId} is tombstoned`);
  }

  const read = await args.primary.readManifest(args.locator);
  const current = read === undefined ? undefined : decodeManifest(read.manifest);
  if (isTombstoned(current)) {
    throw new RepositoryStoreError(
      'tombstoned',
      `${args.locator.projectId} is tombstoned in the primary; a purged repository is not restored by this command`,
    );
  }

  args.report?.(
    `restoring ${args.locator.ownerId}/${args.locator.projectId} from generation ${String(source.generation)}: ${String(source.packs.length)} packs, ${String(Object.keys(source.refs).length)} refs`,
  );

  const packs: ManifestPack[] = [];
  for (const pack of source.packs) {
    // oxlint-disable-next-line no-await-in-loop -- one pack in flight at a time, as hydration does
    packs.push(await restorePack(args, pack));
  }

  /*
   * `succeedManifest` increments its base's generation, and the roll-forward has
   * to clear both stores: a primary that raced ahead of the copy, and a copy
   * ahead of a primary that lost its manifest. The base is therefore whichever
   * manifest the refs are not coming from, carrying the higher of the two
   * generations.
   */
  const base: Manifest = { ...(current ?? source), generation: Math.max(current?.generation ?? 0, source.generation) };
  const at = new Date();
  const next = succeedManifest(
    base,
    {
      refs: source.refs,
      packs,
      committedBy: `restore:${args.operator}`,
      incarnation: newIncarnation(),
      tombstone: null,
    },
    at,
  );

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

  args.report?.(`committed generation ${String(next.generation)} under incarnation ${next.incarnation}`);
  return { manifest: next, packs: packs.map((pack) => pack.key), sourceGeneration: source.generation };
};
