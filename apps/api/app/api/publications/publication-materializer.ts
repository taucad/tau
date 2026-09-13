/**
 * The publication materializer: one named version of a project's graph turned
 * into the sha256-keyed blobs the viewer already reads (S32, A21, D11).
 *
 * Publishing no longer uploads anything. The bytes reach the server with the
 * push — LFS objects included — so this reads the tagged tree out of the bare
 * repository on the volume, resolves any LFS pointer to the object R2 holds,
 * and writes exactly what the multipart path used to write: content-addressed
 * blobs, their reference counts, and the `path → sha256` manifest. The CDN
 * URLs public viewers get and the grant-rechecking proxy private viewers get
 * are therefore untouched, which is the whole of AC13's "nothing else changes
 * on the serving path".
 *
 * This is a **function module, not a provider**: `PublicationsService` calls it
 * when a publication is created or re-pointed, and `GitRepositoryService` calls
 * it when a push moved a tag some publication already names. A provider would
 * need `GitModule` and `PublicationsModule` to import each other.
 */

import type { Readable } from 'node:stream';
import { and, eq, sql } from 'drizzle-orm';
import {
  isPublicationSystemArtifact,
  publicationApiCode,
  publicationMaxUserFiles,
  publishForbiddenPathPrefixes,
  isPublishableTauPath,
} from '@taucad/types/constants';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { gitLfsObjectKey } from '#api/git/git.constants.js';
import type { DatabaseService } from '#database/database.service.js';
import * as schema from '#database/schema.js';
import { detectKernelIdsFromRelativePaths, resolveRuntimePin } from '#api/publications/publication-runtime.utils.js';
import type { StoredPublicationManifest } from '#api/publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#api/publications/publications.dto.js';
import type { ObjectStorageService, StorageTier } from '#storage/object-storage.service.js';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '#storage/sha256.utils.js';

/** Per-file ceiling, unchanged from the upload path. */
export const maxBytesPerPublishedFile = 25 * 1024 * 1024;
/** Whole-publication ceiling, unchanged from the upload path. */
export const maxPublishedTotalBytes = 50 * 1024 * 1024;

/**
 * One bounded `git` invocation inside a bare repository.
 *
 * Supplied by the caller rather than spawned here, so every child a
 * materialization starts is counted by `GitRepositoryService`'s own
 * 32-concurrent-child ceiling — the ceiling exists to protect the memory and
 * CPU of the machine this runs on, and N concurrent pushes must not each add an
 * uncounted `ls-tree`/`cat-file` pair (review R8).
 *
 * @public
 */
export type GitChildRunner = (
  repositoryPath: string,
  args: readonly string[],
  stdin?: string,
) => Promise<Uint8Array<ArrayBuffer>>;

/** What one materialization writes into the publication row. @public */
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
   * Reference counts this materialization added, for the caller's transaction.
   *
   * Returned rather than written here so the counts land in the same
   * transaction as the row that owns them: a publish whose row write fails
   * must not leave counts behind (the blobs themselves are content-addressed
   * and harmless orphans).
   */
  blobRefs: readonly BlobRefIncrement[];
}>;

/** One blob's new references, aggregated per digest. @public */
export type BlobRefIncrement = Readonly<{ sha256: string; sizeBytes: number; count: number }>;

/** The transaction shape `applyBlobReferences` needs, which is Drizzle's own. @public */
export type BlobRefWriter = Pick<DatabaseService['database'], 'insert'>;

/**
 * Add one materialization's reference counts, inside the caller's transaction.
 *
 * @param writer - The transaction the publication row is written in.
 * @param increments - What {@link materializePublication} counted.
 * @public
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

/** Everything the materializer touches, passed rather than injected. @public */
export type MaterializerDependencies = Readonly<{
  databaseService: DatabaseService;
  storage: ObjectStorageService;
  /** `GitRepositoryService.run`, bound: one runner, one child ceiling. */
  git: GitChildRunner;
}>;

