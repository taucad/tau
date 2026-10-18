import { z } from 'zod';

/**
 * The version of the JSON-lines protocol `tau_kernel.protocol` speaks; every frame carries it.
 * @public
 */
export const pythonProtocolVersion = 1;

/**
 * A structured issue a Python worker reports: a syntax, runtime, kernel or validation failure, located in the project
 * when the worker could place it.
 * @public
 */
export const pythonIssueSchema = z.object({
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

/**
 * One issue a Python worker reported.
 * @public
 */
export type PythonIssue = z.infer<typeof pythonIssueSchema>;

/**
 * The handshake a Python worker writes once its library imported.
 * @public
 */
export const pythonReadySchema = z.object({
  protocolVersion: z.literal(pythonProtocolVersion),
  type: z.literal('ready'),
  pythonVersion: z.string(),
});

/**
 * One response frame: exactly one of `result` and `error` is present, which the session checks.
 * @public
 */
export const pythonResponseSchema = z.object({
  protocolVersion: z.literal(pythonProtocolVersion),
  requestId: z.string(),
  result: z.unknown().optional(),
  error: z.object({ issues: z.array(pythonIssueSchema).min(1) }).optional(),
});

/**
 * A file the worker wrote into the session's private artifact directory; a kernel's result schemas extend it.
 * @public
 */
export const pythonArtifactSchema = z.object({
  artifactPath: z.string().min(1),
  byteLength: z.number().int().nonnegative(),
});

/**
 * One artifact descriptor.
 * @public
 */
export type PythonArtifact = z.infer<typeof pythonArtifactSchema>;
