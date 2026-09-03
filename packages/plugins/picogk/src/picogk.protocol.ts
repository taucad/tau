import { z } from 'zod';

export const picogkProtocolVersion = 1;

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
  modelInvoke: z.number().nonnegative(),
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

export const picogkComponentSchema = z.object({
  name: z.string().min(1),
  color: z.string().regex(/^#[\da-f]{8}$/iu),
  positionOffset: z.number().int().nonnegative(),
  positionCount: z.number().int().nonnegative(),
  normalOffset: z.number().int().nonnegative(),
  normalCount: z.number().int().nonnegative(),
  indexOffset: z.number().int().nonnegative(),
  indexCount: z.number().int().nonnegative(),
});

export const picogkBuildSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[\da-f]{64}$/iu),
  components: z.array(picogkComponentSchema).min(1),
  recycleAfterResponse: z.boolean(),
  timings: picogkWorkerTimingsSchema,
  metrics: picogkWorkerMetricsSchema,
});

export const picogkShutdownSchema = z.object({ shutdown: z.literal(true) });

/** Structured issue emitted by the native PicoGK worker. @public */
export type PicogkIssue = z.infer<typeof picogkIssueSchema>;

/** Validated private mesh-artifact descriptor emitted by a PicoGK build. @public */
export type PicogkBuild = z.infer<typeof picogkBuildSchema>;
