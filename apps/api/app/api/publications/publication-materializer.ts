/**
 * The publication materializer: one named version of a project's graph turned
 * into the sha256-keyed blobs the viewer already reads (S32, A21, D11).
 *
 * Publishing no longer uploads anything. The bytes reach the server with the
 * push — LFS objects included — so this reads the tagged tree out of a **lease
 * directory**, resolves any LFS pointer to the object R2 holds, and writes
 * exactly what the multipart path used to write: content-addressed blobs, their
 * reference counts, and the `path → sha256` manifest. The CDN URLs public
 * viewers get and the grant-rechecking proxy private viewers get are therefore
 * untouched, which is the whole of AC13's "nothing else changes on the serving
 * path".
 *
 * Nothing here owns a repository. A lease is hydrated from the manifest by the
 * caller, handed over, and disposed when the caller is done with it (charter
 * D9, NI1): the git service materializes inside the lease it just committed,
 * and `PublicationsService` hydrates a read lease of its own when a publication
 * it is serving is behind the manifest (D19). There is no spool, no boot sweep
 * and no path on disk that survives a request.
 *
 * This is a **function module, not a provider**: a provider would need
 * `GitModule` and `PublicationsModule` to import each other.
 */

import { execFile } from 'node:child_process';
import type { Readable } from 'node:stream';
import { promisify } from 'node:util';
import { and, eq, gt, sql } from 'drizzle-orm';
import {
  isPublicationSystemArtifact,
  publicationApiCode,
  publicationMaxUserFiles,
  publishForbiddenPathPrefixes,
  isPublishableTauPath,
} from '@taucad/types/constants';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '#database/database.service.js';
import * as schema from '#database/schema.js';
import { detectKernelIdsFromRelativePaths, resolveRuntimePin } from '#api/publications/publication-runtime.utils.js';
import type { StoredPublicationManifest } from '#api/publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#api/publications/publications.dto.js';
import { isS3ObjectMissing } from '#storage/object-storage.service.js';
import type { ObjectStorageService, StorageTier } from '#storage/object-storage.service.js';
import type { StorageNamespace } from '#storage/storage.constants.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';

const execFileAsync = promisify(execFile);

/** Everything this module logs: an over-release, and nothing else. */
const logger = new Logger('PublicationMaterializer');

/** Per-file ceiling, unchanged from the upload path. */
export const maxBytesPerPublishedFile = 25 * 1024 * 1024;
/** Whole-publication ceiling, unchanged from the upload path. */
export const maxPublishedTotalBytes = 50 * 1024 * 1024;

/**
 * One bounded `git` invocation inside a lease directory.
 *
 * Supplied by the caller rather than spawned here, so a caller that counts its
 * git children — the smart-HTTP route does — counts these too rather than
 * letting N concurrent pushes each add an uncounted `ls-tree`/`cat-file` pair
 * (review R8). {@link leaseGitRunner} is the default for callers that do not.
 */
export type GitChildRunner = (
  directory: string,
  args: readonly string[],
  stdin?: string,
) => Promise<Uint8Array<ArrayBuffer>>;

/* eslint-disable @typescript-eslint/naming-convention -- process environment names */
/**
 * The isolation a lease's children run under, as `lease.ts` spawns its own: no
 * user or system configuration reaches them, so the only settings in force are
 * the ones hydration wrote into the directory.
 */
const gitEnvironment: Record<string, string> = {
  PATH: process.env['PATH'] ?? '/usr/bin:/bin',
  HOME: '/nonexistent',
  LANG: 'C',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
};
/* eslint-enable @typescript-eslint/naming-convention -- end of the process environment map */

/**
 * One `git` child in a lease, reading binary stdout.
 *
 * `lease.ts`'s own runner decodes as UTF-8, which would corrupt the bytes
 * `cat-file --batch` hands back, so the materializer keeps a buffer runner of
 * its own. The ceiling is the publication ceiling plus headroom: a tree larger
 * than that is refused from `ls-tree -l`'s sizes before anything is read.
 *
 * @param directory - The lease the child runs in.
 * @param args - Arguments after `git`.
 * @param stdin - Written to the child, when given.
 * @returns The child's stdout.
 */
export const leaseGitRunner: GitChildRunner = async (directory, args, stdin) => {
  const running = execFileAsync('git', [...args], {
    cwd: directory,
    encoding: 'buffer',
    timeout: 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: gitEnvironment as NodeJS.ProcessEnv,
  });
  if (stdin !== undefined) {
    running.child.stdin?.end(stdin);
  }
  const { stdout } = await running;
  return new Uint8Array(stdout);
};

