import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import { contentDigest, digestContent } from '@taucad/cache-core';
import type { CacheCodec, ComputeAction, EncodedContent } from '@taucad/cache-core';
import { z } from 'zod';
import { defineMiddleware, nativeBuildInputSymbol } from '@taucad/runtime/middleware';
import type { NativeBuildInput, NativeBuildInputCarrier } from '@taucad/runtime/middleware';
import type {
  Artifact,
  EvaluateResult,
  KernelSuccessResult,
  RenderResult,
  KernelExportResult,
} from '@taucad/runtime/types';
import { kernelIssueCodeValues } from '@taucad/runtime/types';
import { nonemptyExportFiles } from '@taucad/runtime/kernel';
import { traceCacheOperation } from '#_internal/cache-span.js';

type BuildCacheResult = Extract<EvaluateResult, { success: true }> & NativeBuildInputCarrier;

const binaryReferenceSchema = z
  .object({
    digest: z.string(),
    byteLength: z.number().int().nonnegative(),
  })
  .strict();
const binaryPathsSchema = z.array(z.array(z.union([z.string(), z.number().int().nonnegative()])).max(128)).max(4096);
const binaryOwnershipLimit = 64 * 1024 * 1024;
const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) &&
  typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

// Paths identify actual binary slots, so ordinary snapshot objects with digest/byteLength fields remain data.
const encodeBinarySlots = async (input: { value: unknown; signal: AbortSignal }) => {
  const content = new Map<string, Uint8Array<ArrayBuffer>>();
  const paths: Array<Array<string | number>> = [];
  const aliases = new WeakMap<ArrayBufferLike, Map<string, z.infer<typeof binaryReferenceSchema>>>();
  const pending: Array<Promise<void>> = [];
  let logicalBytes = 0;
  const visit = (value: unknown, path: Array<string | number>): unknown => {
    input.signal.throwIfAborted();
    if (path.length > 128) {
      throw new Error('Geometry snapshot nesting exceeds its limit.');
    }
    if (value instanceof Uint8Array) {
      logicalBytes += value.byteLength;
      if (logicalBytes > binaryOwnershipLimit) {
        throw new Error('Geometry binary ownership budget exceeded.');
      }
      if (paths.length >= 4096) {
        throw new Error('Geometry snapshot binary inventory exceeds its limit.');
      }
      // Reserve source order before hashing so asynchronous completion cannot reorder metadata.
      paths.push(path);
      const range = `${value.byteOffset}:${value.byteLength}`;
      let ranges = aliases.get(value.buffer);
      const existing = ranges?.get(range);
      if (existing) {
        return existing;
      }
      const bytes = new Uint8Array(value);
      const reference = { digest: '', byteLength: bytes.byteLength };
      pending.push(
        (async () => {
          const digest = await digestContent({ bytes });
          input.signal.throwIfAborted();
          reference.digest = digest;
          content.set(digest, bytes);
        })(),
      );
      if (!ranges) {
        ranges = new Map();
        aliases.set(value.buffer, ranges);
      }
      ranges.set(range, reference);
      return reference;
    }
    if (Array.isArray(value)) {
      return value.map((item, index) => visit(item, [...path, index]));
    }
    if (isPlainRecord(value)) {
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, [...path, key])]));
    }
    return value;
  };
  let value: unknown;
  try {
    value = visit(input.value, []);
  } catch (error) {
    await Promise.allSettled(pending);
    throw error;
  }
  await Promise.all(pending);
  return {
    value,
    paths,
    content: [...content.entries()].sort(([left], [right]) => (left < right ? -1 : 1)).map(([, bytes]) => bytes),
  };
};

