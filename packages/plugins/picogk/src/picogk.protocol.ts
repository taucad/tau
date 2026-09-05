import { z } from 'zod';

export const picogkProtocolVersion = 3;

export const picogkIssueSchema = z.object({
  message: z.string(),
  code: z.string(),
  type: z.enum(['syntax', 'runtime', 'kernel', 'validation']),
  severity: z.enum(['error', 'warning', 'info']),
  location: z
    .object({
      fileName: z.string(),
      startLineNumber: z.number().int().positive(),
      startColumn: z.number().int().positive(),
    })
    .optional(),
});

export const picogkReadySchema = z.object({
  protocolVersion: z.literal(picogkProtocolVersion),
  type: z.literal('ready'),
  dotnetVersion: z.string(),
  picogkVersion: z.string(),
});

export const picogkResponseSchema = z.object({
  protocolVersion: z.literal(picogkProtocolVersion),
  requestId: z.string(),
  result: z.unknown().optional(),
  error: z.object({ issues: z.array(picogkIssueSchema).min(1) }).optional(),
});

export const picogkCompilationTimingsSchema = z.object({
  cacheHit: z.boolean(),
  sourceRead: z.number().nonnegative(),
  parse: z.number().nonnegative(),
  analyze: z.number().nonnegative(),
  emit: z.number().nonnegative(),
});

export const picogkWorkerTimingsSchema = z.object({
  compileCacheHit: z.boolean(),
  sourceRead: z.number().nonnegative(),
  parse: z.number().nonnegative(),
  analyze: z.number().nonnegative(),
  emit: z.number().nonnegative(),
  libraryInitialize: z.number().nonnegative(),
  entryPointInvoke: z.number().nonnegative(),
  meshConstruction: z.number().nonnegative(),
  meshExtraction: z.number().nonnegative(),
  normalGeneration: z.number().nonnegative(),
  artifactWrite: z.number().nonnegative(),
  unload: z.number().nonnegative(),
});

export const picogkWorkerMetricsSchema = z.object({
  managedHeapBytes: z.number().int().nonnegative(),
  picoGkNativeBytes: z.number().int().nonnegative(),
  processWorkingSetBytes: z.number().int().nonnegative(),
});

export const picogkAnalysisSchema = z.object({
  defaultParameters: z.record(z.string(), z.unknown()),
  jsonSchema: z.record(z.string(), z.unknown()),
  timings: picogkCompilationTimingsSchema,
});

const picogkComponentBase = {
  id: z.string().regex(/^component:picogk-[1-9]\d*$/u),
  name: z.string().min(1),
  color: z.tuple([
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
    z.number().min(0).max(1),
  ]),
  metallic: z.number().min(0).max(1),
  roughness: z.number().min(0).max(1),
  positionOffset: z.number().int().nonnegative(),
  positionCount: z.number().int().positive(),
  normalOffset: z.number().int().nonnegative(),
  indexOffset: z.number().int().nonnegative(),
  indexCount: z.number().int().positive(),
};

export const picogkComponentSchema = z.discriminatedUnion('kind', [
  z.object({
    ...picogkComponentBase,
    kind: z.literal('triangles'),
    normalCount: z.number().int().positive(),
  }),
  z.object({
    ...picogkComponentBase,
    kind: z.literal('lines'),
    normalCount: z.literal(0),
  }),
]);

const picogkSceneArtifactSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[\da-f]{64}$/iu),
  components: z.array(picogkComponentSchema).min(1),
});

const picogkScenePresentationSchema = z
  .object({
    background: z
      .tuple([z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1), z.number().min(0).max(1)])
      .optional(),
    fieldOfViewDegrees: z.number().positive().max(360).optional(),
  })
  .strict();

const picogkSceneBookmarkSchema = z
  .object({
    path: z.string().min(1),
    sceneGeneration: z.number().int().nonnegative(),
  })
  .nullable();

const picogkSceneEventBase = {
  kind: z.literal('scene'),
  mode: z.enum(['explicit', 'update', 'operation']),
  sceneGeneration: z.number().int().nonnegative(),
  artifact: picogkSceneArtifactSchema.nullable(),
  bookmark: picogkSceneBookmarkSchema,
};

export const picogkSceneEventSchema = z.discriminatedUnion('operation', [
  z.object({
    ...picogkSceneEventBase,
    operation: z.literal('reset'),
    baseSceneGeneration: z.null(),
    removedComponentIds: z.array(z.never()).max(0),
    presentation: picogkScenePresentationSchema,
  }),
  z.object({
    ...picogkSceneEventBase,
    operation: z.literal('delta'),
    baseSceneGeneration: z.number().int().nonnegative(),
    removedComponentIds: z.array(picogkComponentBase.id),
    presentation: picogkScenePresentationSchema.nullable(),
  }),
]);

const picogkComputeArtifactSchema = z.object({
  cacheKey: z.string().min(1),
  kind: z.literal('triangles'),
  artifactPath: z.string().min(1),
  byteLength: z.number().int().positive(),
  sha256: z.string().regex(/^[\da-f]{64}$/u),
  positionCount: z.number().int().positive(),
  indexCount: z.number().int().positive(),
});

export const picogkBuildSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[\da-f]{64}$/iu),
  components: z.array(picogkComponentSchema).min(1),
  checkpoints: z.array(
    z.object({
      path: z.string().min(1),
      sceneGeneration: z.number().int().nonnegative(),
    }),
  ),
  recycleAfterResponse: z.boolean(),
  timings: picogkWorkerTimingsSchema,
  metrics: picogkWorkerMetricsSchema,
  computePublications: z.array(picogkComputeArtifactSchema).optional(),
});

export const picogkShutdownSchema = z.object({ shutdown: z.literal(true) });

/** Structured issue emitted by the native PicoGK worker. @public */
export type PicogkIssue = z.infer<typeof picogkIssueSchema>;

/** Validated private mesh-artifact descriptor emitted by a PicoGK build. @public */
export type PicogkBuild = z.infer<typeof picogkBuildSchema>;

/** One host-prehydrated immutable component snapshot visible to the managed worker. @public */
export type PicogkPreparedCompute = z.infer<typeof picogkComputeArtifactSchema>;

/** One newly materialized component snapshot returned for transactional host publication. @public */
export type PicogkComputePublication = z.infer<typeof picogkComputeArtifactSchema>;

/** Internal reconstructible scene reset/delta emitted while one PicoGK build remains active. */
export type PicogkSceneEvent = z.infer<typeof picogkSceneEventSchema>;
