import { z } from 'zod';
import type { WireProtocolSchemas } from '@taucad/rpc';
import type { JSONSchema7 } from '@taucad/json-schema';
import { isJsonSchema, isWireJson } from '#types/runtime-metadata-validation.js';
import type { ParameterManifest } from '@taucad/parameters';
import { isParameterManifestShape } from '@taucad/parameters';
import { cadLengthUnits } from '@taucad/types/constants';
import { runtimeContentSchema } from '#types/runtime-content.types.js';
import { assertRootedPath } from '@taucad/utils/path';
import { validateArtifactPaths } from '#types/export-artifact-validation.js';
import {
  runtimeInitializeArgsSchema,
  runtimeInitializeResultSchema,
  runtimeLogArgsSchema,
  runtimeLogBatchArgsSchema,
  runtimeTelemetryArgsSchema,
  runtimeCapabilitiesUpdatedArgsSchema,
  runtimeContentDigestSchema,
  runtimeIssueSchema,
  runtimeSourceRevisionSchema,
  transportHelloPayloadSchema,
} from '#types/runtime-wire-common.schemas.js';

const id = z.string().min(1);
const intent = z.number().int().min(0);
const values = z.record(z.string(), z.unknown());
const issue = runtimeIssueSchema;
const issues = z.array(issue).readonly();
const rootedFile = z
  .string()
  .min(1)
  .superRefine((value, context) => {
    try {
      assertRootedPath(value);
    } catch {
      context.addIssue({ code: 'custom', message: 'Expected a rooted file path.' });
    }
  });
const file = z.object({ path: z.string(), filename: id });
const stage = z.record(rootedFile, z.instanceof(Uint8Array));
const provenance = { sourceRevision: runtimeSourceRevisionSchema.optional() };
const binary = z.discriminatedUnion('delivery', [
  z.object({ delivery: z.literal('inline'), bytes: z.instanceof(Uint8Array) }).strict(),
  z.object({ delivery: z.literal('pooled'), key: id }).strict(),
]);
const mediaType = z.string().trim().min(1);
const options = z
  .object({
    schema: z.custom<JSONSchema7>(isJsonSchema),
    defaults: z.record(z.string(), z.custom<unknown>(isWireJson)),
  })
  .strict();
const instance = z.object({ id, title: z.string() }).strict();
const viewOffer = z
  .object({
    id,
    title: z.string(),
    mimeType: mediaType,
    instances: z.array(instance).readonly().optional(),
    options: options.optional(),
  })
  .strict();
const exportOffer = z
  .object({ id, title: z.string(), mimeType: mediaType, extension: id, options: options.optional() })
  .strict();
const evaluation = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      id,
      transient: z.boolean(),
      views: z.array(viewOffer).readonly(),
      exports: z.array(exportOffer).readonly(),
      issues,
      ...provenance,
    })
    .strict(),
  z.object({ success: z.literal(false), id, transient: z.boolean(), issues, ...provenance }).strict(),
]);
const description = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      kernelId: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      parameters: z.custom<ParameterManifest>(isParameterManifestShape),
      issues,
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      kernelId: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      issues,
    })
    .strict(),
]);
const artifact = z
  .object({
    mimeType: mediaType,
    content: z.union([binary, z.string()]),
    units: z
      .object({ length: z.enum(cadLengthUnits) })
      .strict()
      .optional(),
  })
  .strict();
const rendering = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      view: id,
      artifact,
      hash: id,
      requestId: id,
      evaluationId: id,
      instance: id.optional(),
      transient: z.boolean(),
      issues,
      ...provenance,
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      view: id.optional(),
      requestId: id,
      evaluationId: id,
      instance: id.optional(),
      transient: z.boolean(),
      issues,
      ...provenance,
    })
    .strict(),
]);
const exportFile = z.object({ name: id, mimeType: mediaType, bytes: binary }).strict();
const exportResult = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      exportId: id,
      evaluationId: id,
      files: z.tuple([exportFile], exportFile).readonly(),
      issues,
      ...provenance,
    })
    .strict(),
  z.object({ success: z.literal(false), issues, ...provenance }).strict(),
]);
const describeArgs = z
  .object({
    stage: stage.optional(),
    file: file.strict(),
    resolution: z
      .object({
        mode: z.enum(['default', 'declared-only']).optional(),
        profile: z.literal('tau-json-structure-units-03-v1').optional(),
        inferenceLanguage: z.string().optional(),
        projectBindingDigest: runtimeContentDigestSchema.optional(),
        sourceUnitDigest: runtimeContentDigestSchema.optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const snapshotArgs = z
  .object({
    stage: stage.optional(),
    file,
    additionalPaths: z
      .array(z.object({ path: rootedFile, required: z.boolean() }).strict())
      .readonly()
      .optional(),
  })
  .strict();
const snapshotResult = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      data: z
        .object({
          entryPath: rootedFile,
          files: z
            .array(
              z
                .object({
                  path: rootedFile,
                  content: z.instanceof(Uint8Array),
                  sha256: z.string(),
                  role: z.enum(['entry', 'kernel-dependency', 'middleware-dependency', 'additional']),
                })
                .strict(),
            )
            .readonly(),
          unresolvedPaths: z.array(rootedFile).readonly(),
          kernelId: z.string(),
        })
        .strict(),
      issues: z.array(issue),
      ...provenance,
    })
    .strict(),
  z.object({ success: z.literal(false), issues: z.array(issue), ...provenance }).strict(),
]);
const transcodeFile = z.object({ name: id, mimeType: mediaType, bytes: z.instanceof(Uint8Array) }).strict();
const transcodeArgs = z
  .object({
    from: id,
    to: id,
    files: z
      .array(transcodeFile)
      .min(1)
      .superRefine((files, context) => {
        for (const issue of validateArtifactPaths(files)) {
          context.addIssue({
            code: 'custom',
            path: [issue.index, 'name'],
            message:
              issue.reason === 'duplicate-path'
                ? 'Artifact path duplicates an earlier input.'
                : 'Expected a safe relative artifact path.',
          });
        }
      }),
    options: values,
  })
  .strict();