/** What one materialization writes into the publication row. */
export type MaterializedPublication = Readonly<{
  /** The revision the named version resolved to when this ran. */
  revisionId: string;
  /** Where the `path → sha256` keyring lives, keyed by the revision. */
  manifestKey: string;
  /** The published thumbnail's blob, or the shared default. */
  thumbnailKey: string;
  kernels: readonly string[];
  runtimePin: string;
  /** Paths written, for the caller's own accounting. */
  fileCount: number;
  /**
   * Reference counts this materialization took, already applied.
   *
   * They were written in the caller's own transaction, before any blob was
   * looked up or put, so they are reported here for accounting rather than for
   * applying again. A publish whose row write fails rolls them back with it
   * (the blobs themselves are content-addressed and harmless orphans).
   */
  blobRefs: readonly BlobRefIncrement[];
}>;

/** One blob's new references, aggregated per digest. */
export type BlobRefIncrement = Readonly<{ sha256: string; sizeBytes: number; count: number }>;

/** The transaction shape `applyBlobReferences` needs, which is Drizzle's own. */
export type BlobRefWriter = Pick<DatabaseService['database'], 'insert'>;

/**
 * Add one materialization's reference counts, inside the caller's transaction.
 *
 * @param writer - The transaction the publication row is written in.
 * @param increments - What {@link materializePublication} counted.
 */
export const applyBlobReferences = async (
  writer: BlobRefWriter,
  increments: readonly BlobRefIncrement[],
): Promise<void> => {
  await Promise.all(
    increments.map(async ({ sha256, sizeBytes, count }) =>
      writer
        .insert(schema.blobRef)
        .values({ sha256, sizeBytes: BigInt(sizeBytes), refcount: count })
        .onConflictDoUpdate({
          target: schema.blobRef.sha256,
          set: { refcount: sql`${schema.blobRef.refcount} + ${count}` },
        }),
    ),
  );
};

/**
 * Where one project's LFS object actually is, or `undefined`.
 *
 * Passed in rather than imported: the one answer to that question lives in
 * `git-lfs.service.ts` (W4b), which reaches this module through the git service,
 * and importing it back would make this module part of that cycle. The shape is
 * structural for the same reason.
 */
export type LfsObjectResolver = (
  args: Readonly<{ ownerId: string; projectId: string; oid: string }>,
) => Promise<Readonly<{ namespace: StorageNamespace; key: string; tier: StorageTier }> | undefined>;

/** Everything the materializer touches, passed rather than injected. */
export type MaterializerDependencies = Readonly<{
  databaseService: DatabaseService;
  storage: ObjectStorageService;
  /** The caller's runner, so its children are counted where it counts them. */
  git: GitChildRunner;
  /** `resolveLfsObjectLocation`, bound by the caller: tenant key, then legacy. */
  resolveLfsObject: LfsObjectResolver;
}>;

/** One publication to materialize, and where its bytes come from. */
export type MaterializeInput = Readonly<{
  publicationId: string;
  projectId: string;
  /** Whose storage holds this project's LFS objects (D24). */
  ownerId: string;
  /** The lease directory this version is read out of. */
  directory: string;
  /** The named version, without `refs/tags/`. */
  tag: string;
  /** Private publications' bytes go to the fail-closed bucket. */
  visibility: 'private' | 'public';
  /** Set when the caller already knows the path the viewer opens. */
  entryPath?: string;
}>;

const normalizeRelativePath = (relativePathValue: string): string =>
  relativePathValue.replaceAll('\\', '/').replace(/^\.\/+/u, '');

/**
 * Whether a path from the tree may be published.
 *
 * The same rule the upload path enforced, moved here because the tree is now
 * where paths come from: a project's `.tau` records, its exports and its
 * dependencies are not part of what a viewer sees.
 *
 * @param relativePathValue - One project-relative path from the tagged tree.
 * @returns `true` when the path is publishable.
 */
export const isPublishableTreePath = (relativePathValue: string): boolean => {
  const normalized = normalizeRelativePath(relativePathValue);
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    return false;
  }
  const isTauPath = normalized === '.tau' || normalized.startsWith('.tau/');
  if (isTauPath && !isPublishableTauPath(normalized)) {
    return false;
  }
  return !publishForbiddenPathPrefixes.some(
    (prefix) => normalized === prefix || normalized.startsWith(prefix) || normalized.includes(`/${prefix}`),
  );
};

