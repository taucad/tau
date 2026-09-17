import { fileParameterEntrySchema } from '@taucad/types';
import { z } from 'zod';
import { rootedFilePathSchema } from '#schemas/rooted-path.schema.js';

const tokenSchema = z
  .string()
  .min(1)
  .refine((value) => value.trim().length > 0);
// oxlint-disable typescript/no-restricted-types -- JSON wire data uses null as a canonical value.
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
// oxlint-enable typescript/no-restricted-types
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.object({}).catchall(jsonValueSchema),
  ]),
);
const jsonObjectSchema = z.object({}).catchall(jsonValueSchema);

/** Checked identity shared by parameter reads and operations. @public */
export const parameterSetIdentitySchema = z
  .object({
    sourceRevision: tokenSchema,
    manifestRevision: tokenSchema,
    valueRevision: tokenSchema,
    dependencyRevision: tokenSchema,
  })
  .strict();

const parameterSourceUnitCapabilitySchema = z
  .object({
    producer: tokenSchema,
    sourceRevision: tokenSchema,
    capability: tokenSchema,
  })
  .strict();

const parameterEditSchema = z
  .object({
    parameterId: tokenSchema,
    resource: tokenSchema,
    pointer: z.string(),
    value: jsonValueSchema,
    inputUnit: tokenSchema.optional(),
  })
  .strict();

/** Existing parameter-set operation union carried without agent-specific variants. @public */
export const parameterSetOperationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.enum(['native-value']),
      group: tokenSchema,
      parameterId: tokenSchema,
      resource: tokenSchema,
      pointer: z.string(),
      value: jsonValueSchema,
    })
    .strict(),
  z
    .object({
      kind: z.enum(['unit-value']),
      group: tokenSchema,
      parameterId: tokenSchema,
      resource: tokenSchema,
      pointer: z.string(),
      inputUnit: tokenSchema,
      value: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(['batch']),
      group: tokenSchema,
      edits: z.array(parameterEditSchema).min(1),
    })
    .strict(),
  z.object({ kind: z.enum(['reset-group']), group: tokenSchema }).strict(),
  z
    .object({
      kind: z.enum(['replace-group-values']),
      group: tokenSchema,
      values: jsonObjectSchema,
    })
    .strict(),
  z
    .object({
      kind: z.enum(['create-group']),
      group: tokenSchema,
      values: jsonObjectSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.enum(['delete-group']), group: tokenSchema }).strict(),
  z.object({ kind: z.enum(['select-group']), group: tokenSchema }).strict(),
  z
    .object({
      kind: z.enum(['rename-group']),
      group: tokenSchema,
      nextGroup: tokenSchema,
    })
    .strict(),
  z
    .object({
      kind: z.enum(['confirm-inference']),
      group: tokenSchema,
      parameterId: tokenSchema,
      resource: tokenSchema,
      pointer: z.string(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(['source-unit']),
      mode: z.enum(['preserve-size', 'reinterpret']),
      group: tokenSchema,
      parameterId: tokenSchema,
      resource: tokenSchema,
      pointer: z.string(),
      unit: tokenSchema,
      producerCapability: parameterSourceUnitCapabilitySchema,
      dependencies: z.object({}).catchall(tokenSchema).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(['display-preference']),
      parameterId: tokenSchema,
      unit: tokenSchema,
    })
    .strict(),
]);

const parameterDiagnosticSchema = z
  .object({
    // Manifest, record, authority and host producers each own codes; the vocabulary stays open like outcome codes.
    code: tokenSchema.describe(
      'Stable diagnostic code, for example INVALID_SCHEMA, INVALID_RECORD, UNSUPPORTED_RECORD, RESOLUTION_FAILED, WATCH_FAILED or RESOLUTION_SUPERSEDED.',
    ),
    message: z.string(),
    severity: z.enum(['error', 'warning']),
    resource: z.string(),
    schemaPointer: z.string(),
    instancePointer: z.string().optional(),
    parameterId: z.string().optional(),
    expected: jsonValueSchema.optional(),
    actual: jsonValueSchema.optional(),
  })
  .strict();

