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
import type { CheckedFileWriteResult, FileStat } from '@taucad/types';
import { assertRootedPath } from '@taucad/utils/path';

/** Wire version. Bump on any incompatible request/response shape change. @public */
export const nodeFsProtocolVersion = 2;

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

export const nodeFsRequestSchema = z.discriminatedUnion('op', [
  z.object({ ...rooted, op: z.literal('readFile'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('writeFile'), path: z.string(), data: dataSchema }),
  checkedWriteRequestSchema,
  z.object({ ...rooted, op: z.literal('readdir'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('stat'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('mkdir'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('unlink'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('rmdir'), path: z.string() }),
  z.object({ ...rooted, op: z.literal('rename'), from: z.string(), to: z.string() }),
  z.object({ ...rooted, op: z.literal('watch'), request: watchRequestSchema }),
  z.object({ ...versioned, op: z.literal('unwatch') }),
]);

/** One request frame. @public */
export type NodeFsRequest = z.infer<typeof nodeFsRequestSchema>;

const fileStatSchema = z.union([
  z.object({ type: z.literal('dir'), size: z.number(), mtimeMs: z.number() }),
  z.object({
    type: z.literal('file'),
    size: z.number(),
    mtimeMs: z.number(),
    contentKind: z.literal('binary'),
  }),
  z.object({
    type: z.literal('file'),
    size: z.number(),
    mtimeMs: z.number(),
    contentKind: z.literal('text'),
    lineCount: z.number(),
  }),
]) as z.ZodType<FileStat>;

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
  z.object({ ...versioned, type: z.literal('watch'), event: watchEventSchema }),
]);

/** One response frame. @public */
export type NodeFsResponse = z.infer<typeof nodeFsResponseSchema>;

/** Per-operation result validators, so a drifting host cannot poison the tree. */
export const nodeFsResultSchemas = {
  readFile: bytesSchema,
  writeFile: z.undefined(),
  writeFileChecked: checkedWriteResultSchema,
  readdir: z.array(z.string()),
  stat: fileStatSchema,
  mkdir: z.undefined(),
  unlink: z.undefined(),
  rmdir: z.undefined(),
  rename: z.undefined(),
  watch: z.undefined(),
  unwatch: z.undefined(),
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