/** One entry of a tagged tree, before its bytes are read. */
type TreeEntry = Readonly<{ path: string; objectId: string; sizeBytes: number }>;

/**
 * Every publishable blob of one tagged tree, with its object id.
 *
 * @param git - The caller's runner.
 * @param directory - The lease directory.
 * @param tag - The named version.
 * @returns The tree's publishable blob entries.
 */
const listTree = async (git: GitChildRunner, directory: string, tag: string): Promise<readonly TreeEntry[]> => {
  /* `-l` is what makes the ceilings enforceable before a byte is read: without
     it the only way to learn a blob's size is to read the blob (review R5). */
  const output = await git(directory, ['ls-tree', '-r', '-l', '-z', '--full-tree', `refs/tags/${tag}`]);
  return new TextDecoder()
    .decode(output)
    .split('\0')
    .flatMap((record) => {
      /* `<mode> <type> <object> <size>\t<path>` — submodules and symlinks are
       * not blobs of a publication and are skipped rather than refused. */
      const [meta, entryPath] = record.split('\t');
      const fields = meta?.trim().split(/\s+/u) ?? [];
      const [mode, type, objectId, size] = fields;
      if (type !== 'blob' || objectId === undefined || entryPath === undefined || mode === '120000') {
        return [];
      }
      const normalized = normalizeRelativePath(entryPath);
      return isPublishableTreePath(normalized)
        ? [{ path: normalized, objectId, sizeBytes: Number.parseInt(size ?? '', 10) || 0 }]
        : [];
    });
};

/**
 * The bytes of every listed object, in one `cat-file --batch` child.
 *
 * @param git - The caller's runner.
 * @param directory - The lease directory.
 * @param entries - What `listTree` found.
 * @returns The bytes, keyed by object id.
 */
const readBlobs = async (
  git: GitChildRunner,
  directory: string,
  entries: readonly TreeEntry[],
): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> => {
  const objectIds = [...new Set(entries.map((entry) => entry.objectId))];
  const bytes = new Map<string, Uint8Array<ArrayBuffer>>();
  if (objectIds.length === 0) {
    return bytes;
  }
  const pathOf = new Map(entries.map((entry) => [entry.objectId, entry.path]));
  const output = await git(directory, ['cat-file', '--batch'], `${objectIds.join('\n')}\n`);
  let offset = 0;
  while (offset < output.length) {
    const newline = output.indexOf(0x0a, offset);
    if (newline === -1) {
      throw new Error('git cat-file --batch ended mid-record');
    }
    const header = new TextDecoder().decode(output.subarray(offset, newline));
    const [objectId, type, size] = header.split(' ');
    /* `<sha> missing` is an object the repository does not have. Truncating the
       rest of the tree here would publish a version with files quietly absent
       (review R5), so it is a refusal that names the path. */
    if (type === 'missing' || type === undefined) {
      throw new NotFoundException({
        code: publicationApiCode.NOT_FOUND,
        message: `This version is missing ${pathOf.get(objectId ?? '') ?? objectId ?? 'an object'}. Push it again.`,
      });
    }
    const length = Number(size);
    if (objectId === undefined || !Number.isInteger(length)) {
      throw new Error(`git cat-file --batch answered an unreadable record: ${header}`);
    }
    const start = newline + 1;
    bytes.set(objectId, new Uint8Array(output.subarray(start, start + length)));
    /* Each record is `<sha> <type> <size>\n<content>\n`. */
    offset = start + length + 1;
  }
  return bytes;
};

/** A git-lfs v1 pointer, as `git-lfs` writes it. */
const lfsPointerPattern = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([\da-f]{64})\nsize (\d+)\n$/u;

/**
 * The object id a git-lfs pointer names, or `undefined` for ordinary bytes.
 *
 * @param bytes - One blob's content.
 * @returns The pointer's oid and size, or `undefined`.
 */
export const parseLfsPointer = (
  bytes: Uint8Array<ArrayBuffer>,
): Readonly<{ oid: string; size: number }> | undefined => {
  /* A pointer is a few hundred bytes by specification; decoding a 25 MiB STEP
   * file to find out it is not one would be the expensive way to ask. */
  if (bytes.byteLength > 1024) {
    return undefined;
  }
  const match = lfsPointerPattern.exec(new TextDecoder().decode(bytes));
  return match?.[1] === undefined ? undefined : { oid: match[1], size: Number(match[2]) };
};

