import { z } from 'zod';
import { actionDigest, contentDigest, sceneDigest } from '@taucad/cache-core';

const digestSchema = z.string().regex(/^sha256:[\da-f]{64}$/u);
const actionDigestSchema = digestSchema.transform((value) => actionDigest({ value }));
const contentDigestSchema = digestSchema.transform((value) => contentDigest({ value }));
const sceneDigestSchema = digestSchema.transform((value) => sceneDigest({ value }));

const computeActionInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('content'),
    role: z.string().min(1),
    digest: contentDigestSchema,
  }),
  z.object({
    kind: z.literal('action'),
    role: z.string().min(1),
    digest: actionDigestSchema,
  }),
  z.object({
    kind: z.literal('scene'),
    role: z.string().min(1),
    digest: sceneDigestSchema,
  }),
]);

/** Strict semantic compute action emitted by the version-pinned Python worker. */
export const build123dComputeActionSchema = z.object({
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

/** Private protocol version shared with the checked-in Python worker. */
export const build123dProtocolVersion = 1;

export const build123dIssueSchema = z.object({
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

export const build123dReadySchema = z.object({
  protocolVersion: z.literal(build123dProtocolVersion),
  type: z.literal('ready'),
  pythonVersion: z.string(),
});

export const build123dResponseSchema = z.object({
  protocolVersion: z.literal(build123dProtocolVersion),
  requestId: z.string(),
  result: z.unknown().optional(),
  error: z.object({ issues: z.array(build123dIssueSchema).min(1) }).optional(),
});

const build123dParameterDeclarationSchema = z
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

export const build123dAnalysisSchema = z.object({
  defaultParameters: z.record(z.string(), z.unknown()),
  jsonSchema: z.record(z.string(), z.unknown()),
  // Optional only for compatibility with older private-session fixtures; the kernel requires it.
  declaration: build123dParameterDeclarationSchema.optional(),
  resolved: z.array(z.string()),
  unresolved: z.array(z.string()),
});

/** One entry of a bounded compute bundle: its identities and its slice of the binary payload. */
export const build123dComputeDescriptorSchema = z.object({
  action: build123dComputeActionSchema,
  actionDigest: actionDigestSchema,
  contentDigest: contentDigestSchema,
  byteLength: z.number().int().nonnegative(),
});

/** EQ16: one control frame carries at most this many descriptors. */
export const build123dComputeDescriptorLimit = 512;

const bundleSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
});

export const build123dComputeExportSchema = z.object({
  descriptors: z.array(build123dComputeDescriptorSchema).max(build123dComputeDescriptorLimit),
  omitted: z.array(z.string()),
  bundle: bundleSchema.optional(),
});

export const build123dComputeImportSchema = z.object({
  imported: z.array(actionDigestSchema),
  omitted: z.array(z.string()),
});

export const build123dComputeStatsSchema = z.object({
  entries: z.number().int().nonnegative(),
  logicalBytes: z.number().int().nonnegative(),
  evictions: z.number().int().nonnegative(),
  omissions: z.number().int().nonnegative(),
});

export const build123dComputeClearSchema = z.object({
  generation: z.number().int(),
});

export const build123dBuildSchema = z.object({
  handleId: z.string().min(1),
  observedDependencies: z.array(z.string()),
  compute: z
    .object({
      announcements: z
        .array(
          z.object({
            action: build123dComputeActionSchema,
            actionDigest: actionDigestSchema,
            computeDuration: z.number().nonnegative(),
            estimatedBytes: z.number().int().nonnegative(),
          }),
        )
        .max(build123dComputeDescriptorLimit),
      hits: z.number().int().nonnegative(),
      stats: build123dComputeStatsSchema,
    })
    .optional(),
});

export const build123dArtifactSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
});

export const build123dEmptySchema = z.object({});
export const build123dShutdownSchema = z.object({ shutdown: z.literal(true) });

/** Structured issue emitted by the private Python worker. */
export type Build123dIssue = z.infer<typeof build123dIssueSchema>;
