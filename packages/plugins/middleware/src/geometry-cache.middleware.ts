import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import { contentDigest } from '@taucad/cache-core';
import type { CacheCodec, ComputeAction } from '@taucad/cache-core';
import { z } from 'zod';
import { defineMiddleware, nativeBuildInputSymbol } from '@taucad/runtime/middleware';
import type { NativeBuildInput, NativeBuildInputCarrier } from '@taucad/runtime/middleware';
import type {
  CreateGeometryResult,
  ExportGeometryResult,
  GeometryResponse,
  KernelSuccessResult,
  MeshGeometryResult,
} from '@taucad/runtime/types';
import { traceCacheOperation } from '#_internal/cache-span.js';

type BuildCacheResult = KernelSuccessResult<GeometryResponse | undefined> & NativeBuildInputCarrier;

const kernelIssueSchema = z
  .object({
    message: z.string(),
    code: z.string().min(1),
    severity: z.enum(['error', 'warning', 'info']),
  })
  .loose();

const geometryResponseSchema = z.discriminatedUnion('format', [
  z.object({ format: z.literal('gltf'), content: z.instanceof(Uint8Array) }).loose(),
  z.object({ format: z.literal('svg'), content: z.string(), name: z.string().optional() }).loose(),
]);
const successResultShape = {
  success: z.literal(true),
  issues: z.array(kernelIssueSchema),
  serializedNativeHandle: z.unknown().optional(),
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
        data: geometryResponseSchema.nullish().transform((value) => value ?? undefined),
      })
      .loose(),
    nativeBuildInput: nativeBuildInputSchema,
  })
  .strict();
const meshEntrySchema = z
  .object({
    schemaVersion: z.literal(1),
    result: z.object({ ...successResultShape, data: geometryResponseSchema }).loose(),
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
  operation: 'build' | 'mesh' | 'export',
  dependencyHash: string,
  codec: { readonly id: string; readonly version: string },
): ComputeAction => ({
  schemaVersion: 1,
  namespace: '@taucad/middleware/geometry-cache',
  producer: { id: '@taucad/middleware/geometry-cache', version: '2', implementationAssets: [] },
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

const buildCodec: CacheCodec<CreateGeometryResult> = {
  id: '@taucad/middleware/geometry-build',
  version: '1',
  mediaType: 'application/vnd.taucad.geometry-build+msgpack',
  encode: ({ value }) => {
    if (!value.success) {
      throw new Error('Failed geometry results are not reusable.');
    }
    const result = value as BuildCacheResult;
    const nativeBuildInput = result[nativeBuildInputSymbol];
    if (!nativeBuildInput) {
      throw new Error('A reusable native build requires its exact replay input.');
    }
    if (result.data?.format === 'webrtc') {
      throw new Error('Live WebRTC geometry is not reusable.');
    }
    if (result.data === undefined && result.serializedNativeHandle === undefined) {
      throw new Error('A reusable build requires geometry or a serialized native handle.');
    }
    const { [nativeBuildInputSymbol]: _nativeBuildInput, ...publicResult } = result;
    return msgpackEncode({ schemaVersion: 1, result: publicResult, nativeBuildInput });
  },
  decode: ({ bytes }) => {
    const entry = buildEntrySchema.parse(msgpackDecode(bytes));
    // oxlint-disable-next-line typescript/consistent-type-assertions -- Zod validates every persisted field before restoring the symbol carrier.
    return { ...entry.result, [nativeBuildInputSymbol]: entry.nativeBuildInput } as BuildCacheResult;
  },
};

const meshCodec: CacheCodec<MeshGeometryResult> = {
  id: '@taucad/middleware/geometry-mesh',
  version: '1',
  mediaType: 'application/vnd.taucad.geometry-mesh+msgpack',
  encode: ({ value }) => {
    if (!value.success || value.data.format === 'webrtc') {
      throw new Error('Failed or live mesh results are not reusable.');
    }
    return msgpackEncode({ schemaVersion: 1, result: value });
  },
  decode: ({ bytes }) => meshEntrySchema.parse(msgpackDecode(bytes)).result as KernelSuccessResult<GeometryResponse>,
};

const exportCodec: CacheCodec<ExportGeometryResult> = {
  id: '@taucad/middleware/geometry-export',
  version: '1',
  mediaType: 'application/vnd.taucad.geometry-export+msgpack',
  encode: ({ value }) => {
    if (!value.success || value.data.length === 0) {
      throw new Error('Failed or empty export results are not reusable.');
    }
    return msgpackEncode({ schemaVersion: 1, result: value });
  },
  decode: ({ bytes }) => exportEntrySchema.parse(msgpackDecode(bytes)).result as ExportGeometryResult,
};

/** Whole-build, display-mesh, and export reuse backed by the runtime compute CAS. @public */
export const geometryCache = defineMiddleware({
  id: 'geometryCache',
  name: 'GeometryCache',
  version: '2.0.0',

  async wrapCreateGeometry(input, handler, { compute, dependencyHash, logger, tracer, progressiveSceneRequested }) {
    // A terminal-only cache entry cannot replay scene operations or bookmarks.
    // Inner deterministic work can still reuse compute; publish this terminal result for atomic consumers.
    const liveResult = progressiveSceneRequested ? await handler(input) : undefined;
    const result = await traceCacheOperation(tracer, 'cache.geometry.build.evaluate', async () =>
      compute.evaluate({
        action: dependencyAction('build', dependencyHash, buildCodec),
        codec: buildCodec,
        policy: 'best-effort',
        compute: async () => liveResult ?? handler(input),
      }),
    );
    logger.debug(
      `Geometry build cache ${result.source} for ${dependencyHash}${progressiveSceneRequested ? ' (live scene executed)' : ''}`,
    );
    return liveResult ?? result.value;
  },

  async wrapMeshGeometry(input, handler, { compute, dependencyHash, logger, tracer }) {
    const result = await traceCacheOperation(tracer, 'cache.geometry.mesh.evaluate', async () =>
      compute.evaluate({
        action: dependencyAction('mesh', dependencyHash, meshCodec),
        codec: meshCodec,
        policy: 'best-effort',
        compute: async () => handler(input),
      }),
    );
    logger.debug(`Geometry mesh cache ${result.source} for ${dependencyHash}`);
    return result.value;
  },

  async wrapExportGeometry(input, handler, { compute, dependencyHash, logger, tracer }) {
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