const readStream = async (body: Readable): Promise<Uint8Array<ArrayBuffer>> => {
  const chunks: Array<Uint8Array<ArrayBuffer>> = [];
  for await (const chunk of body) {
    chunks.push(new Uint8Array(chunk as Uint8Array<ArrayBuffer>));
  }
  return new Uint8Array(Buffer.concat(chunks));
};

const publicationContentType = (relativePath: string): string =>
  relativePath === 'thumbnail.webp' ? 'image/webp' : 'application/octet-stream';

/** A RIFF/WEBP container, as the viewer's `image/webp` content type promises. */
const isWebp = (bytes: Uint8Array<ArrayBuffer>): boolean =>
  bytes.byteLength >= 12 &&
  new TextDecoder().decode(bytes.subarray(0, 4)) === 'RIFF' &&
  new TextDecoder().decode(bytes.subarray(8, 12)) === 'WEBP';

/**
 * The files of one named version, LFS pointers resolved to their bytes.
 *
 * @param dependencies - Storage, for the LFS objects R2 holds.
 * @param input - The repository, project and tag.
 * @returns Project-relative path to bytes.
 * @throws NotFoundException When the tag names nothing in that repository.
 * @throws BadRequestException When the tree breaks a publication limit.
 */
export const readPublishedTree = async (
  dependencies: MaterializerDependencies,
  input: Readonly<{ directory: string; projectId: string; ownerId: string; tag: string }>,
): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> => {
  const entries = await listTree(dependencies.git, input.directory, input.tag).catch(() => {
    throw new NotFoundException({
      code: publicationApiCode.NOT_FOUND,
      message: `This project has no version named ${input.tag} in the cloud.`,
    });
  });

  const userFileCount = entries.filter((entry) => !isPublicationSystemArtifact(entry.path)).length;
  if (userFileCount > publicationMaxUserFiles) {
    throw new BadRequestException({
      code: publicationApiCode.TOO_MANY_FILES,
      message: `Maximum ${String(publicationMaxUserFiles)} files exceeded`,
    });
  }

  /* Every ceiling is enforced on the sizes `ls-tree -l` reported, before any
     object is read: the whole tree used to be buffered first, so a tree inside
     quota by file count could exhaust the machine before the byte checks ran
     (review R5). The post-read checks below still apply, because an LFS pointer
     lists as its own few hundred bytes and expands to the object's. */
  let listedBytes = 0;
  for (const entry of entries) {
    if (entry.sizeBytes > maxBytesPerPublishedFile) {
      throw new BadRequestException({
        code: publicationApiCode.FILE_TOO_LARGE,
        message: `File exceeds ${String(maxBytesPerPublishedFile)} bytes: ${entry.path}`,
      });
    }
    listedBytes += entry.sizeBytes;
  }
  if (listedBytes > maxPublishedTotalBytes) {
    throw new BadRequestException({
      code: publicationApiCode.PAYLOAD_TOO_LARGE,
      message: 'This version is larger than a publication may be',
    });
  }

  const objects = await readBlobs(dependencies.git, input.directory, entries);
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let totalBytes = 0;

  for (const entry of entries) {
    const stored = objects.get(entry.objectId);
    if (stored === undefined) {
      continue;
    }
    const pointer = parseLfsPointer(stored);
    const bytes =
      pointer === undefined
        ? stored
        : // oxlint-disable-next-line no-await-in-loop -- one large object per iteration; parallel presigned reads would multiply peak memory by the file count.
          await readLfsObject(dependencies, { projectId: input.projectId, ownerId: input.ownerId, oid: pointer.oid });
    if (bytes.byteLength > maxBytesPerPublishedFile) {
      throw new BadRequestException({
        code: publicationApiCode.FILE_TOO_LARGE,
        message: `File exceeds ${String(maxBytesPerPublishedFile)} bytes: ${entry.path}`,
      });
    }
    totalBytes += bytes.byteLength;
    if (totalBytes > maxPublishedTotalBytes) {
      throw new BadRequestException({
        code: publicationApiCode.PAYLOAD_TOO_LARGE,
        message: 'This version is larger than a publication may be',
      });
    }
    files.set(entry.path, bytes);
  }

  return files;
};

/**
 * The one LFS failure a publisher can act on: the object never arrived.
 *
 * @returns The exception to throw when nothing holds the pointer's object.
 */
const lfsObjectNotUploaded = (): NotFoundException =>
  new NotFoundException({
    code: publicationApiCode.NOT_FOUND,
    message: 'A large file in this version has not finished uploading yet. Try publishing again.',
  });

