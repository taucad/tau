import { z } from 'zod';

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
});

export const build123dArtifactSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
});

export const build123dEmptySchema = z.object({});
export const build123dShutdownSchema = z.object({ shutdown: z.literal(true) });

/** Structured issue emitted by the private Python worker. */
export type Build123dIssue = z.infer<typeof build123dIssueSchema>;
