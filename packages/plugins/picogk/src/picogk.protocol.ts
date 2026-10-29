import { z } from 'zod';
import type { GlbMaterial, GlbResources } from '@taucad/geometry-core';

export const picogkProtocolVersion = 8;
export const picogkBrowserProtocolVersion = 9;

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

export const picogkBrowserReadySchema = picogkReadySchema.extend({
  protocolVersion: z.literal(picogkBrowserProtocolVersion),
});

export const picogkBrowserResponseSchema = picogkResponseSchema.extend({
  protocolVersion: z.literal(picogkBrowserProtocolVersion),
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
  /** Actual browser WebAssembly heap, including both managed and engine allocations. */
  wasmHeapBytes: z.number().int().nonnegative().optional(),
  // Browser workers have no process resident-memory measurement.
  processWorkingSetBytes: z.number().int().nonnegative().nullable(),
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

/**
 * Adaptive display meshing for one build: OpenVDB adaptivity in (0, 1) and its relax pass. The host sends it
 * only above 0, and a worker that applied it echoes it in the build result.
 */
export const picogkMeshingSchema = z.object({ adaptivity: z.number().gt(0).lt(1), relax: z.boolean() }).strict();

/** Adaptive meshing requested of, and echoed by, the worker. */
export type PicogkMeshing = z.output<typeof picogkMeshingSchema>;

/** Original geometry files captured by a browser build, separate from display artifacts. */
export const picogkAuthoredOutputSchema = z
  .object({
    artifactPath: z.string().regex(/^\/artifacts\/authored\/[a-f\d]{32}\/files\//u),
    name: z
      .string()
      .min(1)
      .refine(
        (name) =>
          !name.includes('\\') &&
          !name.includes('\0') &&
          name.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
      ),
    byteLength: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().regex(/^[a-f\d]{64}$/u),
    mimeType: z.enum(['model/stl', 'application/vnd.openvdb']),
  })
  .strict()
  .refine(
    (file) =>
      file.artifactPath.slice('/artifacts/authored/'.length + 32 + '/files/'.length) === file.name &&
      file.name.toLowerCase().endsWith(file.mimeType === 'model/stl' ? '.stl' : '.vdb'),
  );

export const picogkBuildSchema = z
  .object({
    authoredOutputs: z.array(picogkAuthoredOutputSchema).optional(),
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
    /** Voxel edge length in millimetres the model's `Library.Go` ran with; absent without a voxel library. */
    voxelSize: z.number().positive().optional(),
    /** The adaptive meshing the worker applied to captured Voxels; absent for the uniform mesh. */
    meshing: picogkMeshingSchema.optional(),
  })
  .strict()
  .superRefine((scene, context) => {
    const outputs = scene.authoredOutputs ?? [];
    if (
      new Set(outputs.map((file) => file.name.toLowerCase())).size !== outputs.length ||
      new Set(outputs.map((file) => file.artifactPath)).size !== outputs.length
    ) {
      context.addIssue({ code: 'custom', message: 'Duplicate authored output identity.' });
    }
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