/**
 * One LFS object's bytes, from the layout the LFS endpoint writes (W9, W11a).
 *
 * @param dependencies - Storage.
 * @param object - Whose storage and project it belongs to, and its object id.
 * @returns The object's bytes.
 * @throws NotFoundException When the pointer names an object the remote never received.
 */
const readLfsObject = async (
  dependencies: MaterializerDependencies,
  object: Readonly<{ projectId: string; ownerId: string; oid: string }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  /* Where the object actually is: the tenant key every upload now lands at
     (D24), or the pre-D24 key under `blobs/` for a project whose objects have
     not been relocated yet. One resolver, the LFS endpoint's own, so a
     publication reads exactly where that endpoint serves from (W4b). */
  const held = await dependencies.resolveLfsObject(object);
  if (held === undefined) {
    throw lfsObjectNotUploaded();
  }
  try {
    const stored = await dependencies.storage.getBlob(held);
    return await readStream(stored.body);
  } catch (error) {
    /* Only an absent object is the publisher's to act on. A store outage, a
       timeout or a denied read is ours, and answering all three with "push
       again" would send them round a loop that cannot fix it (review N3). */
    if (!isS3ObjectMissing(error)) {
      throw error;
    }
    throw lfsObjectNotUploaded();
  }
};

/**
 * Materialize one named version into the publication blob store.
 *
 * **Runs inside the caller's transaction**, and the order is the fence W6's
 * collector is safe against (D10). The collector deletes a `blob_ref` row at
 * refcount 0 and then the bytes it named; this takes the row's lock *first*, by
 * upserting every reference before a single blob is looked up or written. A
 * collector that gets there first finds the row gone and puts the bytes back;
 * one that arrives after blocks on the lock and then misses, because the
 * refcount is no longer 0. Incrementing after the writes — which is what the
 * volume-era path did — left a window where a published version pointed at
 * bytes the collector had just removed.
 *
 * ponytail: the caller's transaction is open across the tree read and every
 * upload, so the publication's own rows stay locked for the whole publish. Ruled
 * acceptable — publishing is rare and user-initiated. The upgrade path, if a
 * ceiling-sized publication ever measures badly, is to upload first and then
 * open a short transaction that upserts the references and re-checks each blob
 * with `headBlob` before committing.
 *
 * Idempotent by construction: the blobs are content-addressed and the manifest
 * is keyed by the tag's revision, so re-running for the same revision writes
 * the same objects. The previous manifest's counts are released by the caller
 * once the row points at the new one, which is what "re-publishing changes only
 * the pointer and the materialized blobs" means (AC13).
 *
 * @param dependencies - Database and storage.
 * @param input - Which publication, which tag, and at which visibility.
 * @param writer - The caller's open transaction, which the counts are taken in.
 * @returns The row fields the caller records, in that same transaction.
 */
