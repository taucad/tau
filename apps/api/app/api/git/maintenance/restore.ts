import { createHash, randomBytes } from 'node:crypto';
import { buffer } from 'node:stream/consumers';
import { RepositoryStoreError } from '#api/git/store/errors.js';
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
 *   stay exactly where they are; they age out under the ordinary retention
 *   rules (NI4). A restore that turns out to be wrong is undone by restoring
 *   again, not by recovering deleted bytes.
 * - **It rolls forward.** The new manifest carries a generation above both
 *   stores' and a fresh incarnation nonce, so a lease that was open across the
 *   restore loses its conditional write and is told the repository was
 *   re-created rather than silently committing over the restored refs (NI6,
 *   AR-A E7).
 * - **It verifies before it writes.** Every pack is checked against the hash
 *   git put in its own name before a byte reaches the primary, so a corrupted
 *   or truncated source object fails the restore instead of becoming the
 *   repository.
 */

export type RestoreArguments = {
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

const readAll = async (
  store: RepositoryStore,
  locator: RepositoryLocator,
  key: string,
): Promise<Uint8Array<ArrayBuffer>> => {
  const bytes = await buffer(await store.getObject(locator, key));
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength) as Uint8Array<ArrayBuffer>;
};

/**
 * A pack's own checksum, which git also uses as its file name: the trailing
 * hash of a pack file is the digest of everything before it, and `pack-<hash>`
 * repeats it. Checking the bytes against the key therefore proves both that
 * the object is intact and that it is the object the manifest asked for —
 * without trusting the store, the transport or the copier.
 */
const assertPackMatchesKey = (key: string, bytes: Uint8Array<ArrayBuffer>): void => {
  const named = packHashPattern.exec(key)?.[1];
  if (named === undefined) {
    throw new RepositoryStoreError('missing-pack', `pack key '${key}' does not carry the hash git named it with`);
  }

  const digest = createHash('sha1')
    .update(bytes.subarray(0, bytes.length - packTrailerBytes))
    .digest('hex');
  const declared = Buffer.from(bytes.subarray(bytes.length - packTrailerBytes)).toString('hex');

  if (digest !== named || declared !== named) {
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
const readSourceManifest = async (args: RestoreArguments): Promise<Manifest> => {
  const read = await args.source.readManifest(args.locator);
  if (read === undefined) {
    throw new RepositoryStoreError('missing-pack', `the source store holds no manifest for ${args.locator.projectId}`);
  }
  return decodeManifest(read.manifest);
};

/** Copies one pack, and its stored index when the source kept one, into the primary. */
const restorePack = async (args: RestoreArguments, pack: ManifestPack): Promise<ManifestPack> => {
  const body = await readAll(args.source, args.locator, pack.key);
  assertPackMatchesKey(pack.key, body);

  const key = restoredKey(pack.key);
  await args.primary.putObject(args.locator, key, body, {
    contentLength: body.byteLength,
    sha256: createHash('sha256').update(body).digest('base64'),
  });

  if (pack.indexStored) {
    const index = await readAll(args.source, args.locator, indexKeyOf(pack.key));
    await args.primary.putObject(args.locator, indexKeyOf(key), index, {
      contentLength: index.byteLength,
      sha256: createHash('sha256').update(index).digest('base64'),
    });
  }

  args.report?.(`restored ${pack.key} -> ${key} (${String(body.byteLength)} bytes)`);
  return { key, bytes: pack.bytes, indexStored: pack.indexStored };
};

export const restoreRepository = async (args: RestoreArguments): Promise<RestoreResult> => {
  assertSingletonProcessGroup();

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
    // oxlint-disable-next-line no-await-in-loop -- one pack in memory at a time, as hydration does
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
  const next = succeedManifest(base, {
    refs: source.refs,
    packs,
    retired: [],
    committedBy: `restore:${args.operator}`,
    incarnation: newIncarnation(),
    tombstone: null,
  });

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
