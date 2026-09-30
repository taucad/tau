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
  z.object({ delivery: z.literal('inline'), bytes: z.instanceof(Uint8Array) }).strip(),
  z.object({ delivery: z.literal('pooled'), key: id }).strip(),
]);
const mediaType = z.string().trim().min(1);
const options = z
  .object({
    schema: z.custom<JSONSchema7>(isJsonSchema),
    defaults: z.record(z.string(), z.custom<unknown>(isWireJson)),
  })
  .strip();
const instance = z.object({ id, title: z.string() }).strip();
const viewOffer = z
  .object({
    id,
    title: z.string(),
    mimeType: mediaType,
    instances: z.array(instance).readonly().optional(),
    options: options.optional(),
  })
  .strip();
const exportOffer = z
  .object({ id, title: z.string(), mimeType: mediaType, extension: id, options: options.optional() })
  .strip();
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
    .strip(),
  z.object({ success: z.literal(false), id, transient: z.boolean(), issues, ...provenance }).strip(),
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
    .strip(),
  z
    .object({
      success: z.literal(false),
      kernelId: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      issues,
    })
    .strip(),
]);
const artifact = z
  .object({
    mimeType: mediaType,
    content: z.union([binary, z.string()]),
    units: z
      .object({ length: z.enum(cadLengthUnits) })
      .strip()
      .optional(),
  })
  .strip();
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
    .strip(),
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
    .strip(),
]);
const exportFile = z.object({ name: id, mimeType: mediaType, bytes: binary }).strip();
const exportFiles = z
  .tuple([exportFile], exportFile)
  .readonly()
  .superRefine((files, context) => {
    for (const issue of validateArtifactPaths(files)) {
      context.addIssue({
        code: 'custom',
        path: [issue.index, 'name'],
        message:
          issue.reason === 'duplicate-path'
            ? 'Artifact path duplicates an earlier file.'
            : 'Expected a safe relative artifact path.',
      });
    }
  });
const exportResult = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      exportId: id,
      evaluationId: id,
      files: exportFiles,
      issues,
      ...provenance,
    })
    .strip(),
  z.object({ success: z.literal(false), issues, ...provenance }).strip(),
]);
const describeArgs = z
  .object({
    stage: stage.optional(),
    file: file.strip(),
    resolution: z
      .object({
        mode: z.enum(['default', 'declared-only']).optional(),
        profile: z.literal('tau-json-structure-units-03-v1').optional(),
        inferenceLanguage: z.string().optional(),
        projectBindingDigest: runtimeContentDigestSchema.optional(),
        sourceUnitDigest: runtimeContentDigestSchema.optional(),
      })
      .strip()
      .optional(),
  })
  .strip();
const snapshotArgs = z
  .object({
    stage: stage.optional(),
    file,
    additionalPaths: z
      .array(z.object({ path: rootedFile, required: z.boolean() }).strip())
      .readonly()
      .optional(),
  })
  .strip();
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
                .strip(),
            )
            .readonly(),
          unresolvedPaths: z.array(rootedFile).readonly(),
          kernelId: z.string(),
        })
        .strip(),
      issues: z.array(issue),
      ...provenance,
    })
    .strip(),
  z.object({ success: z.literal(false), issues: z.array(issue), ...provenance }).strip(),
]);
const transcodeFile = z.object({ name: id, mimeType: mediaType, bytes: z.instanceof(Uint8Array) }).strip();
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
  .strip();
const transcodeResult = z.discriminatedUnion('success', [
  z
    .object({
      success: z.literal(true),
      data: z.array(exportFile).min(1),
      issues: z.array(issue),
      serializedNativeHandle: z.unknown().optional(),
      ...provenance,
    })
    .strip(),
  z.object({ success: z.literal(false), issues: z.array(issue), ...provenance }).strip(),
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
        .strip(),
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
      .strip(),
    update: z
      .object({
        ...withIntent,
        parameters: values.optional(),
        evaluateOptions: values.optional(),
        transient: z.boolean().optional(),
        stage: stage.optional(),
      })
      .strip()
      .refine((update) => update.transient !== true || update.stage === undefined, {
        message: 'Transient updates cannot stage files.',
      }),
    close: z.object(document).strip(),
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
      .strip(),
    updateView: z
      .object({
        ...subscription,
        ...request,
        instance: z.union([id, z.null()]).optional(),
        options: values.optional(),
        content: runtimeContentSchema.optional(),
      })
      .strip(),
    closeView: z.object(subscription).strip(),
    abort: z.object({ operationId: id, reason: z.number().int() }).strip(),
    binaryMaterialised: z.object({ key: id }).strip(),
    described: z.discriminatedUnion('success', [
      description.options[0].extend({ ...withIntent, ...evaluationId }),
      description.options[1].extend({ ...withIntent, ...evaluationId }),
    ]),
    evaluating: z.object({ ...withIntent, ...evaluationId, transient: z.boolean() }).strip(),
    evaluated: z.discriminatedUnion('success', [
      evaluation.options[0].extend(withIntent),
      evaluation.options[1].extend(withIntent),
    ]),
    rendering: z.object({ ...subscription, ...request, ...evaluationId, intent }).strip(),
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
      .strip(),
    errorEvent: z.discriminatedUnion('scope', [
      z.object({ scope: z.literal('connection'), error: z.object({ issues }).strip() }).strip(),
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
        .strip(),
    ]),
    stateChanged: z.object({ state: z.enum(['idle', 'busy', 'error']), detail: z.string().optional() }).strip(),
    log: runtimeLogArgsSchema,
    logBatch: runtimeLogBatchArgsSchema,
    telemetry: runtimeTelemetryArgsSchema,
    capabilitiesUpdated: runtimeCapabilitiesUpdatedArgsSchema,
  },
  listens: {},
} as const satisfies WireProtocolSchemas;