export const materializePublication = async (
  dependencies: MaterializerDependencies,
  input: MaterializeInput,
  writer: BlobRefWriter,
): Promise<MaterializedPublication> => {
  const { storage } = dependencies;
  /* Resolved through the same refusal `readPublishedTree` answers, because a
     name that was never pushed is a 404 with a sentence, not git's stderr in a
     500 (review R7). */
  const head = await dependencies.git(input.directory, ['rev-parse', `refs/tags/${input.tag}^{commit}`]).catch(() => {
    throw new NotFoundException({
      code: publicationApiCode.NOT_FOUND,
      message: `This project has no version named ${input.tag} in the cloud.`,
    });
  });
  const revision = new TextDecoder().decode(head).trim();
  const files = await readPublishedTree(dependencies, input);
  const tier: StorageTier = input.visibility === 'private' ? 'private' : 'public';

  /* A manifest that names a file it has no digest for is a publication whose
     viewer opens nothing, so the entry path is checked against the tree rather
     than trusted from the request. */
  if (input.entryPath !== undefined && input.entryPath !== '' && !files.has(normalizeRelativePath(input.entryPath))) {
    throw new NotFoundException({
      code: publicationApiCode.MISSING_ENTRY_PATH,
      message: `This version does not contain ${input.entryPath}.`,
    });
  }

  const thumbnailBytes = files.get('thumbnail.webp');
  if (thumbnailBytes !== undefined && !isWebp(thumbnailBytes)) {
    throw new BadRequestException({
      code: publicationApiCode.INVALID_THUMBNAIL_WEBP,
      message: 'thumbnail.webp is not a valid WebP file',
    });
  }

  const uploads = [...files.entries()].map(([relativePath, bytes]) => ({
    path: relativePath,
    bytes,
    sha: sha256HexFromBytes(bytes),
    contentType: publicationContentType(relativePath),
  }));

  const increments = new Map<string, BlobRefIncrement>();
  for (const { bytes, sha } of uploads) {
    const existing = increments.get(sha);
    increments.set(
      sha,
      existing === undefined
        ? { sha256: sha, sizeBytes: bytes.byteLength, count: 1 }
        : { ...existing, count: existing.count + 1 },
    );
  }

  /* The fence: every reference is taken, in the caller's transaction, before
     any blob is looked up or written (D10 — see this function's contract). */
  /* Sorted by digest, because these upserts take row locks held to commit:
     two publishes sharing blobs in different tree order would otherwise take
     the same rows in opposite orders and deadlock (review F3). */
  const blobReferences = [...increments.values()].sort((left, right) => (left.sha256 < right.sha256 ? -1 : 1));
  await applyBlobReferences(writer, blobReferences);

  await Promise.all(
    uploads.map(async ({ bytes, sha, contentType }) => {
      const key = blobKeyFromSha256Hex(sha);
      const existing = await storage.headBlob({ namespace: 'blobs', key, tier });
      if (existing !== undefined && existing.contentType === contentType) {
        return;
      }
      await storage.putBlob({
        namespace: 'blobs',
        key,
        body: bytes,
        contentType,
        ...(existing === undefined ? { ifNoneMatch: '*' } : {}),
        cacheControl: tier === 'private' ? 'private, no-cache' : 'public, max-age=31536000, immutable',
        tier,
      });
    }),
  );

  const thumbnail = uploads.find((upload) => upload.path === 'thumbnail.webp');
  const thumbnailKey = thumbnail ? `blobs/${blobKeyFromSha256Hex(thumbnail.sha)}` : 'defaults/thumb.webp';
  const kernels = detectKernelIdsFromRelativePaths(uploads.map((upload) => upload.path));
  const runtimePin = resolveRuntimePin();

  /* Keyed by the revision, so a re-publish writes a new immutable object
   * rather than overwriting the one a viewer may be reading. */
  const manifestKey = `publications/${input.publicationId}/${revision}.json`;
  const manifest: StoredPublicationManifest = storedPublicationManifestSchema.parse({
    version: 1,
    projectId: input.projectId,
    entryPath: input.entryPath ?? '',
    files: Object.fromEntries(
      [...uploads]
        .sort((left, right) => left.path.localeCompare(right.path))
        .map(({ path: p, sha }) => [p, `sha256:${sha}`]),
    ),
    kernels,
    runtime: `@taucad/runtime@${runtimePin}`,
    parameters: {},
    createdAt: new Date().toISOString(),
  });

  /* Manifests are the publication's keyring at a key derivable from the share
   * URL, so they never go to the anonymous origin, whatever the visibility. */
  await storage.putBlob({
    namespace: 'derivatives',
    key: manifestKey,
    body: new TextEncoder().encode(JSON.stringify(manifest)),
    contentType: 'application/json',
    cacheControl: 'private, no-cache',
    tier: 'private',
  });

  return {
    revisionId: revision,
    manifestKey,
    thumbnailKey,
    kernels,
    runtimePin,
    fileCount: uploads.length,
    blobRefs: blobReferences,
  };
};

/**
 * Give back the reference counts one superseded manifest held.
 *
 * Called exactly once per version this replaced: both callers gate it on an
 * update that actually moved the row off `manifestKey`, because a second
 * release of the same manifest takes a blob another publication still names
 * down to zero and W6's collector then deletes it (review F2).
 *
 * The decrement refuses to go below zero, and says so when it had to: a row
 * already at zero means a reference was given back twice, which is the shape of
 * that bug, and it is logged rather than silently clamped (review F9).
 *
 * @param dependencies - Database and storage.
 * @param manifestKey - The manifest a publication no longer points at.
 */
