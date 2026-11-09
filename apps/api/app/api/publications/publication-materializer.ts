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

import type { Readable } from 'node:stream';
import { and, eq, gt, sql } from 'drizzle-orm';
import {
  isPublicationSystemArtifact,
  publicationApiCode,
  publicationMaxUserFiles,
  publishForbiddenPathPrefixes,
  isPublishableTauPath,
} from '@taucad/types/constants';
import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import type { DatabaseService } from '@taucad/api-database';
import * as schema from '@taucad/api-database/schema';
import { assertProjectActive } from '@taucad/api-database/project-lifecycle';
import { detectKernelIdsFromRelativePaths, resolveRuntimePin } from '#api/publications/publication-runtime.utils.js';
import type { StoredPublicationManifest } from '#api/publications/publications.dto.js';
import { storedPublicationManifestSchema } from '#api/publications/publications.dto.js';
import { isS3ObjectMissing } from '@taucad/api-object-storage';
import type { ObjectStorageService, StorageTier } from '@taucad/api-object-storage';
import type { StorageNamespace } from '@taucad/api-object-storage/constants';
import { blobKeyFromSha256Hex, sha256HexFromBytes } from '@taucad/api-object-storage/sha256';

/** Everything this module logs: an over-release, and nothing else. */
const logger = new Logger('PublicationMaterializer');

/**
 * The most one published file may be: a product limit on what a viewer is
 * served. The materializer streams, so this no longer bounds its memory.
 */
export const maxBytesPerPublishedFile = 25 * 1024 * 1024;
/**
 * The most one publication may be, across its files: a product limit, like
 * {@link maxBytesPerPublishedFile}, and no longer a memory guard.
 */
export const maxPublishedTotalBytes = 50 * 1024 * 1024;

/**
 * Git blob bytes one `cat-file --batch` child answers at once, and the most the
 * describe pass keeps for the uploads after it. A blob larger than this is read
 * alone, so a batch is at most this or one file under the per-file ceiling.
 */
export const materializerBatchBytes = 8 * 1024 * 1024;

/** Blobs looked up, copied or written at once. */
const uploadConcurrency = 4;

/**
 * One bounded `git` invocation inside a lease directory.
 *
 * Supplied by the caller rather than spawned here, so a caller that counts its
 * git children — the smart-HTTP route does — counts these too rather than
 * letting N concurrent pushes each add an uncounted `ls-tree`/`cat-file` pair
 * (review R8). On tau-api that caller is the forwarded `git-read` to
 * tau-storage (DC1); this module spawns no git child of its own (DC3).
 */
export type GitChildRunner = (
  directory: string,
  args: readonly string[],
  stdin?: string,
) => Promise<Uint8Array<ArrayBuffer>>;

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
  /** Manifest whose references this row already holds under the caller's project lock. */
  heldManifestKey?: string;
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

/** Where one LFS object is held, as the resolver answers it. */
type LfsLocation = NonNullable<Awaited<ReturnType<LfsObjectResolver>>>;

/**
 * One publishable file, described without its bytes.
 *
 * A git blob is hashed as its batch passes and let go; an LFS object is never
 * read here at all, because its oid is its SHA-256 and the store checked that
 * when the object was uploaded (the LFS endpoint signs every upload with the
 * oid as its `x-amz-checksum-sha256`).
 */
export type PublishedFile = Readonly<{
  path: string;
  sha: string;
  sizeBytes: number;
  source:
    | Readonly<{ kind: 'git'; objectId: string }>
    /** `verified` when the store reports the oid as the checksum it checked on write. */
    | Readonly<{ kind: 'lfs'; location: LfsLocation; verified: boolean; etag: string }>;
}>;

/** A tagged tree, described: every file, and the git bytes kept for the uploads. */
export type PublishedTree = Readonly<{
  files: readonly PublishedFile[];
  /** Git blob bytes by object id, kept while they fit one batch, so most publishes read git once. */
  retained: ReadonlyMap<string, Uint8Array<ArrayBuffer>>;
}>;

/**
 * Split entries into `cat-file` batches of at most {@link materializerBatchBytes}
 * listed bytes; a larger entry goes alone.
 *
 * @param entries - Listed entries, one per object.
 * @returns The batches, in order.
 */