const parameterAuthoritySnapshotSchema = z
  .object({
    entry: fileParameterEntrySchema,
    identity: parameterSetIdentitySchema,
  })
  .strict();

/** A JSON wire envelope; runtime admission remains the semantic authority. @public */
export const parameterManifestWireSchema = jsonObjectSchema;

/** Resolve the admitted parameter manifest and current checked authority state. @public */
export const getParametersInputSchema = z
  .object({
    targetFile: rootedFilePathSchema.describe('Geometry source file relative to the project root.'),
    resolutionMode: z.enum(['default', 'declared-only']).optional(),
  })
  .strict();

/** Complete parameter resolution result, including exact semantic diagnostics. @public */
export const getParametersOutputSchema = z
  .object({
    status: z.enum(['resolved', 'unresolved']),
    manifest: parameterManifestWireSchema.optional(),
    current: parameterAuthoritySnapshotSchema.optional(),
    diagnostics: z.array(parameterDiagnosticSchema).optional(),
  })
  .strict()
  .superRefine((output, context) => {
    if (output.status === 'resolved' && (output.manifest === undefined || output.current === undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'Resolved parameters require manifest and current authority state',
      });
    }
    if (output.status === 'unresolved' && output.diagnostics === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Unresolved parameters require diagnostics',
      });
    }
  });

const proposeParameterOperationInputSchema = z
  .object({
    targetFile: rootedFilePathSchema.describe('Geometry source file relative to the project root.'),
    requestId: tokenSchema.describe('Stable caller-owned identifier reused only for identical retries.'),
    expected: parameterSetIdentitySchema,
    pressure: z.enum(['transient', 'final']),
    operation: parameterSetOperationSchema,
  })
  .strict();

/** Propose, confirm, or cancel one checked parameter operation. @public */
export const applyParameterOperationInputSchema = z.union([
  proposeParameterOperationInputSchema,
  z
    .object({
      action: z.enum(['confirm']),
      targetFile: rootedFilePathSchema,
      requestId: tokenSchema,
      planFingerprint: tokenSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(['cancel']),
      targetFile: rootedFilePathSchema,
      requestId: tokenSchema,
    })
    .strict(),
]);

const parameterSetOutcomeSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('confirmation-required'),
      requestId: tokenSchema,
      proposed: parameterAuthoritySnapshotSchema,
      planFingerprint: tokenSchema,
      producerCapability: parameterSourceUnitCapabilitySchema,
      dependencies: z.object({}).catchall(tokenSchema),
    })
    .strict(),
  z
    .object({
      status: z.literal('committed'),
      requestId: tokenSchema,
      revision: parameterSetIdentitySchema,
      write: z.enum(['applied', 'authority-no-op', 'durable-no-op', 'reconciled']),
    })
    .strict(),
  z
    .object({
      status: z.literal('rejected'),
      requestId: tokenSchema,
      code: tokenSchema,
      message: z.string(),
    })
    .strict(),
  z
    .object({
      status: z.literal('cancelled-before-apply'),
      requestId: tokenSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('known-not-applied-failure'),
      requestId: tokenSchema,
      code: tokenSchema,
      message: z.string(),
    })
    .strict(),
  z
    .object({
      status: z.literal('indeterminate'),
      requestId: tokenSchema,
      code: tokenSchema,
      message: z.string(),
    })
    .strict(),
]);

/** Complete business outcome; RPC execution success is represented separately. @public */
export const applyParameterOperationOutputSchema = z.object({ outcome: parameterSetOutcomeSchema }).strict();

/** @public */
export type GetParametersInput = z.infer<typeof getParametersInputSchema>;
/** @public */
export type GetParametersOutput = z.infer<typeof getParametersOutputSchema>;
/** @public */
export type ApplyParameterOperationInput = z.infer<typeof applyParameterOperationInputSchema>;
/** @public */
export type ApplyParameterOperationOutput = z.infer<typeof applyParameterOperationOutputSchema>;
