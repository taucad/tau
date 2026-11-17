/**
 * Versioned wire protocol for the node filesystem provider client/host pair.
 *
 * Deliberately dependency-light: this module is imported by the client half,
 * which runs inside the renderer's file-manager worker, so it must never reach
 * `node:*` or `@taucad/rpc` (the library's import boundary forbids the latter
 * outright). The 8 abstract provider primitives plus a watch subscription are
 * the entire surface that crosses the process seam — ruling D6's
 * `FileSystemProvider` boundary, with `root` making each request a rooted view.
 */

import { z } from 'zod';
import type { CheckedFileWriteResult } from '@taucad/types';
import { assertRootedPath } from '@taucad/utils/path';
import type { FileMode, FileStat } from '#types.js';
import { streamChunkSize } from '#backend/stream-utils.js';
import { maximumChangesetEntries } from '#changeset.js';

/**
 * Wire version. Version 7 carries directory entry kinds without per-child stat
 * requests; version 8 adds `hashFiles`, digests computed beside the bytes;
 * version 9 drops the head-only stat and listing modes, and a stat or listing
 * row carries content facts only when already known (I3); version 10 adds
 * `applyBatch`, one changeset phase per request, fsynced once per directory (D16);
 * version 11 lets a batch write name a large object by its id, for the host to
 * clone from the root's store, and answers its verified id (EQ13); version 12
 * adds the import of a source a person chose on the host (W7.4): its listing
 * and preview by an opaque grant, and `importCopy`, which copies its files into
 * a root host-side and answers the facts hashed from what landed (D12, I6).
 * @public
 */
export const nodeFsProtocolVersion = 12;

/**
 * Most watch events one frame carries. The host sends what one native callback reported as one frame, so a bulk
 * change (a checkout, an install) crosses the port as a few frames rather than one per path. @internal
 */
export const nodeFsMaxWatchBatch = 512;

/**
 * Watch event as it crosses the port. A superset of the library's
 * {@link import('#types.js').WatchEvent}: `change` carries the entry kind the
 * host already had to `stat` for, so the renderer classifies without a second
 * cross-process round trip.
 * @public
 */
export type NodeFsWatchEvent =
  | { readonly type: 'change'; readonly path: string; readonly kind: 'file' | 'dir' }
  | { readonly type: 'delete'; readonly path: string }
  | { readonly type: 'reset' };

/** Raised when a peer speaks a different protocol version. @public */
export class NodeFsProtocolVersionError extends Error {
  /**
   * Stable error code.
   * @returns The literal `'NODE_FS_PROTOCOL_VERSION'`.
   */
  public get code(): 'NODE_FS_PROTOCOL_VERSION' {
    return 'NODE_FS_PROTOCOL_VERSION';
  }

  public constructor(received: unknown) {
    super(`Unsupported node filesystem protocol version: ${String(received)}`);
    this.name = 'NodeFsProtocolVersionError';
  }
}

const bytesSchema = z.instanceof(Uint8Array);
const dataSchema = z.union([bytesSchema, z.string()]);
const maximumCheckedWritePreconditions = 32;
const maximumCheckedWriteBytes = 8 * 1024 * 1024;
/** Paths one `hashFiles` request may name; a caller with more splits them. @internal */
export const maximumHashFilesPaths = 4096;
const rootedPathSchema = z
  .string()
  .max(4096)
  .refine((value) => {
    try {
      return assertRootedPath(value) === value;
    } catch {
      return false;
    }
  });

const watchRequestSchema = z.object({
  paths: z.array(z.string()),
  recursive: z.boolean().optional(),
  excludes: z.array(z.string()).optional(),
});

