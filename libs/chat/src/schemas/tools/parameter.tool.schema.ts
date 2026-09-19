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

/*
 * Provider-facing JSON values. The recursive schemas above serialize as `$ref` loops through
 * `definitions`, which Vertex refuses outright ("ref loops are only supported if they include
 * optional or nullable property values"). Piping a typeless input side into them keeps the full
 * runtime check — non-finite numbers and non-JSON graphs are still rejected — while the wire form
 * `z.toJSONSchema(…, { io: 'input' })` emits is just the description.
 */
const wireJsonValueSchema = z.any().describe('Any JSON value.').pipe(jsonValueSchema);
const wireJsonObjectSchema = z
  .any()
  .describe('A JSON object mapping parameter names to any JSON value.')
  .pipe(jsonObjectSchema);

/**
 * The admitted manifest a parameter read or operation was built from. A source change produces a
 * new manifest revision, so this one token covers every semantic input. @public
 */
export const parameterSetIdentitySchema = z.object({ manifestRevision: tokenSchema }).strict();

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
    value: wireJsonValueSchema,
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
      value: wireJsonValueSchema,
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
      values: wireJsonObjectSchema,
    })
    .strict(),
  z
    .object({
      kind: z.enum(['create-group']),
      group: tokenSchema,
      values: wireJsonObjectSchema.optional(),
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
      kind: z.enum(['source-unit']),
      mode: z.enum(['preserve-size', 'reinterpret']),
      group: tokenSchema,
      parameterId: tokenSchema,
      resource: tokenSchema,
      pointer: z.string(),
      unit: tokenSchema,
      producerCapability: parameterSourceUnitCapabilitySchema,
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
      'Stable diagnostic code, for example INVALID_SCHEMA, INVALID_RECORD, RESOLUTION_FAILED, WATCH_FAILED or RESOLUTION_SUPERSEDED.',
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

const targetFileField = rootedFilePathSchema.describe('Geometry source file relative to the project root.');
const requestIdField = tokenSchema.describe(
  'Stable caller-owned identifier. Reuse it only for an identical retry, and reuse the proposal’s id to confirm or cancel it.',
);

/**
 * The narrow shape each action really carries. Every field a given action does not use is refused,
 * so a `confirm` cannot smuggle an operation and a `propose` cannot smuggle a plan fingerprint.
 */
const applyParameterOperationActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.enum(['propose']),
      targetFile: targetFileField,
      requestId: requestIdField,
      expected: parameterSetIdentitySchema,
      pressure: z.enum(['transient', 'final']),
      operation: parameterSetOperationSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(['confirm']),
      targetFile: targetFileField,
      requestId: requestIdField,
      planFingerprint: tokenSchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(['cancel']),
      targetFile: targetFileField,
      requestId: requestIdField,
    })
    .strict(),
]);

/**
 * Propose, confirm, or cancel one checked parameter operation.
 *
 * The wire form is one flat object: a top-level union has no `type: 'object'`, which Anthropic
 * rejects outright and pi's Anthropic codec silently degrades to a tool with no parameters at all.
 * The flat object is only the input side — it narrows to {@link applyParameterOperationActionSchema},
 * so per-action requirements are still enforced at the boundary rather than at every consumer.
 * @public
 */
export const applyParameterOperationInputSchema = z
  .object({
    action: z
      .enum(['propose', 'confirm', 'cancel'])
      .describe(
        'propose submits one operation; confirm applies a plan a previous propose returned as confirmation-required; cancel discards it.',
      ),
    targetFile: targetFileField,
    requestId: requestIdField,
    expected: parameterSetIdentitySchema
      .describe('Required for propose: the exact identity get_parameters returned.')
      .optional(),
    pressure: z
      .enum(['transient', 'final'])
      .describe('Required for propose: transient for an intermediate step, final for the settled value.')
      .optional(),
    operation: parameterSetOperationSchema.describe('Required for propose: the operation to apply.').optional(),
    planFingerprint: tokenSchema
      .describe('Required for confirm: the planFingerprint from the confirmation-required outcome.')
      .optional(),
  })
  .strict()
  .pipe(applyParameterOperationActionSchema);

const parameterSetOutcomeSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('confirmation-required'),
      requestId: tokenSchema,
      proposed: parameterAuthoritySnapshotSchema,
      planFingerprint: tokenSchema,
      producerCapability: parameterSourceUnitCapabilitySchema,
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