const transcodeResult = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      data: z.array(exportFile).min(1),
      issues: z.array(issue),
      serializedNativeHandle: z.unknown().optional(),
      ...provenance,
    })
    .strict(),
  z.object({ success: z.literal(false), issues: z.array(issue), ...provenance }).strict(),
]);
const document = { documentId: id };
const withIntent = { ...document, intent };
const subscription = { subscriptionId: id };
const request = { requestId: id };
const evaluationId = { evaluationId: id };

/** Runtime document wire validators. Every admitted command and result is checked here. @public */
export const runtimeDocumentProtocolSchemas = {
  hello: transportHelloPayloadSchema,
  calls: {
    initialize: { args: runtimeInitializeArgsSchema, result: runtimeInitializeResultSchema },
    describe: {
      args: describeArgs,
      result: description,
    },
    export: {
      args: z
        .object({
          ...document,
          operationId: id,
          target: id,
          options: values.optional(),
          content: runtimeContentSchema.optional(),
        })
        .strict(),
      result: exportResult,
    },
    snapshotSource: { args: snapshotArgs, result: snapshotResult },
    transcode: { args: transcodeArgs, result: transcodeResult },
    dispose: { args: z.null(), result: z.null() },
  },
  notifies: {
    open: z
      .object({
        ...withIntent,
        file,
        parameters: values,
        evaluateOptions: values.optional(),
        stage: stage.optional(),
        watch: z.boolean(),
      })
      .strict(),
    update: z
      .object({
        ...withIntent,
        parameters: values.optional(),
        evaluateOptions: values.optional(),
        transient: z.boolean().optional(),
        stage: stage.optional(),
      })
      .strict()
      .refine((update) => update.transient !== true || update.stage === undefined, {
        message: 'Transient updates cannot stage files.',
      }),
    close: z.object(document).strict(),
    openView: z
      .object({
        ...document,
        ...subscription,
        ...request,
        view: id.optional(),
        instance: z.union([id, z.null()]).optional(),
        options: values.optional(),
        content: runtimeContentSchema.optional(),
      })
      .strict(),
    updateView: z
      .object({
        ...subscription,
        ...request,
        instance: z.union([id, z.null()]).optional(),
        options: values.optional(),
        content: runtimeContentSchema.optional(),
      })
      .strict(),
    closeView: z.object(subscription).strict(),
    abort: z.object({ operationId: id, reason: z.number().int() }).strict(),
    binaryMaterialised: z.object({ key: id }).strict(),
    described: z.discriminatedUnion('success', [
      description.options[0].extend({ ...withIntent, ...evaluationId }),
      description.options[1].extend({ ...withIntent, ...evaluationId }),
    ]),
    evaluating: z.object({ ...withIntent, ...evaluationId, transient: z.boolean() }).strict(),
    evaluated: z.discriminatedUnion('success', [
      evaluation.options[0].extend(withIntent),
      evaluation.options[1].extend(withIntent),
    ]),
    rendering: z.object({ ...subscription, ...request, ...evaluationId, intent }).strict(),
    rendered: z.discriminatedUnion('success', [
      rendering.options[0].extend({ ...subscription, intent }),
      rendering.options[1].extend({ ...subscription, intent }),
    ]),
    progress: z
      .object({
        ...withIntent,
        ...evaluationId,
        operationId: id,
        requestId: id.optional(),
        phase: id,
        detail: values.optional(),
      })
      .strict(),
    errorEvent: z.discriminatedUnion('scope', [
      z.object({ scope: z.literal('connection'), error: z.object({ issues }).strict() }).strict(),
      z
        .object({
          scope: z.literal('operation'),
          ...withIntent,
          operationId: id,
          evaluationId: id.optional(),
          subscriptionId: id.optional(),
          requestId: id.optional(),
          code: z.enum(['OPERATION_TIMEOUT', 'OPERATION_ABORTED']),
          phase: id,
          message: z.string(),
        })
        .strict(),
    ]),
    stateChanged: z.object({ state: z.enum(['idle', 'busy', 'error']), detail: z.string().optional() }).strict(),
    log: runtimeLogArgsSchema,
    logBatch: runtimeLogBatchArgsSchema,
    telemetry: runtimeTelemetryArgsSchema,
    capabilitiesUpdated: runtimeCapabilitiesUpdatedArgsSchema,
  },
  listens: {},
} as const satisfies WireProtocolSchemas;