const fileModeEnum = z.enum(['100644', '100755']);
/* A large object the host resolves against the root's own store, by id: never a path (EQ13, I6). */
const largeObjectSourceSchema = z.object({
  largeObject: z.string().regex(/^[\da-f]{64}$/u),
  size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
/* One provider batch entry as it crosses the port: bytes in hand, since a staged `Blob` is read before it is sent,
 * or a large object by its id. */
const batchEntrySchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('write'),
    path: rootedPathSchema,
    data: z.union([bytesSchema, largeObjectSourceSchema]),
    mode: fileModeEnum.optional(),
    create: z.boolean().optional(),
  }),
  z.object({ op: z.literal('append'), path: rootedPathSchema, data: bytesSchema }),
  z.object({
    op: z.literal('delete'),
    path: rootedPathSchema,
    kind: z.enum(['file', 'dir']).optional(),
    recursive: z.boolean().optional(),
  }),
  z.object({ op: z.literal('move'), from: rootedPathSchema, to: rootedPathSchema, replace: z.boolean().optional() }),
  z.object({ op: z.literal('mkdir'), path: rootedPathSchema, recursive: z.boolean().optional() }),
]);
/* A grant is an opaque token the host minted when a person chose a source: never a host path (I6). */
const importGrantSchema = z.string().regex(/^[\w-]{8,128}$/u);
/* A path inside a granted source, as the importer spells it: relative, `/`-separated, `''` for the source itself. */
const importSourcePathSchema = z
  .string()
  .max(4096)
  .refine(
    (value) =>
      value === '' || value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    {
      message: 'An import source path is relative and plain.',
    },
  );
/** Rows one `importSourceList` reply carries at most. @internal */
export const maximumImportSourceRows = 1024;
/** Bytes one `importSourceRead` reply carries at most. @internal */
export const maximumImportSourceReadBytes = streamChunkSize * 16;
/** Files one `importCopy` request may carry: a changeset's own ceiling. @internal */
export const maximumImportCopyEntries = maximumChangesetEntries;

/** Entries one `applyBatch` request may carry: a changeset's own ceiling. @internal */
export const maximumBatchRequestEntries = maximumChangesetEntries;

const versioned = { v: z.literal(nodeFsProtocolVersion), id: z.number().int() };
const rooted = { ...versioned, root: z.string() };
const checkedWriteRequestSchema = z
  .object({
    ...rooted,
    op: z.literal('writeFileChecked'),
    path: rootedPathSchema,
    data: dataSchema,
    preconditions: z
      .array(z.object({ path: rootedPathSchema, expected: dataSchema.nullable() }))
      .min(1)
      .max(maximumCheckedWritePreconditions),
  })
  .refine(
    (request) =>
      [request.data, ...request.preconditions.map(({ expected }) => expected)].reduce(
        (total, value) =>
          total +
          (value === null
            ? 0
            : typeof value === 'string'
              ? new TextEncoder().encode(value).byteLength
              : value.byteLength),
        0,
      ) <= maximumCheckedWriteBytes,
    { message: 'Checked write request exceeds its byte budget.' },
  )
  .refine((request) => request.preconditions.some(({ path }) => path === request.path), {
    message: 'Checked writes require a destination precondition.',
  });
const checkedDeleteRequestSchema = z
  .object({
    ...rooted,
    op: z.literal('deleteFileChecked'),
    path: rootedPathSchema,
    preconditions: z
      .array(z.object({ path: rootedPathSchema, expected: dataSchema.nullable() }))
      .min(1)
      .max(maximumCheckedWritePreconditions),
  })
  .refine((request) => request.preconditions.some(({ path }) => path === request.path), {
    message: 'Checked deletes require a destination precondition.',
  })
  .refine(
    (request) =>
      request.preconditions.reduce(
        (total, { expected }) =>
          total +
          (expected === null
            ? 0
            : typeof expected === 'string'
              ? new TextEncoder().encode(expected).byteLength
              : expected.byteLength),
        0,
      ) <= maximumCheckedWriteBytes,
    { message: 'Checked delete request exceeds its byte budget.' },
  );