export const releaseManifestBlobs = async (
  dependencies: MaterializerDependencies,
  manifestKey: string,
): Promise<void> => {
  let manifest: StoredPublicationManifest;
  try {
    const stored = await dependencies.storage.getBlob({ namespace: 'derivatives', key: manifestKey, tier: 'private' });
    manifest = storedPublicationManifestSchema.parse(
      JSON.parse(new TextDecoder().decode(await readStream(stored.body))),
    );
  } catch {
    /* A manifest that is not there holds no counts; nothing to give back. */
    return;
  }
  const shas = Object.values(manifest.files).flatMap((reference) => {
    const match = /^sha256:([\da-f]{64})$/iu.exec(reference);
    return match?.[1] === undefined ? [] : [match[1]];
  });
  await Promise.all(
    shas.map(async (sha256Hex) => {
      /* `refcount > 0` is the clamp, spelled so the statement can report that
         it fired: `greatest(0, …)` would have absorbed an over-release without
         leaving a trace. */
      const [decremented] = await dependencies.databaseService.database
        .update(schema.blobRef)
        .set({ refcount: sql`greatest(0, ${schema.blobRef.refcount} - 1)` })
        .where(and(eq(schema.blobRef.sha256, sha256Hex), gt(schema.blobRef.refcount, 0)))
        .returning({ sha256: schema.blobRef.sha256 });
      if (decremented !== undefined) {
        return;
      }
      /* Nothing moved: either the row is gone, which is ordinary — a manifest
         outlives the blobs nobody references — or it is sitting at zero while a
         manifest still names it, which is a reference given back twice. */
      const [stuck] = await dependencies.databaseService.database
        .select({ sha256: schema.blobRef.sha256 })
        .from(schema.blobRef)
        .where(eq(schema.blobRef.sha256, sha256Hex))
        .limit(1);
      if (stuck !== undefined) {
        logger.error(
          { manifestKey, sha256: sha256Hex },
          'A publication manifest released a blob already at refcount 0; its references were given back twice',
        );
      }
    }),
  );
};

/** One `refs/tags/*` ref and the oid it now points at. */
export type PushedTag = Readonly<{ ref: string; oid: string }>;

/** One version this run materialized, for the caller's own record. */
export type MaterializedVersion = Readonly<{
  publicationId: string;
  /** The named version, without `refs/tags/`. */
  tag: string;
  /** The ref oid the version was materialized from. */
  oid: string;
  /** The commit that oid peels to, which the row now records. */
  revisionId: string;
  manifestKey: string;
}>;

/**
 * The commit each oid peels to, in one child.
 *
 * `rev-parse` takes every revision at once, so deciding which of a manifest's
 * tags still need work costs one process rather than one per tag — which is
 * what makes re-observing a whole manifest after a crash cheap (D19).
 *
 * @param git - The caller's runner.
 * @param directory - The lease.
 * @param oids - The tag oids to peel.
 * @returns Each oid's commit, by oid. An oid that peels to nothing is absent.
 */
const peelToCommits = async (
  git: GitChildRunner,
  directory: string,
  oids: readonly string[],
): Promise<ReadonlyMap<string, string>> => {
  if (oids.length === 0) {
    return new Map();
  }
  const output = await git(directory, ['rev-parse', ...oids.map((oid) => `${oid}^{commit}`)]).catch(() => undefined);
  const lines = new TextDecoder()
    .decode(output ?? new Uint8Array())
    .split('\n')
    .filter((line) => line !== '');
  /* A single unresolvable revision fails the whole child; the tags are then
     materialized one by one, where each gets its own refusal. */
  return lines.length === oids.length
    ? new Map(oids.map((oid, index) => [oid, lines[index] ?? '']))
    : new Map<string, string>();
};

/**
 * Materialize every publication whose named version one of these tags is.
 *
 * Called inside a lease, after the commit and before the dispose: by the git
 * service with the refs its push moved, and by `PublicationsService` with the
 * manifest's own tags when a read finds the derived generation behind (D9,
 * D19). Materialization is derived state, so this is idempotent by
 * construction — a tag whose publication already records the commit that oid
 * peels to is not work, which is what makes re-deriving a whole manifest after
 * a crash cost one `rev-parse`.
 *
 * Nothing here enumerates repositories or reads a spool: the caller names the
 * project, and the lease is the only place bytes come from.
 *
 * Two callers can observe the same stale publication at once — a page load
 * issues one file request per file, and each repairs — so each version is
 * materialized under the project's advisory lock, and the row is moved with a
 * compare-and-swap on the manifest key it was read at. Only the caller whose
 * swap moved the row gives the superseded manifest's references back; without
 * that, two releases of one manifest take a blob another publication still
 * names down to zero (review F2).
 *
 * @param dependencies - Database, storage and the caller's git runner.
 * @param input - The project, its owner, its lease directory, and the tags to consider.
 * @returns The versions this run materialized, in the order it did them.
 * @throws AggregateError When one or more versions could not be materialized.
 */
