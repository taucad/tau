import { z } from 'zod';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';

export const picogkProtocolVersion = 8;

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

/** The C# files one entry compiles with: its own program and every helper, as project paths. */
export const picogkResolveSchema = z.object({
  sources: z.array(z.string().min(1)).min(1),
});

export const picogkAnalysisSchema = z.object({
  defaultParameters: z.record(z.string(), z.unknown()),
  jsonSchema: z.record(z.string(), z.unknown()),
  timings: picogkCompilationTimingsSchema,
});

const region = z.number().int().nonnegative();
const finite = z.number();
export const picogkPrototypeSchema = z
  .object({
    id: z.string().regex(/^prototype:[1-9]\d*$/u),
    kind: z.enum(['triangles', 'lines']),
    positionOffset: region,
    positionCount: region.positive(),
    normalOffset: region,
    normalCount: region,
    indexOffset: region,
    indexCount: region.positive(),
    indexComponentType: z.union([z.literal(5123), z.literal(5125)]),
    texCoordOffset: region.optional(),
    texCoordCount: region.optional(),
    tangentOffset: region.optional(),
    tangentCount: region.optional(),
  })
  .strict();
export const picogkOccurrenceSchema = z
  .object({
    id: z.string().regex(/^component:picogk-[1-9]\d*$/u),
    prototypeId: z.string().regex(/^prototype:[1-9]\d*$/u),
    name: z
      .string()
      .min(1)
      .refine((value) => value.trim() === value)
      .optional(),
    matrix: z
      .tuple([
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
        finite,
      ])
      .refine((value) => value[3] === 0 && value[7] === 0 && value[11] === 0 && value[15] === 1),
    color: z.tuple([finite.min(0).max(1), finite.min(0).max(1), finite.min(0).max(1), finite.min(0).max(1)]),
    metallic: finite.min(0).max(1),
    roughness: finite.min(0).max(1),
    material: z
      .custom<GlbMaterial>((value) => value !== null && typeof value === 'object' && !Array.isArray(value))
      .optional(),
  })
  .strict();

export const picogkBuildSchema = z
  .object({
    artifactPath: z.string().min(1),
    byteLength: region,
    sha256: z.string().regex(/^[\da-f]{64}$/iu),
    prototypes: z.array(picogkPrototypeSchema),
    occurrences: z.array(picogkOccurrenceSchema),
    workCounters: z
      .object({
        capturedSnapshots: region,
        geometryReadbacks: region,
        inputVertices: region,
        inputIndices: region,
        normalLayouts: region,
        uvLayouts: region,
        materialProjections: region,
      })
      .strict()
      .optional(),
    images: z
      .array(
        z.object({
          offset: z.number().int().nonnegative(),
          byteLength: z.number().int().positive(),
          mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
          name: z.string().nullable().optional(),
        }),
      )
      .nullish(),
    textures: z.custom<NonNullable<GlbResources['textures']>>((value) => Array.isArray(value)).nullish(),
    samplers: z.custom<NonNullable<GlbResources['samplers']>>((value) => Array.isArray(value)).nullish(),
    mechanism: z.unknown().optional(),
    warnings: z.array(picogkIssueSchema).optional(),
    computeReuseManifest: z.string().min(1).optional(),
    recycleAfterResponse: z.boolean(),
    timings: picogkWorkerTimingsSchema,
    metrics: picogkWorkerMetricsSchema,
  })
  .strict()
  .superRefine((scene, context) => {
    const prototypes = new Set(scene.prototypes.map((prototype) => prototype.id));
    const referenced = new Set(scene.occurrences.map((occurrence) => occurrence.prototypeId));
    if (scene.prototypes.some((prototype) => !referenced.has(prototype.id))) {
      context.addIssue({
        code: 'custom',
        message: 'Unreferenced prototype identity.',
      });
    }
    const ids = new Set<string>();
    const names = new Set<string>();
    if (prototypes.size !== scene.prototypes.length) {
      context.addIssue({
        code: 'custom',
        message: 'Duplicate prototype identity.',
      });
    }
    for (const occurrence of scene.occurrences) {
      if (
        !prototypes.has(occurrence.prototypeId) ||
        ids.has(occurrence.id) ||
        (occurrence.name !== undefined && names.has(occurrence.name))
      ) {
        context.addIssue({
          code: 'custom',
          message: 'Invalid occurrence identity or prototype reference.',
        });
      }
      ids.add(occurrence.id);
      if (occurrence.name !== undefined) {
        names.add(occurrence.name);
      }
    }
  });

export const picogkShutdownSchema = z.object({ shutdown: z.literal(true) });

/** Structured issue emitted by the native PicoGK worker. @public */
export type PicogkIssue = z.infer<typeof picogkIssueSchema>;

/** Validated private mesh-artifact descriptor emitted by a PicoGK build. @public */
export type PicogkBuild = z.infer<typeof picogkBuildSchema>;