const batchesOf = (entries: readonly TreeEntry[]): ReadonlyArray<readonly TreeEntry[]> => {
  const batches: TreeEntry[][] = [];
  let current: TreeEntry[] = [];
  let currentBytes = 0;
  for (const entry of entries) {
    if (current.length > 0 && currentBytes + entry.sizeBytes > materializerBatchBytes) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(entry);
    currentBytes += entry.sizeBytes;
  }
  if (current.length > 0) {
    batches.push(current);
  }
  return batches;
};

/**
 * Run `work` over `items`, at most `limit` at once.
 *
 * @param items - The work items.
 * @param limit - How many run at once.
 * @param work - One item's work.
 */
const forEachLimited = async <Item>(
  items: readonly Item[],
  limit: number,
  work: (item: Item) => Promise<void>,
): Promise<void> => {
  let next = 0;
  /* The first failure stops every lane taking another item, and is raised only
     once the items already started have settled: a failed publish rolls back its
     references, so nothing may still be writing into the store after it. */
  const failures: unknown[] = [];
  const lane = async (): Promise<void> => {
    while (failures.length === 0 && next < items.length) {
      const item = items[next] as Item;
      next += 1;
      try {
        // oxlint-disable-next-line no-await-in-loop -- each lane runs its items in turn; the lanes run together.
        await work(item);
      } catch (error) {
        failures.push(error);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => lane()));
  if (failures.length > 0) {
    // oxlint-disable-next-line typescript/only-throw-error -- the first failure, as it was raised.
    throw failures[0];
  }
};

const fileTooLarge = (path: string): BadRequestException =>
  new BadRequestException({
    code: publicationApiCode.FILE_TOO_LARGE,
    message: `File exceeds ${String(maxBytesPerPublishedFile)} bytes: ${path}`,
  });

const payloadTooLarge = (): BadRequestException =>
  new BadRequestException({
    code: publicationApiCode.PAYLOAD_TOO_LARGE,
    message: 'This version is larger than a publication may be',
  });

/** The base64 SHA-256 a store reports, for a hex digest. */
const base64Sha256 = (sha256Hex: string): string => Buffer.from(sha256Hex, 'hex').toString('base64');

/**
 * Describe one named version without holding it: every publishable file's
 * digest, size and source, with LFS pointers resolved to where their objects
 * are held.
 *
 * Every ceiling is enforced before the bytes it bounds are read: the listed
 * sizes before any `cat-file`, and an LFS object's size from its pointer — and
 * the store's own record of it — before the object is touched. Git blobs are
 * read in batches of {@link materializerBatchBytes}, so what is resident is one
 * batch and the bytes kept for the uploads, never the tree.
 *
 * @param dependencies - The git runner, storage and the LFS resolver.
 * @param input - The repository, project and tag.
 * @returns The described tree.
 * @throws NotFoundException When the tag names nothing, or an object never arrived.
 * @throws BadRequestException When the tree breaks a publication limit.
 */
export const describePublishedTree = async (
  dependencies: MaterializerDependencies,
  input: Readonly<{ directory: string; projectId: string; ownerId: string; tag: string }>,
): Promise<PublishedTree> => {
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

  /* The listed sizes first, before any object is read (review R5). An LFS
     pointer lists as its own few hundred bytes, so its object's size is checked
     again below, from the pointer, before the object is touched. */
  let listedBytes = 0;
  for (const entry of entries) {
    if (entry.sizeBytes > maxBytesPerPublishedFile) {
      throw fileTooLarge(entry.path);
    }
    listedBytes += entry.sizeBytes;
  }
  if (listedBytes > maxPublishedTotalBytes) {
    throw payloadTooLarge();
  }

  const unique = [...new Map(entries.map((entry) => [entry.objectId, entry])).values()];
  const described = new Map<string, Omit<PublishedFile, 'path'>>();
  const pointers = new Map<string, Readonly<{ entry: TreeEntry; oid: string; size: number }>>();
  const retained = new Map<string, Uint8Array<ArrayBuffer>>();
  let retainedBytes = 0;
  for (const batch of batchesOf(unique)) {
    // oxlint-disable-next-line no-await-in-loop -- one batch resident at a time is the point of the batches.
    const objects = await readBlobs(dependencies.git, input.directory, batch);
    for (const entry of batch) {
      const stored = objects.get(entry.objectId);
      if (stored === undefined) {
        continue;
      }
      const pointer = parseLfsPointer(stored);
      if (pointer !== undefined) {
        if (pointer.size > maxBytesPerPublishedFile) {
          throw fileTooLarge(entry.path);
        }
        pointers.set(entry.objectId, { entry, ...pointer });
        continue;
      }
      described.set(entry.objectId, {
        sha: sha256HexFromBytes(stored),
        sizeBytes: stored.byteLength,
        source: { kind: 'git', objectId: entry.objectId },
      });
      if (retainedBytes + stored.byteLength <= materializerBatchBytes) {
        retained.set(entry.objectId, stored);
        retainedBytes += stored.byteLength;
      }
    }
  }

  /* The whole publication at its served sizes — an LFS file at its object's,
     from the pointer — before any object is located. */
  let totalBytes = 0;
  for (const entry of entries) {
    totalBytes += described.get(entry.objectId)?.sizeBytes ?? pointers.get(entry.objectId)?.size ?? 0;
    if (totalBytes > maxPublishedTotalBytes) {
      throw payloadTooLarge();
    }
  }

  await forEachLimited([...pointers.values()], uploadConcurrency, async ({ entry, oid, size }) => {
    const location = await locateLfsObject(dependencies, {
      projectId: input.projectId,
      ownerId: input.ownerId,
      oid,
      size,
    });
    described.set(entry.objectId, { sha: oid, sizeBytes: size, source: { kind: 'lfs', ...location } });
  });

  const files = entries.flatMap((entry): PublishedFile[] => {
    const file = described.get(entry.objectId);
    return file === undefined ? [] : [{ path: entry.path, ...file }];
  });
  return { files, retained };
};

/**
 * The first bytes of one described file, for a check that needs only its head.
 *
 * @param dependencies - The git runner and storage.
 * @param read - The lease directory, the described tree (whose kept bytes are
 *   used where they are), the file and how many bytes.
 * @returns Up to `length` bytes from the start of the file.
 */
const readHead = async (
  dependencies: MaterializerDependencies,
  read: Readonly<{ directory: string; tree: PublishedTree; file: PublishedFile; length: number }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { directory, tree, file, length } = read;
  if (file.source.kind === 'git') {
    const { objectId } = file.source;
    const kept = tree.retained.get(objectId);
    const fetched =
      kept === undefined
        ? await readBlobs(dependencies.git, directory, [{ path: file.path, objectId, sizeBytes: 0 }])
        : undefined;
    const bytes = kept ?? fetched?.get(objectId);
    return new Uint8Array(bytes?.subarray(0, length) ?? new Uint8Array());
  }
  if (file.sizeBytes === 0) {
    return new Uint8Array();
  }
  const stored = await dependencies.storage.getBlob({
    ...file.source.location,
    range: { start: 0, end: Math.min(length, file.sizeBytes) - 1 },
  });
  const head = await readStream(stored.body);
  return head.subarray(0, length);
};

/**
 * The files of one named version with their bytes, LFS pointers resolved.
 *
 * This reads every byte of the version into memory, so the materializer never
 * calls it: it is the whole-tree view the tests compare against a stock clone,
 * built on {@link describePublishedTree} so it enforces the same refusals.
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
  const tree = await describePublishedTree(dependencies, input);
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const file of tree.files) {
    // oxlint-disable-next-line no-await-in-loop -- one file's bytes read at a time.
    files.set(file.path, await readPublishedFile(dependencies, { directory: input.directory, tree, file }));
  }
  return files;
};

/**
 * One described file's whole bytes.
 *
 * @param dependencies - The git runner and storage.
 * @param request - The lease directory, the described tree and the file.
 * @returns Its bytes.
 */
const readPublishedFile = async (
  dependencies: MaterializerDependencies,
  request: Readonly<{ directory: string; tree: PublishedTree; file: PublishedFile }>,
): Promise<Uint8Array<ArrayBuffer>> => {
  const { directory, tree, file } = request;
  if (file.source.kind === 'lfs') {
    return readLfsObject(dependencies, file.source.location);
  }
  const kept = tree.retained.get(file.source.objectId);
  if (kept !== undefined) {
    return kept;
  }
  const read = await readBlobs(dependencies.git, directory, [
    { path: file.path, objectId: file.source.objectId, sizeBytes: file.sizeBytes },
  ]);
  return read.get(file.source.objectId) ?? new Uint8Array();
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
 * Where one LFS object is held, checked against its pointer without reading it.
 *
 * @param dependencies - Storage and the LFS resolver.
 * @param object - Whose storage and project, the pointer's oid and size.
 * @returns The location, whether the store vouches for the oid as its checksum, and the ETag it holds.
 * @throws NotFoundException When the object never arrived, or arrived at another size.
 */
const locateLfsObject = async (
  dependencies: MaterializerDependencies,
  object: Readonly<{ projectId: string; ownerId: string; oid: string; size: number }>,
): Promise<Readonly<{ location: LfsLocation; verified: boolean; etag: string }>> => {
  /* Where the object actually is: the tenant key every upload now lands at
     (D24), or the pre-D24 key under `blobs/` for a project whose objects have
     not been relocated yet. One resolver, the LFS endpoint's own, so a
     publication reads exactly where that endpoint serves from (W4b). */
  const location = await dependencies.resolveLfsObject(object);
  if (location === undefined) {
    throw lfsObjectNotUploaded();
  }
  const held = await dependencies.storage.headBlob({ ...location, checksum: true });
  /* A store whose object is gone, or holds another length than the pointer
     names, does not hold this object: the push did not finish. */
  if (held === undefined || held.size !== object.size) {
    throw lfsObjectNotUploaded();
  }
  /* Only a tenant key's writers pin the checksum to the oid (the LFS endpoint
     signs each upload with it); a legacy key's checksum is never trusted, so
     its object streams under the oid instead (git-lfs.service.ts). */
  const verified = location.namespace === 'tenants' && held.checksumSha256 === base64Sha256(object.oid);
  return { location, verified, etag: held.etag };
};

/**
 * One LFS object's bytes, from the layout the LFS endpoint writes (W9, W11a).
 *
 * @param dependencies - Storage.
 * @param location - Where the object is held.
 * @returns The object's bytes.
 * @throws NotFoundException When the object is not there.
 */
const readLfsObject = async (
  dependencies: MaterializerDependencies,
  location: LfsLocation,
): Promise<Uint8Array<ArrayBuffer>> => {
  try {
    const stored = await dependencies.storage.getBlob(location);
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

/** One blob the publication store must hold, under one content type. */
type BlobUpload = Readonly<{ file: PublishedFile; contentType: string }>;

const cacheControlFor = (tier: StorageTier): string =>
  tier === 'private' ? 'private, no-cache' : 'public, max-age=31536000, immutable';

/**
 * Put one LFS object into the publication store without reading it here.
 *
 * A store that vouches for the oid is asked to copy it server-side; one that
 * does not, or that refuses the copy, has the object streamed through with the
 * oid as the checksum it must verify, so the blob keyed by that digest can only
 * ever hold the bytes it names.
 *
 * @param dependencies - Storage.
 * @param upload - The object and its content type.
 * @param destination - The blob key and tier.
 */
const putLfsBlob = async (
  dependencies: MaterializerDependencies,
  upload: BlobUpload,
  destination: Readonly<{ key: string; tier: StorageTier }>,
): Promise<void> => {
  const { file, contentType } = upload;
  if (file.source.kind !== 'lfs') {
    return;
  }
  const { storage } = dependencies;
  const target = { namespace: 'blobs', key: destination.key, tier: destination.tier } as const;
  const cacheControl = cacheControlFor(destination.tier);
  if (file.source.verified) {
    try {
      /* Copied only if the object is still the one its HEAD vouched for. */
      await storage.copyObject({
        source: file.source.location,
        destination: target,
        contentType,
        cacheControl,
        ...(file.source.etag === '' ? {} : { sourceIfMatch: file.source.etag }),
      });
      return;
    } catch (error) {
      if (isS3ObjectMissing(error)) {
        throw lfsObjectNotUploaded();
      }
      /* A store that cannot copy between these buckets still takes a stream. */
      logger.warn({ key: destination.key, error }, 'A server-side LFS copy was refused; streaming the object instead');
    }
  }
  let stored: Awaited<ReturnType<ObjectStorageService['getBlob']>>;
  try {
    stored = await storage.getBlob(file.source.location);
  } catch (error) {
    if (!isS3ObjectMissing(error)) {
      throw error;
    }
    throw lfsObjectNotUploaded();
  }
  try {
    await storage.putBlobStream({
      ...target,
      body: stored.body,
      contentLength: file.sizeBytes,
      contentType,
      cacheControl,
      checksumSha256: base64Sha256(file.sha),
    });
  } catch (error) {
    /* A refused put leaves the read open: let go of it rather than the socket. */
    stored.body.destroy();
    throw error;
  }
};

/**
 * Write every blob the store does not already hold, a bounded number at once.
 *
 * Git bytes kept from the describe pass are written directly; the rest are read
 * again in batches, and only for blobs the store lacks, so a re-publish of
 * unchanged content reads git once. LFS objects never pass through here.
 *
 * @param dependencies - The git runner and storage.
 * @param upload - The lease directory, the described tree and which bucket the blobs go to.
 */
const uploadPublishedBlobs = async (
  dependencies: MaterializerDependencies,
  upload: Readonly<{ directory: string; tree: PublishedTree; tier: StorageTier }>,
): Promise<void> => {
  const { directory, tree, tier } = upload;
  const { storage } = dependencies;
  const uploads = [
    ...new Map(
      tree.files.map((file) => {
        const contentType = publicationContentType(file.path);
        return [`${file.sha}:${contentType}`, { file, contentType }] as const;
      }),
    ).values(),
  ];
  const missing: Array<BlobUpload & { exists: boolean }> = [];
  await forEachLimited(uploads, uploadConcurrency, async (upload) => {
    const existing = await storage.headBlob({ namespace: 'blobs', key: blobKeyFromSha256Hex(upload.file.sha), tier });
    if (existing === undefined || existing.contentType !== upload.contentType) {
      missing.push({ ...upload, exists: existing !== undefined });
    }
  });

  const putGitBlob = async (upload: BlobUpload & { exists: boolean }, body: Uint8Array<ArrayBuffer>): Promise<void> => {
    await storage.putBlob({
      namespace: 'blobs',
      key: blobKeyFromSha256Hex(upload.file.sha),
      body,
      contentType: upload.contentType,
      ...(upload.exists ? {} : { ifNoneMatch: '*' }),
      cacheControl: cacheControlFor(tier),
      tier,
    });
  };

  const lfs = missing.filter((upload) => upload.file.source.kind === 'lfs');
  const gitUploads = missing.filter(
    (upload): upload is BlobUpload & { exists: boolean; file: PublishedFile & { source: { kind: 'git' } } } =>
      upload.file.source.kind === 'git',
  );
  const kept = gitUploads.filter((upload) => tree.retained.has(upload.file.source.objectId));
  const reread = gitUploads.filter((upload) => !tree.retained.has(upload.file.source.objectId));

  await forEachLimited(lfs, uploadConcurrency, async (upload) =>
    putLfsBlob(dependencies, upload, { key: blobKeyFromSha256Hex(upload.file.sha), tier }),
  );
  await forEachLimited(kept, uploadConcurrency, async (upload) =>
    putGitBlob(upload, tree.retained.get(upload.file.source.objectId) ?? new Uint8Array()),
  );
  const byObject = new Map(reread.map((upload) => [upload.file.source.objectId, upload]));
  const listed = [...byObject.values()].map(({ file }) => ({
    path: file.path,
    objectId: file.source.objectId,
    sizeBytes: file.sizeBytes,
  }));
  for (const batch of batchesOf(listed)) {
    // oxlint-disable-next-line no-await-in-loop -- one batch resident at a time.
    const objects = await readBlobs(dependencies.git, directory, batch);
    const batchUploads = reread.filter((upload) => objects.has(upload.file.source.objectId));
    // oxlint-disable-next-line no-await-in-loop -- the batch is written before the next is read.
    await forEachLimited(batchUploads, uploadConcurrency, async (upload) =>
      putGitBlob(upload, objects.get(upload.file.source.objectId) ?? new Uint8Array()),
    );
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
  const manifestKey = `publications/${input.publicationId}/${revision}.json`;
  const tree = await describePublishedTree(dependencies, input);
  const tier: StorageTier = input.visibility === 'private' ? 'private' : 'public';
  const byPath = new Map(tree.files.map((file) => [file.path, file]));

  /* A manifest that names a file it has no digest for is a publication whose
     viewer opens nothing, so the entry path is checked against the tree rather
     than trusted from the request. */
  if (input.entryPath !== undefined && input.entryPath !== '' && !byPath.has(normalizeRelativePath(input.entryPath))) {
    throw new NotFoundException({
      code: publicationApiCode.MISSING_ENTRY_PATH,
      message: `This version does not contain ${input.entryPath}.`,
    });
  }

  /* The RIFF/WEBP header is all the check reads: twelve bytes, from git or by a
     ranged read of the LFS object. */
  const thumbnailFile = byPath.get('thumbnail.webp');
  if (
    thumbnailFile !== undefined &&
    !isWebp(await readHead(dependencies, { directory: input.directory, tree, file: thumbnailFile, length: 12 }))
  ) {
    throw new BadRequestException({
      code: publicationApiCode.INVALID_THUMBNAIL_WEBP,
      message: 'thumbnail.webp is not a valid WebP file',
    });
  }

  const uploads = tree.files;

  const increments = new Map<string, BlobRefIncrement>();
  for (const { sizeBytes, sha } of uploads) {
    const existing = increments.get(sha);
    increments.set(
      sha,
      existing === undefined ? { sha256: sha, sizeBytes, count: 1 } : { ...existing, count: existing.count + 1 },
    );
  }

  /* The fence: every reference is taken, in the caller's transaction, before
     any blob is looked up or written (D10 — see this function's contract). */
  /* Sorted by digest, because these upserts take row locks held to commit:
     two publishes sharing blobs in different tree order would otherwise take
     the same rows in opposite orders and deadlock (review F3). */
  const blobReferences = [...increments.values()].sort((left, right) => (left.sha256 < right.sha256 ? -1 : 1));
  // Re-publishing identical content retains the row's existing references.
  // Taking them again without moving the manifest would leak counts on deletion.
  const newReferences = input.heldManifestKey === manifestKey ? [] : blobReferences;
  await applyBlobReferences(writer, newReferences);

  /* A bounded number at once, LFS objects copied in the store and git bytes
     from the describe pass or a batch re-read: never the tree in memory. */
  await uploadPublishedBlobs(dependencies, { directory: input.directory, tree, tier });

  const thumbnail = uploads.find((upload) => upload.path === 'thumbnail.webp');
  const thumbnailKey = thumbnail ? `blobs/${blobKeyFromSha256Hex(thumbnail.sha)}` : 'defaults/thumb.webp';
  const kernels = detectKernelIdsFromRelativePaths(uploads.map((upload) => upload.path));
  const runtimePin = resolveRuntimePin();

  /* Keyed by the revision, so a re-publish writes a new immutable object
   * rather than overwriting the one a viewer may be reading. */
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
    blobRefs: newReferences,
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
  /* A retired publication is not derived state any more: the ref-removal verb
     retires the one a removed name backed (D24), and a later push that
     re-creates the name must not bring it back. Publishing it again is the
     owner's explicit act, which re-points the row. */
  const published = rows.filter((row) => oidByTag.has(row.tag) && row.unpublishedAt === null);
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
        await assertProjectActive(transaction, input.projectId);
        /* Re-read under the lock: whoever waited here may be looking at work
           the holder just did, and materializing it again would take a second
           reference for one manifest. */
        const [fresh] = await transaction
          .select({ manifestKey: schema.publication.manifestKey, unpublishedAt: schema.publication.unpublishedAt })
          .from(schema.publication)
          .where(eq(schema.publication.id, row.id))
          .limit(1);
        if (fresh === undefined || fresh.unpublishedAt !== null || fresh.manifestKey !== superseded) {
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