export const materializePublishedTags = async (
  dependencies: MaterializerDependencies,
  input: Readonly<{ projectId: string; ownerId: string; directory: string; tags: readonly PushedTag[] }>,
): Promise<readonly MaterializedVersion[]> => {
  const tagPrefix = 'refs/tags/';
  const oidByTag = new Map(
    input.tags
      .filter((tag) => tag.ref.startsWith(tagPrefix))
      .map((tag) => [tag.ref.slice(tagPrefix.length), tag.oid] as const),
  );
  if (oidByTag.size === 0) {
    return [];
  }

  /* One query for the project, rather than one per tag: a push that moved
     twenty tags of which none is published must cost one round trip. */
  const rows = await dependencies.databaseService.database
    .select()
    .from(schema.publication)
    .where(eq(schema.publication.projectId, input.projectId));
  const published = rows.filter((row) => oidByTag.has(row.tag));
  if (published.length === 0) {
    return [];
  }

  const commits = await peelToCommits(dependencies.git, input.directory, [
    ...new Set(published.map((row) => oidByTag.get(row.tag) ?? '')),
  ]);

  const materialized: MaterializedVersion[] = [];
  /* One tag that cannot be resolved — a name whose tree lost its entry path, a
     thumbnail that stopped being a WebP — must not abort the others: they are
     independent work. The failures are re-raised together so the caller leaves
     the derived generation behind and the next observation retries, which is
     the whole of D19's "no queue". */
  const failures: unknown[] = [];
  for (const row of published) {
    const oid = oidByTag.get(row.tag) ?? '';
    /* Read before the write, because the row this loop holds is superseded by
       the transaction below and the release must name the *old* manifest. */
    const superseded = row.manifestKey;
    /* Already materialized at this oid: the row records the commit it peels to
       and points at a manifest. Re-running would write the same objects. */
    if (superseded !== '' && row.revisionId === commits.get(oid)) {
      continue;
    }
    try {
      // oxlint-disable-next-line no-await-in-loop -- one publication's bytes at a time; parallel materializations would multiply peak memory by the publication count.
      const result = await dependencies.databaseService.database.transaction(async (transaction) => {
        /* One repair of this project at a time. Two readers of the same stale
           publication would otherwise both materialize it, both move the row
           and both release the manifest it was read at (review F2). The key is
           the project rather than the owner, so a repair never waits on the
           quota lock `withOwnerLock` takes. */
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.projectId}, 0))`);
        /* Re-read under the lock: whoever waited here may be looking at work
           the holder just did, and materializing it again would take a second
           reference for one manifest. */
        const [fresh] = await transaction
          .select({ manifestKey: schema.publication.manifestKey })
          .from(schema.publication)
          .where(eq(schema.publication.id, row.id))
          .limit(1);
        if (fresh === undefined || fresh.manifestKey !== superseded) {
          return undefined;
        }
        /* Inside the transaction, and first, so the reference counts are taken
           before any blob is looked up or written (D10). */
        const written = await materializePublication(
          dependencies,
          {
            publicationId: row.id,
            projectId: input.projectId,
            ownerId: input.ownerId,
            directory: input.directory,
            tag: row.tag,
            visibility: row.visibility === 'private' ? 'private' : 'public',
            entryPath: row.entryPath,
          },
          transaction,
        );
        /* Compare-and-swap on the manifest this row was read at: whoever was
           second finds no row to move and releases nothing. */
        const moved = await transaction
          .update(schema.publication)
          .set({
            manifestKey: written.manifestKey,
            thumbnailKey: written.thumbnailKey,
            kernels: [...written.kernels],
            /* The name moved, so the row must say which revision a viewer is
             * now being served (the manifest is keyed by it). */
            revisionId: written.revisionId,
          })
          .where(and(eq(schema.publication.id, row.id), eq(schema.publication.manifestKey, superseded)))
          .returning({ id: schema.publication.id });
        return { written, moved: moved.length === 1 };
      });
      if (result === undefined) {
        /* Another caller materialized this version while this one waited. */
        continue;
      }
      /* Only once this caller's swap moved the row off the superseded manifest,
         so a failure above never drops a live reference (W6's collector deletes
         zero-count rows), a concurrent repair never releases it twice, and a
         version that did not move never gives back the counts it just took. */
      if (result.moved && superseded !== '' && result.written.manifestKey !== superseded) {
        // oxlint-disable-next-line no-await-in-loop -- sequential by design, see above.
        await releaseManifestBlobs(dependencies, superseded);
      }
      materialized.push({
        publicationId: row.id,
        tag: row.tag,
        oid,
        revisionId: result.written.revisionId,
        manifestKey: result.written.manifestKey,
      });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `${String(failures.length)} publication(s) could not be re-materialized.`);
  }
  return materialized;
};