const decodeBinarySlots = async (input: {
  value: unknown;
  paths: z.infer<typeof binaryPathsSchema>;
  signal: AbortSignal;
  readContent: Parameters<CacheCodec<unknown>['decode']>[0]['readContent'];
}): Promise<unknown> => {
  const rejectInlineBinary = (slot: unknown, depth: number): void => {
    if (depth > 128) {
      throw new Error('Geometry snapshot nesting exceeds its limit.');
    }
    if (slot instanceof Uint8Array) {
      throw new TypeError('Geometry schema requires referenced binary slots.');
    }
    if (Array.isArray(slot) || isPlainRecord(slot)) {
      for (const item of Object.values(slot)) {
        rejectInlineBinary(item, depth + 1);
      }
    }
  };
  rejectInlineBinary(input.value, 0);
  let { value } = input;
  const seen: Array<Array<string | number>> = [];
  const resolved = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();
  let ownedBytes = 0;
  for (const path of input.paths) {
    input.signal.throwIfAborted();
    if (
      seen.some((prior) =>
        prior.slice(0, Math.min(prior.length, path.length)).every((part, index) => part === path[index]),
      )
    ) {
      throw new Error('Geometry binary paths overlap.');
    }
    seen.push(path);
    let slot = value;
    let parent: Record<string, unknown> | unknown[] | undefined;
    let key: string | number | undefined;
    for (const part of path) {
      const container = Array.isArray(slot) || isPlainRecord(slot) ? slot : undefined;
      if (
        !container ||
        !Object.hasOwn(container, part) ||
        (Array.isArray(container) ? typeof part !== 'number' || part >= container.length : typeof part !== 'string')
      ) {
        throw new Error('Invalid geometry binary path.');
      }
      parent = container;
      key = part;
      slot = Reflect.get(parent, part);
    }
    const reference = binaryReferenceSchema.parse(slot);
    const digest = contentDigest({ value: reference.digest });
    ownedBytes += reference.byteLength;
    if (ownedBytes > binaryOwnershipLimit) {
      throw new Error('Geometry binary ownership budget exceeded.');
    }
    const keyDigest = `${digest}:${reference.byteLength}`;
    let pending = resolved.get(keyDigest);
    if (!pending) {
      pending = (async () => {
        const bytes = await input.readContent?.({ digest });
        input.signal.throwIfAborted();
        if (!bytes || bytes.byteLength !== reference.byteLength) {
          throw new Error('Missing or corrupt geometry binary content.');
        }
        const captured = new Uint8Array(bytes);
        if ((await digestContent({ bytes: captured })) !== digest) {
          throw new Error('Missing or corrupt geometry binary content.');
        }
        return captured;
      })();
      resolved.set(keyDigest, pending);
    }
    // oxlint-disable-next-line no-await-in-loop -- Hydrate independently owned slots from validated memoized leaves.
    const bytes = await pending;
    input.signal.throwIfAborted();
    const owned = new Uint8Array(bytes);
    if (parent && key !== undefined) {
      Object.defineProperty(parent, key, { value: owned, enumerable: true, writable: true, configurable: true });
    } else {
      value = owned;
    }
  }
  return value;
};

const kernelIssueSchema = z
  .object({
    message: z.string(),
    code: z.enum(kernelIssueCodeValues),
    severity: z.enum(['error', 'warning', 'info']),
  })
  .loose();

const offersSchema = z
  .object({
    views: z.array(z.string()).optional(),
    exports: z.array(z.string()).optional(),
    instances: z.record(z.string(), z.array(z.object({ id: z.string(), title: z.string() }))).optional(),
  })
  .strict();
const artifactSchema = z
  .object({
    mimeType: z.string().min(1),
    content: z.union([z.instanceof(Uint8Array), z.string()]),
  })
  .loose();
