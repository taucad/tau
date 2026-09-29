import { z } from 'zod';
import type { WireProtocolSchemas } from '@taucad/rpc';
import type { RuntimeDocumentProtocol } from '#types/runtime-document-protocol.types.js';
import type { ContentDigest } from '@taucad/cache-core';
import type { JSONSchema7 } from '@taucad/json-schema';
import type { ParameterManifest } from '@taucad/parameters';
import { isParameterManifestShape } from '@taucad/parameters';
import { cadLengthUnits } from '@taucad/types/constants';
import { runtimeContentSchema } from '#types/runtime-content.types.js';
import { kernelIssueCodeValues } from '#types/kernel-issue-codes.js';
import { assertRootedPath } from '@taucad/utils/path';
import { runtimeProtocolSchemas } from '#types/runtime-protocol.schemas.js';

const id = z.string().min(1);
const intent = z.number().int().min(0);
const values = z.record(z.string(), z.unknown());
const issue = z
  .object({
    code: z.enum(kernelIssueCodeValues),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
    details: z.unknown().optional(),
  })
  .catchall(z.unknown());
const issues = z.array(issue);
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
const sourceRevision = z
  .object({
    entry: rootedFile,
    files: z.record(
      rootedFile,
      z.union([
        z.custom<ContentDigest>((value) => typeof value === 'string' && /^sha256:[0-9a-f]{64}$/u.test(value)),
        z.literal('missing'),
      ]),
    ),
  })
  .strict();
const provenance = { sourceRevision: sourceRevision.optional() };
const binary = z.discriminatedUnion('delivery', [
  z.object({ delivery: z.literal('inline'), bytes: z.instanceof(Uint8Array) }).strict(),
  z.object({ delivery: z.literal('pooled'), key: id }).strict(),
]);
const mediaType = z.string().trim().min(1);
const jsonSchemaTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
const isWireJson = (value: unknown, ancestors = new Set<unknown>(), depth = 0): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value !== 'object' || depth > 64 || ancestors.has(value)) {
    return false;
  }
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) {
    return false;
  }
  if (ownKeys.length - (Array.isArray(value) ? 1 : 0) !== Object.keys(value).length) {
    return false;
  }
  if (Array.isArray(value) && Object.keys(value).length !== value.length) {
    return false;
  }
  ancestors.add(value);
  try {
    return Object.values(Object.getOwnPropertyDescriptors(value)).every(
      (descriptor) => 'value' in descriptor && isWireJson(descriptor.value, ancestors, depth + 1),
    );
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
};
const isJsonSchema = (value: unknown): value is JSONSchema7 => {
  if (!isWireJson(value) || typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const schema = value as Record<string, unknown>;
  if (schema['type'] !== undefined) {
    const types = Array.isArray(schema['type']) ? schema['type'] : [schema['type']];
    if (!types.every((type) => typeof type === 'string' && jsonSchemaTypes.has(type))) {
      return false;
    }
  }
  if (schema['properties'] !== undefined) {
    if (
      typeof schema['properties'] !== 'object' ||
      schema['properties'] === null ||
      Array.isArray(schema['properties'])
    ) {
      return false;
    }
    if (
      !Object.values(schema['properties']).every((property) => typeof property === 'boolean' || isJsonSchema(property))
    ) {
      return false;
    }
  }
  if (
    schema['required'] !== undefined &&
    (!Array.isArray(schema['required']) || !schema['required'].every((key) => typeof key === 'string'))
  ) {
    return false;
  }
  return true;
};
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
    instances: z.array(instance).optional(),
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
      views: z.array(viewOffer),
      exports: z.array(exportOffer),
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
      kernelId: z.union([z.string(), z.undefined()]),
      parameters: z.custom<ParameterManifest>(isParameterManifestShape),
      issues,
    })
    .strict(),
  z.object({ success: z.literal(false), kernelId: z.union([z.string(), z.undefined()]), issues }).strict(),
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
      files: z.tuple([exportFile], exportFile),
      issues,
      ...provenance,
    })
    .strict(),
  z.object({ success: z.literal(false), issues, ...provenance }).strict(),
]);
const document = { documentId: id };
const withIntent = { ...document, intent };
const subscription = { subscriptionId: id };
const request = { requestId: id };
const evaluationId = { evaluationId: id };

/** Runtime document wire validators. Every admitted command and result is checked here. @public */
export const runtimeDocumentProtocolSchemas = {
  hello: runtimeProtocolSchemas.hello,
  calls: {
    initialize: runtimeProtocolSchemas.calls.initialize,
    describe: {
      args: runtimeProtocolSchemas.calls.resolveParameters.args,
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
    snapshotSource: runtimeProtocolSchemas.calls.snapshotSource,
    transcode: runtimeProtocolSchemas.calls.transcode,
    dispose: runtimeProtocolSchemas.calls.cleanup,
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
    binaryMaterialised: runtimeProtocolSchemas.notifies.binaryMaterialised,
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
      z.object({ scope: z.literal('connection'), error: runtimeProtocolSchemas.notifies.errorEvent }).strict(),
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
    log: runtimeProtocolSchemas.notifies.log,
    logBatch: runtimeProtocolSchemas.notifies.logBatch,
    telemetry: runtimeProtocolSchemas.notifies.telemetry,
    capabilitiesUpdated: runtimeProtocolSchemas.notifies.capabilitiesUpdated,
  },
  listens: {},
} as const satisfies WireProtocolSchemas<RuntimeDocumentProtocol>;
