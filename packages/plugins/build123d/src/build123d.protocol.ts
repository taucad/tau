import { z } from 'zod';

const digestSchema = z.string().regex(/^sha256:[\da-f]{64}$/u);

const computeActionInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('content'), role: z.string().min(1), digest: digestSchema }),
  z.object({ kind: z.literal('action'), role: z.string().min(1), digest: digestSchema }),
  z.object({ kind: z.literal('scene'), role: z.string().min(1), digest: digestSchema }),
]);

/** Strict semantic compute action emitted by the version-pinned Python worker. */
export const build123dComputeActionSchema = z.object({
  schemaVersion: z.literal(1),
  namespace: z.string().min(1),
  producer: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    implementationAssets: z.array(digestSchema),
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

export const build123dAnalysisSchema = z.object({
  defaultParameters: z.record(z.string(), z.unknown()),
  jsonSchema: z.record(z.string(), z.unknown()),
  resolved: z.array(z.string()),
  unresolved: z.array(z.string()),
});

export const build123dBuildSchema = z.object({
  handleId: z.string().min(1),
  observedDependencies: z.array(z.string()),
  computeArtifact: z.object({ artifactPath: z.string().min(1), byteLength: z.number().int().nonnegative() }).optional(),
});

export const build123dArtifactSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
});

export const build123dEmptySchema = z.object({});
export const build123dShutdownSchema = z.object({ shutdown: z.literal(true) });

/** One deterministic BRep publication produced by the Python semantic adapter. */
export const build123dComputePublicationsSchema = z.object({
  publications: z.array(
    z.object({
      action: build123dComputeActionSchema,
      bytes: z.string().regex(/^(?:[A-Za-z\d+/]{4})*(?:[A-Za-z\d+/]{2}==|[A-Za-z\d+/]{3}=)?$/u),
      mediaType: z.literal('application/vnd.opencascade.brep'),
    }),
  ),
});

/** Structured issue emitted by the private Python worker. */
export type Build123dIssue = z.infer<typeof build123dIssueSchema>;