/** One publication to materialize, and where its bytes come from. @public */
export type MaterializeInput = Readonly<{
  publicationId: string;
  projectId: string;
  /** The bare repository on the volume. */
  repositoryPath: string;
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
 * @param repositoryPath - The bare repository.
 * @param tag - The named version.
 * @returns The tree's publishable blob entries.
 */
const listTree = async (git: GitChildRunner, repositoryPath: string, tag: string): Promise<readonly TreeEntry[]> => {
  /* `-l` is what makes the ceilings enforceable before a byte is read: without
     it the only way to learn a blob's size is to read the blob (review R5). */
  const output = await git(repositoryPath, ['ls-tree', '-r', '-l', '-z', '--full-tree', `refs/tags/${tag}`]);
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
 * @param repositoryPath - The bare repository.
 * @param entries - What `listTree` found.
 * @returns The bytes, keyed by object id.
 */
const readBlobs = async (
  git: GitChildRunner,
  repositoryPath: string,
  entries: readonly TreeEntry[],
): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> => {
  const objectIds = [...new Set(entries.map((entry) => entry.objectId))];
  const bytes = new Map<string, Uint8Array<ArrayBuffer>>();
  if (objectIds.length === 0) {
    return bytes;
  }
  const pathOf = new Map(entries.map((entry) => [entry.objectId, entry.path]));
  const output = await git(repositoryPath, ['cat-file', '--batch'], `${objectIds.join('\n')}\n`);
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
 * @public
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
 * @public
 */
export const readPublishedTree = async (
  dependencies: MaterializerDependencies,
  input: Readonly<{ repositoryPath: string; projectId: string; tag: string }>,
): Promise<ReadonlyMap<string, Uint8Array<ArrayBuffer>>> => {
  const entries = await listTree(dependencies.git, input.repositoryPath, input.tag).catch(() => {
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

  const objects = await readBlobs(dependencies.git, input.repositoryPath, entries);
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  let totalBytes = 0;

  for (const entry of entries) {
    const stored = objects.get(entry.objectId);
    if (stored === undefined) {
      continue;
    }
    const pointer = parseLfsPointer(stored);
    // oxlint-disable-next-line no-await-in-loop -- one large object per iteration; parallel presigned reads would multiply peak memory by the file count.
    const bytes = pointer === undefined ? stored : await readLfsObject(dependencies, input.projectId, pointer.oid);
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
 * One LFS object's bytes, from the layout the LFS endpoint writes (W9, W11a).
 *
 * @param dependencies - Storage.
 * @param projectId - Whose repository the object belongs to.
 * @param oid - The git-lfs object id.
 * @returns The object's bytes.
 * @throws NotFoundException When the pointer names an object the remote never received.
 */
const readLfsObject = async (
  dependencies: MaterializerDependencies,
  projectId: string,
  oid: string,
): Promise<Uint8Array<ArrayBuffer>> => {
  try {
    const object = await dependencies.storage.getBlob({
      namespace: 'blobs',
      key: gitLfsObjectKey(projectId, oid),
      tier: 'private',
    });
    return await readStream(object.body);
  } catch {
    throw new NotFoundException({
      code: publicationApiCode.NOT_FOUND,
      message: 'A large file in this version has not finished uploading yet. Try publishing again.',
    });
  }
};

/**
 * Materialize one named version into the publication blob store.
 *
 * Idempotent by construction: the blobs are content-addressed and the manifest
 * is keyed by the tag's revision, so re-running for the same revision writes
 * the same objects. Reference counts are incremented once per materialization
 * and the previous manifest's counts are released, which is what "re-publishing
 * changes only the pointer and the materialized blobs" means (AC13).
 *
 * @param dependencies - Database and storage.
 * @param input - Which publication, which tag, and at which visibility.
 * @returns The row fields the caller records.
 * @public
 */
export const materializePublication = async (
  dependencies: MaterializerDependencies,
  input: MaterializeInput,
): Promise<MaterializedPublication> => {
  const { storage } = dependencies;
  /* Resolved through the same refusal `readPublishedTree` answers, because a
     name that was never pushed is a 404 with a sentence, not git's stderr in a
     500 (review R7). */
  const head = await dependencies
    .git(input.repositoryPath, ['rev-parse', `refs/tags/${input.tag}^{commit}`])
    .catch(() => {
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

  return {
    revisionId: revision,
    manifestKey,
    thumbnailKey,
    kernels,
    runtimePin,
    fileCount: uploads.length,
    blobRefs: [...increments.values()],
  };
};

/**
 * Give back the reference counts one superseded manifest held.
 *
 * @param dependencies - Database and storage.
 * @param manifestKey - The manifest a publication no longer points at.
 * @public
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
    shas.map(async (sha256Hex) =>
      dependencies.databaseService.database
        .update(schema.blobRef)
        .set({ refcount: sql`greatest(0, ${schema.blobRef.refcount} - 1)` })
        .where(eq(schema.blobRef.sha256, sha256Hex)),
    ),
  );
};

/**
 * Re-materialize every publication a just-pushed tag names.
 *
 * Called by `GitRepositoryService` after `receive-pack` exits, from the API's
 * own background set — never from inside the hook, which runs in the git
 * child's budget. A tag nobody published is not work: the query answers empty
 * and nothing is read.
 *
 * @param dependencies - Database and storage.
 * @param input - The project, its repository, and the tags the push moved.
 * @returns The publications that were re-materialized.
 * @public
 */
export const materializePublishedTags = async (
  dependencies: MaterializerDependencies,
  input: Readonly<{ projectId: string; repositoryPath: string; tags: readonly string[] }>,
): Promise<readonly string[]> => {
  const materialized: string[] = [];
  for (const tag of new Set(input.tags)) {
    // oxlint-disable-next-line no-await-in-loop -- one publication's bytes at a time; this runs in the background set, not on a request.
    const rows = await dependencies.databaseService.database
      .select()
      .from(schema.publication)
      .where(and(eq(schema.publication.projectId, input.projectId), eq(schema.publication.tag, tag)));
    for (const row of rows) {
      // oxlint-disable-next-line no-await-in-loop -- sequential by design, see above.
      const result = await materializePublication(dependencies, {
        publicationId: row.id,
        projectId: input.projectId,
        repositoryPath: input.repositoryPath,
        tag,
        visibility: row.visibility === 'private' ? 'private' : 'public',
        entryPath: row.entryPath,
      });
      if (result.manifestKey === row.manifestKey) {
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- sequential by design, see above.
      await dependencies.databaseService.database.transaction(async (transaction) => {
        await applyBlobReferences(transaction, result.blobRefs);
        await transaction
          .update(schema.publication)
          .set({
            manifestKey: result.manifestKey,
            thumbnailKey: result.thumbnailKey,
            kernels: [...result.kernels],
            /* The name moved, so the row must say which revision a viewer is
             * now being served (the manifest is keyed by it). */
            revisionId: result.revisionId,
          })
          .where(eq(schema.publication.id, row.id));
      });
      // oxlint-disable-next-line no-await-in-loop -- sequential by design, see above.
      await releaseManifestBlobs(dependencies, row.manifestKey);
      materialized.push(row.id);
    }
  }
  return materialized;
};
