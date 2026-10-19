import { actionDigest, contentDigest, sceneDigest } from '@taucad/cache-core';
import { pythonArtifactSchema } from '@taucad/python-kernel-core';
import { z } from 'zod';

const digestSchema = z.string().regex(/^sha256:[\da-f]{64}$/u);
const actionDigestSchema = digestSchema.transform((value) => actionDigest({ value }));
const contentDigestSchema = digestSchema.transform((value) => contentDigest({ value }));
const sceneDigestSchema = digestSchema.transform((value) => sceneDigest({ value }));

const computeActionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('content'), role: z.string().min(1), digest: contentDigestSchema }),
  z.object({ kind: z.literal('action'), role: z.string().min(1), digest: actionDigestSchema }),
  z.object({ kind: z.literal('scene'), role: z.string().min(1), digest: sceneDigestSchema }),
]);

/** Strict semantic compute action emitted by the version-pinned Python worker. */
export const smlibpyComputeActionSchema = z.object({
  schemaVersion: z.literal(1),
  namespace: z.string().min(1),
  producer: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    implementationAssets: z.array(contentDigestSchema),
  }),
  operation: z.string().min(1),
  inputs: z.array(computeActionInputSchema),
  arguments: z.json(),
  environment: z.json(),
  codec: z.object({ id: z.string().min(1), version: z.string().min(1) }),
});

const parameterDeclarationSchema = z
  .object({
    schema: z.record(z.string(), z.unknown()),
    defaults: z.record(z.string(), z.unknown()),
    bindings: z
      .record(
        z.string(),
        z
          .object({
            unit: z.string().min(1).optional(),
            quantityKind: z.string().optional(),
            space: z.enum(['linear', 'difference', 'point']).optional(),
            reference: z.string().optional(),
            sourceUnitCapability: z.string().min(1).optional(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export const smlibpyAnalysisSchema = z.object({
  defaultParameters: z.record(z.string(), z.unknown()),
  jsonSchema: z.record(z.string(), z.unknown()),
  declaration: parameterDeclarationSchema,
  resolved: z.array(z.string()),
  unresolved: z.array(z.string()),
});
/** What the Python worker answers `analyze` with. @public */
export type SmlibpyAnalysis = z.infer<typeof smlibpyAnalysisSchema>;

/** One entry of a bounded compute bundle: its identities and its slice of the binary payload. */
export const smlibpyComputeDescriptorSchema = z.object({
  action: smlibpyComputeActionSchema,
  actionDigest: actionDigestSchema,
  contentDigest: contentDigestSchema,
  byteLength: z.number().int().nonnegative(),
});

/** EQ16: one control frame carries at most this many descriptors. */
export const smlibpyComputeDescriptorLimit = 512;

export const smlibpyComputeExportSchema = z.object({
  descriptors: z.array(smlibpyComputeDescriptorSchema).max(smlibpyComputeDescriptorLimit),
  omitted: z.array(z.string()),
  bundle: pythonArtifactSchema.optional(),
});

export const smlibpyComputeImportSchema = z.object({
  imported: z.array(actionDigestSchema),
  omitted: z.array(z.string()),
});

export const smlibpyComputeStatsSchema = z.object({
  entries: z.number().int().nonnegative(),
  logicalBytes: z.number().int().nonnegative(),
  evictions: z.number().int().nonnegative(),
  omissions: z.number().int().nonnegative(),
});

export const smlibpyComputeClearSchema = z.object({ generation: z.number().int() });

export const smlibpyBuildSchema = z.object({
  handleId: z.string().min(1),
  observedDependencies: z.array(z.string()),
  compute: z
    .object({
      announcements: z
        .array(
          z.object({
            action: smlibpyComputeActionSchema,
            actionDigest: actionDigestSchema,
            computeDuration: z.number().nonnegative(),
            estimatedBytes: z.number().int().nonnegative(),
          }),
        )
        .max(smlibpyComputeDescriptorLimit),
      hits: z.number().int().nonnegative(),
      stats: smlibpyComputeStatsSchema,
    })
    .optional(),
});

/** A file the worker wrote: STEP, STL or a mesh bundle. */
export const smlibpyArtifactSchema = pythonArtifactSchema;
/** One worker artifact. */
export type SmlibpyArtifact = z.infer<typeof smlibpyArtifactSchema>;

/**
 * What the worker answers `mesh` with: the triangle and vertex counts, and the mesh bundle when it was within the
 * request's `maxTriangles`.
 */
export const smlibpyMeshSchema = z.object({
  artifactPath: z.string().min(1).optional(),
  byteLength: z.number().int().nonnegative().optional(),
  triangles: z.number().int().nonnegative(),
  vertices: z.number().int().nonnegative(),
});
/** One `mesh` answer. */
export type SmlibpyMesh = z.infer<typeof smlibpyMeshSchema>;

/** What the worker answers `measure` with: the shapes' bounding-box diagonal in millimetres. */
export const smlibpyMeasureSchema = z.object({ diagonal: z.number().nonnegative() });
