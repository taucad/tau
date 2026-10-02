import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import { contentDigest } from '@taucad/cache-core';
import type { CacheCodec, ComputeAction } from '@taucad/cache-core';
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
    schemaVersion: z.literal(1),
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
    schemaVersion: z.literal(1),
    result: z.object({ ...successResultShape, data: artifactSchema }).loose(),
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
  producer: { id: '@taucad/middleware/geometry-cache', version: '3', implementationAssets: [] },
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
  version: '3',
  mediaType: 'application/vnd.taucad.geometry-build+msgpack',
  encode: ({ value }) => {
    if (!value.success) {
      throw new Error('Failed geometry results are not reusable.');
    }
    const result = value;
    const nativeBuildInput = result[nativeBuildInputSymbol];
    if (!nativeBuildInput) {
      throw new Error('A reusable native build requires its exact replay input.');
    }
    /* D12: a fresh build carries the means to make its snapshot, not the snapshot — nothing on the
     * display path reads one. A cache entry has to hold the value, so this is where it is made. */
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
    return msgpackEncode(
      {
        schemaVersion: 1,
        result: { ...publicResult, serializedHandle },
        nativeBuildInput,
      },
      { ignoreUndefined: true },
    );
  },
  decode: ({ bytes }) => {
    const entry = buildEntrySchema.parse(msgpackDecode(bytes));
    // oxlint-disable-next-line typescript/consistent-type-assertions -- Zod validates every persisted field before restoring the symbol carrier.
    return { ...entry.result, [nativeBuildInputSymbol]: entry.nativeBuildInput } as BuildCacheResult;
  },
};

const meshCodec: CacheCodec<RenderResult> = {
  id: '@taucad/middleware/geometry-mesh',
  version: '2',
  mediaType: 'application/vnd.taucad.geometry-mesh+msgpack',
  encode: ({ value }) => {
    if (!value.success) {
      throw new Error('Failed render results are not reusable.');
    }
    return msgpackEncode({ schemaVersion: 1, result: value });
  },
  decode: ({ bytes }) => meshEntrySchema.parse(msgpackDecode(bytes)).result as KernelSuccessResult<Artifact>,
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
  version: '3.0.0',

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