export const nodeFsRequestSchema = z.discriminatedUnion('op', [
  z.object({ ...rooted, op: z.literal('readFile'), path: z.string() }),
  /* One bounded chunk of a streamed read: the client pulls `readFileStream` a chunk at a time. */
  z.object({
    ...rooted,
    op: z.literal('readFileRange'),
    path: z.string(),
    position: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    length: z.number().int().positive().max(streamChunkSize),
  }),
  z.object({ ...rooted, op: z.literal('writeFile'), path: z.string(), data: dataSchema }),
  checkedWriteRequestSchema,
  checkedDeleteRequestSchema,
  z.object({ ...rooted, op: z.literal('hashFiles'), paths: z.array(rootedPathSchema).max(maximumHashFilesPaths) }),
  z.object({
    ...rooted,
    op: z.literal('applyBatch'),
    entries: z.array(batchEntrySchema).max(maximumBatchRequestEntries),
  }),
  z.object({ ...rooted, op: z.literal('readdir'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('readdirEntries'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('readdirWithStats'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('stat'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('getFileMode'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('setFileMode'), path: z.string(), mode: z.enum(['100644', '100755']) }),
  z.object({ ...rooted, op: z.literal('mkdir'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('unlink'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('rmdir'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('rename'), from: z.string(), to: z.string() }),
  z.object({ ...rooted, op: z.literal('watch'), request: watchRequestSchema }),
  z.object({ ...versioned, op: z.literal('unwatch') }),
  /* Rootless: a granted source is the host's to resolve, whatever root the import lands in. */
  /* One page of a directory: a reply carries a bounded number of rows, so a huge directory is never one frame. */
  z.object({
    ...versioned,
    op: z.literal('importSourceList'),
    grant: importGrantSchema,
    path: importSourcePathSchema,
    offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  }),
  z.object({
    ...versioned,
    op: z.literal('importSourceRead'),
    grant: importGrantSchema,
    path: importSourcePathSchema,
    position: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    /* One bounded range a reply carries; a longer preview is read a range at a time. */
    maximumBytes: z.number().int().nonnegative().max(maximumImportSourceReadBytes),
  }),
  z.object({
    ...rooted,
    op: z.literal('importCopy'),
    grant: importGrantSchema,
    entries: z
      .array(
        z.object({
          from: importSourcePathSchema,
          path: rootedPathSchema,
          size: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
        }),
      )
      .max(maximumImportCopyEntries),
  }),
]);

/** One request frame. @public */
export type NodeFsRequest = z.infer<typeof nodeFsRequestSchema>;

/* Head metadata (I3): a stat names kind, size and time, never content facts. */
const fileStatSchema = z.union([
  z.object({ type: z.literal('dir'), size: z.number(), mtimeMs: z.number() }),
  z.object({ type: z.literal('file'), size: z.number(), mtimeMs: z.number() }),
]) as z.ZodType<FileStat>;
const fileModeSchema = fileModeEnum as z.ZodType<FileMode>;

/* A batch receipt's error, reduced to what a refusal is told apart by. */
const batchReceiptSchema = z.object({
  outcome: z.enum(['applied', 'failed', 'uncertain']),
  kind: z.enum(['file', 'dir']).optional(),
  created: z.boolean().optional(),
  largeObject: largeObjectSourceSchema.optional(),
  error: z.object({ message: z.string(), code: z.string().optional(), name: z.string().optional() }).optional(),
});

/** One batch receipt as it crosses the port. @internal */
export type NodeFsBatchReceipt = z.infer<typeof batchReceiptSchema>;

/* What a host copy measured from the one read of what landed: the facts an import records (EQ6). */
const importCopyReceiptSchema = batchReceiptSchema.extend({
  facts: z
    .object({
      contentKind: z.enum(['text', 'binary']),
      lineCount: z.number().int().nonnegative().optional(),
      blobOid: z.string().regex(/^[\da-f]{40}$/u),
      sha256: z.string().regex(/^[\da-f]{64}$/u),
    })
    .optional(),
});

/** One import copy receipt as it crosses the port. @internal */
export type NodeFsImportCopyReceipt = z.infer<typeof importCopyReceiptSchema>;

/* One row of a granted directory: a symlink or special entry is named so the importer can count it, never followed. */
const importSourceRowSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(['file', 'dir', 'symlink', 'other']),
  size: z.number().int().nonnegative(),
  mtimeMs: z.number(),
});

/** One row of a granted source's listing. @public */
export type NodeFsImportSourceRow = z.infer<typeof importSourceRowSchema>;

const watchEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('change'), path: z.string(), kind: z.enum(['file', 'dir']) }),
  z.object({ type: z.literal('delete'), path: z.string() }),
  z.object({ type: z.literal('reset') }),
]) as z.ZodType<NodeFsWatchEvent>;

const checkedWriteResultSchema = z.discriminatedUnion('status', [
  z.object({ status: z.enum(['applied', 'unchanged']), content: bytesSchema }),
  z.object({
    status: z.literal('conflict'),
    conflicts: z.array(z.object({ path: z.string(), actual: bytesSchema.nullable() })),
  }),
]) as z.ZodType<CheckedFileWriteResult>;

export const nodeFsResponseSchema = z.discriminatedUnion('type', [
  z.object({ ...versioned, type: z.literal('result'), value: z.unknown() }),
  z.object({
    ...versioned,
    type: z.literal('error'),
    message: z.string(),
    code: z.string().optional(),
    applicationState: z.enum(['known-not-applied', 'potentially-applied']).optional(),
  }),
  z.object({
    ...versioned,
    type: z.literal('watch'),
    events: z.array(watchEventSchema).min(1).max(nodeFsMaxWatchBatch),
  }),
]);

/** One response frame. @public */
export type NodeFsResponse = z.infer<typeof nodeFsResponseSchema>;

/** Per-operation result validators, so a drifting host cannot poison the tree. */
export const nodeFsResultSchemas = {
  readFile: bytesSchema,
  readFileRange: bytesSchema,
  writeFile: z.undefined(),
  writeFileChecked: checkedWriteResultSchema,
  deleteFileChecked: checkedWriteResultSchema,
  applyBatch: z.array(batchReceiptSchema),
  hashFiles: z.record(z.string(), z.union([z.string().regex(/^[0-9a-f]{64}$/u), z.literal('missing')])),
  readdir: z.array(z.string()),
  readdirEntries: z.array(z.object({ name: z.string(), kind: z.enum(['file', 'dir']) })),
  readdirWithStats: z.array(z.object({ name: z.string() }).and(fileStatSchema)),
  stat: fileStatSchema,
  getFileMode: fileModeSchema,
  setFileMode: z.undefined(),
  mkdir: z.undefined(),
  unlink: z.undefined(),
  rmdir: z.undefined(),
  rename: z.undefined(),
  watch: z.undefined(),
  unwatch: z.undefined(),
  importSourceList: z.object({ rows: z.array(importSourceRowSchema).max(maximumImportSourceRows), more: z.boolean() }),
  importSourceRead: bytesSchema,
  importCopy: z.array(importCopyReceiptSchema),
} as const satisfies Record<NodeFsRequest['op'], z.ZodType>;

/**
 * Parse a frame received from the peer, rejecting a version mismatch with a
 * dedicated error rather than a generic validation failure.
 *
 * @param schema - Request or response schema to validate against.
 * @param raw - Structured-cloned frame off the port.
 * @returns The parsed frame.
 */
export function parseNodeFsFrame<Schema extends z.ZodType>(schema: Schema, raw: unknown): z.infer<Schema> {
  const version = (raw as { v?: unknown } | undefined)?.v;
  if (version !== nodeFsProtocolVersion) {
    throw new NodeFsProtocolVersionError(version);
  }
  return schema.parse(raw) as z.infer<Schema>;
}