const successResultShape = {
  success: z.literal(true),
  issues: z.array(kernelIssueSchema),
  serializedHandle: z.unknown().optional(),
};
const nativeBuildInputSchema: z.ZodType<NativeBuildInput> = z
  .object({
    entryPath: z.string(),
    parameters: z.record(z.string(), z.unknown()),
    options: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const buildEntrySchema = z
  .object({
    schemaVersion: z.literal(2),
    binaryPaths: binaryPathsSchema,
    result: z
      .object({
        ...successResultShape,
        data: offersSchema,
      })
      .loose(),
    nativeBuildInput: nativeBuildInputSchema,
  })
  .strict();
const meshEntrySchema = z
  .object({
    schemaVersion: z.literal(2),
    binaryPaths: binaryPathsSchema,
    result: z
      .object({ ...successResultShape, data: z.object({ mimeType: z.string().min(1), content: z.unknown() }).loose() })
      .loose(),
  })
  .strict();
const exportFileSchema = z
  .object({
    name: z.string(),
    mimeType: z.string().min(1),
    bytes: z.instanceof(Uint8Array),
  })
  .loose();
const exportEntrySchema = z
  .object({
    schemaVersion: z.literal(1),
    result: z.object({ ...successResultShape, data: z.array(exportFileSchema) }).loose(),
  })
  .strict();

const dependencyAction = (
  operation: 'evaluate' | 'render' | 'export',
  dependencyHash: string,
  codec: { readonly id: string; readonly version: string },
): ComputeAction => ({
  schemaVersion: 1,
  namespace: '@taucad/middleware/geometry-cache',
  producer: { id: '@taucad/middleware/geometry-cache', version: '4', implementationAssets: [] },
  operation,
  inputs: [
    {
      kind: 'content',
      role: 'runtime-dependency-set',
      digest: contentDigest({ value: `sha256:${dependencyHash}`, name: 'middleware dependency hash' }),
    },
  ],
  arguments: {},
  environment: {},
  codec: { id: codec.id, version: codec.version },
});

const buildCodec: CacheCodec<EvaluateResult> = {
  id: '@taucad/middleware/geometry-build',
  version: '4',
  mediaType: 'application/vnd.taucad.geometry-build+msgpack',
  encode: async ({ value, signal }): Promise<EncodedContent> => {
    if (!value.success) {
      throw new Error('Failed geometry results are not reusable.');
    }
    const result = value;
    const nativeBuildInput = result[nativeBuildInputSymbol];
    if (!nativeBuildInput) {
      throw new Error('A reusable native build requires its exact replay input.');
    }
    // A fresh build defers serialization until cache publication requires its snapshot.
    const serializedHandle = result.serializedHandle ?? result.serializeHandleSnapshot?.();
    if (serializedHandle === undefined) {
      throw new Error('A reusable build requires a serialized handle.');
    }
    const {
      [nativeBuildInputSymbol]: _nativeBuildInput,
      serializeHandleSnapshot: _serializeHandleSnapshot,
      ...publicResult
    } = result;
    // GlTF optional fields use absence. MessagePack's default turns undefined into
    // null, which changes restored material semantics and breaks later exports.
    const encoded = await encodeBinarySlots({ value: serializedHandle, signal });
    return {
      bytes: msgpackEncode(
        {
          schemaVersion: 2,
          binaryPaths: encoded.paths,
          result: { ...publicResult, serializedHandle: encoded.value },
          nativeBuildInput,
        },
        { ignoreUndefined: true },
      ),
      content: encoded.content,
    };
  },
  decode: async ({ bytes, signal, readContent }) => {
    const entry = buildEntrySchema.parse(msgpackDecode(bytes));
    const serializedHandle = await decodeBinarySlots({
      value: entry.result.serializedHandle,
      paths: entry.binaryPaths,
      signal,
      readContent,
    });
    // oxlint-disable-next-line typescript/consistent-type-assertions -- Zod validates every persisted field before restoring the symbol carrier.
    return { ...entry.result, serializedHandle, [nativeBuildInputSymbol]: entry.nativeBuildInput } as BuildCacheResult;
  },
};

const meshCodec: CacheCodec<RenderResult> = {
  id: '@taucad/middleware/geometry-mesh',
  version: '3',
  mediaType: 'application/vnd.taucad.geometry-mesh+msgpack',
  encode: async ({ value, signal }): Promise<EncodedContent> => {
    if (!value.success) {
      throw new Error('Failed render results are not reusable.');
    }
    const encoded = await encodeBinarySlots({ value: value.data.content, signal });
    return {
      bytes: msgpackEncode(
        {
          schemaVersion: 2,
          binaryPaths: encoded.paths,
          result: { ...value, data: { ...value.data, content: encoded.value } },
        },
        { ignoreUndefined: true },
      ),
      content: encoded.content,
    };
  },
  decode: async ({ bytes, signal, readContent }) => {
    const entry = meshEntrySchema.parse(msgpackDecode(bytes));
    const content = await decodeBinarySlots({
      value: entry.result.data.content,
      paths: entry.binaryPaths,
      signal,
      readContent,
    });
    const result: KernelSuccessResult<Artifact> = {
      ...entry.result,
      data: artifactSchema.parse({ ...entry.result.data, content }),
    };
    return result;
  },
};

const exportCodec: CacheCodec<KernelExportResult> = {
  id: '@taucad/middleware/geometry-export',
  version: '2',
  mediaType: 'application/vnd.taucad.geometry-export+msgpack',
  encode: ({ value }) => {
    if (!value.success || value.data.length === 0) {
      throw new Error('Failed or empty export results are not reusable.');
    }
    return msgpackEncode({ schemaVersion: 1, result: value });
  },
  decode: ({ bytes }) => {
    const { result } = exportEntrySchema.parse(msgpackDecode(bytes));
    if (result.data.length === 0) {
      throw new Error('A cached export requires at least one file.');
    }
    return { ...result, data: nonemptyExportFiles(result.data) };
  },
};

/** Whole-build, display-mesh, and export reuse backed by the runtime compute CAS. @public */
export const geometryCache = defineMiddleware({
  id: 'geometryCache',
  name: 'GeometryCache',
  version: '4.0.0',

  async wrapEvaluate(input, handler, { compute, dependencyHash, logger, tracer }) {
    if (compute.status !== 'on') {
      return handler(input);
    }
    const result = await traceCacheOperation(tracer, 'cache.geometry.build.evaluate', async () =>
      compute.evaluate({
        action: dependencyAction('evaluate', dependencyHash, buildCodec),
        codec: buildCodec,
        policy: 'best-effort',
        compute: async () => handler(input),
      }),
    );
    logger.debug(`Geometry build cache ${result.source} for ${dependencyHash}`);
    return result.value;
  },

  async wrapRender(input, handler, { compute, dependencyHash, logger, tracer }) {
    if (compute.status !== 'on') {
      return handler(input);
    }
    const result = await traceCacheOperation(tracer, 'cache.geometry.mesh.evaluate', async () =>
      compute.evaluate({
        action: dependencyAction('render', dependencyHash, meshCodec),
        codec: meshCodec,
        policy: 'best-effort',
        compute: async () => handler(input),
      }),
    );
    logger.debug(`Geometry mesh cache ${result.source} for ${dependencyHash}`);
    return result.value;
  },

  async wrapExport(input, handler, { compute, dependencyHash, logger, tracer }) {
    if (compute.status !== 'on') {
      return handler(input);
    }
    const result = await traceCacheOperation(tracer, 'cache.geometry.export.evaluate', async () =>
      compute.evaluate({
        action: dependencyAction('export', dependencyHash, exportCodec),
        codec: exportCodec,
        policy: 'best-effort',
        compute: async () => handler(input),
      }),
    );
    logger.debug(`Geometry export cache ${result.source} for ${dependencyHash}`);
    return result.value;
  },
});
