/**
 * RPC Schemas for Client-Side Operations
 *
 * This file defines discriminated result types for RPC operations executed
 * via WebSocket between the backend and frontend. Each RPC operation returns
 * a discriminated union with `success: true` for success cases and
 * `success: false` with error details for failures.
 *
 * The rpcSchemasRegistry is used by ChatRpcService for validating inputs and results.
 */
import type { z } from 'zod';
import { z as zod } from 'zod';
import { rpcName } from '#constants/rpc.constants.js';
import { readFileInputSchema, readFileOutputSchema } from '#schemas/tools/read-file.tool.schema.js';
import { createFileInputSchema, createFileOutputSchema } from '#schemas/tools/create-file.tool.schema.js';
import { updateTodosInputSchema, updateTodosOutputSchema } from '#schemas/tools/update-todos.tool.schema.js';
import { askQuestionsInputSchema, askQuestionsOutputSchema } from '#schemas/tools/ask-questions.tool.schema.js';
import {
  installPackagesInputSchema,
  installPackagesOutputSchema,
} from '#schemas/tools/install-packages.tool.schema.js';
import { deleteFileInputSchema, deleteFileOutputSchema } from '#schemas/tools/delete-file.tool.schema.js';
import {
  directoryEntrySchema,
  listDirectoryInputSchema,
  listDirectoryOutputSchema,
} from '#schemas/tools/list-directory.tool.schema.js';
import { grepInputSchema, grepOutputSchema } from '#schemas/tools/grep.tool.schema.js';
import {
  globEntrySchema,
  globSearchInputSchema,
  globSearchOutputSchema,
} from '#schemas/tools/glob-search.tool.schema.js';
import { evaluateModelInputSchema, evaluateModelOutputSchema } from '#schemas/tools/evaluate-model.tool.schema.js';
import { geoSpecRunFilterInputSchema, testModelOutputSchema } from '#schemas/tools/test-model.tool.schema.js';
import { exportModelInputSchema, exportModelOutputSchema } from '#schemas/tools/export-model.tool.schema.js';
import { screenshotInputSchema, screenshotOutputSchema } from '#schemas/tools/screenshot.tool.schema.js';
import {
  arrangeWorkbenchInputSchema,
  arrangeWorkbenchOutputSchema,
} from '#schemas/tools/arrange-workbench.tool.schema.js';
import { editFileInputSchema, editFileOutputSchema } from '#schemas/tools/edit-file.tool.schema.js';
import { useSkillInputSchema, useSkillOutputSchema } from '#schemas/tools/use-skill.tool.schema.js';
import { revisionsInputSchema, revisionsOutputSchema } from '#schemas/tools/revisions.tool.schema.js';
import {
  applyParameterOperationInputSchema,
  applyParameterOperationOutputSchema,
  getParametersInputSchema,
  getParametersOutputSchema,
} from '#schemas/tools/parameter.tool.schema.js';
import { binaryFileContentMetadataSchema, textFileContentMetadataSchema } from '#schemas/file-metadata.schema.js';

// =============================================================================
// RPC Error Types
// =============================================================================

const byteSizeSchema = zod.number().int().nonnegative();

const textFileMetadataObjectSchema = zod
  .object({
    type: zod.literal('file'),
    size: byteSizeSchema,
    ...textFileContentMetadataSchema.shape,
  })
  .strict();

const binaryFileMetadataObjectSchema = zod
  .object({
    type: zod.literal('file'),
    size: byteSizeSchema,
    ...binaryFileContentMetadataSchema.shape,
  })
  .strict();

const fileMetadataObjectSchema = zod.union([textFileMetadataObjectSchema, binaryFileMetadataObjectSchema]);

/**
 * Error codes for business-level RPC failures.
 * These are distinct from infrastructure errors (timeout, disconnect) which
 * are handled by ToolExecutionError.
 * @public
 */
export const rpcClientErrorCodeSchema = zod.enum([
  'FILE_NOT_FOUND',
  'PERMISSION_DENIED',
  'IO_ERROR',
  'PARSE_ERROR',
  'AUTHENTICATION_ERROR',
  'OPERATION_TIMEOUT',
  'RESULT_TOO_LARGE',
  'SKILL_NOT_FOUND',
  'UNKNOWN',
  'UNKNOWN_GEOMETRY_UNIT',
  'VALIDATION_ERROR',
  'CONTEXT_NOT_FOUND',
  'AMBIGUOUS_MATCH',
  'EDIT_CONFLICT',
  'UNSUPPORTED_TEXT_ENCODING',
  'INVALID_TEXT_ENCODING',
  'WRITE_VERIFICATION_FAILED',
  'RECORD_CONFLICT',
  'INVALID_RECORD',
]);

/**
 * Base error schema for all RPC failures.
 * Used as the error variant in discriminated unions.
 * @public
 */
export const rpcClientErrorSchema = zod.object({
  success: zod.literal(false),
  errorCode: rpcClientErrorCodeSchema,
  message: zod.string(),
  fileMetadata: fileMetadataObjectSchema.optional(),
  retryable: zod.literal(true).optional(),
});

// =============================================================================
// RPC Definition Helper
// =============================================================================

/**
 * Helper to define RPC schemas with reduced boilerplate.
 *
 * Takes an input schema and a success data schema (without `success: true`),
 * and automatically:
 * - Adds `success: true` to create the full success schema
 * - Creates a discriminated union result schema with error handling
 *
 * @public
 *
 * @example <caption>Defining a typed RPC schema</caption>
 * ```typescript
 * import { z } from 'zod';
 *
 * function defineRpc(config: { input: z.ZodObject<z.ZodRawShape>; success: z.ZodObject<z.ZodRawShape> }) {
 *   return { inputSchema: config.input, successSchema: config.success.extend({ success: z.literal(true) }) };
 * }
 *
 * const rpc = defineRpc({
 *   input: z.object({ targetFile: z.string() }),
 *   success: z.object({ content: z.string(), totalLines: z.number() }),
 * });
 * ```
 */
function defineRpc<Input extends zod.ZodType, Success extends zod.ZodRawShape>(config: {
  input: Input;
  success: zod.ZodObject<Success>;
}) {
  const successSchema = config.success.extend({ success: zod.literal(true) });
  const resultSchema = zod.discriminatedUnion('success', [successSchema, rpcClientErrorSchema]);

  return {
    inputSchema: config.input,
    successSchema,
    resultSchema,
  };
}

// =============================================================================
// RPC Definitions
// =============================================================================

const readFileRpc = defineRpc({
  input: readFileInputSchema,
  success: readFileOutputSchema.extend({
    createdAt: zod.string().optional(),
  }),
});

const createFileRpc = defineRpc({
  input: createFileInputSchema,
  success: createFileOutputSchema,
});

const arrangeWorkbenchRpc = defineRpc({ input: arrangeWorkbenchInputSchema, success: arrangeWorkbenchOutputSchema });

/* Refusals are issues in a success result; only an unexpected filesystem failure is a failure. */
const installPackagesRpc = defineRpc({ input: installPackagesInputSchema, success: installPackagesOutputSchema });

const writeTodosRpc = defineRpc({
  input: updateTodosInputSchema,
  success: updateTodosOutputSchema,
});

const askQuestionsRpc = defineRpc({
  /* The trusted call id joins after parsing, as export_model's does; model input cannot choose it. */
  input: askQuestionsInputSchema.extend({ toolCallId: zod.string().min(1).max(256).optional() }),
  success: askQuestionsOutputSchema,
});

const deleteFileRpc = defineRpc({
  input: deleteFileInputSchema,
  success: deleteFileOutputSchema,
});

const rpcDirectoryEntrySchema = zod.union([
  directoryEntrySchema.options[0].extend({ modifiedAt: zod.string().optional() }).strict(),
  directoryEntrySchema.options[1].extend({ modifiedAt: zod.string().optional() }).strict(),
  directoryEntrySchema.options[2].extend({ modifiedAt: zod.string().optional() }).strict(),
]);

const listDirectoryRpc = defineRpc({
  input: listDirectoryInputSchema,
  success: listDirectoryOutputSchema.extend({
    entries: zod.array(rpcDirectoryEntrySchema),
  }),
});

const grepRpc = defineRpc({
  input: grepInputSchema,
  success: grepOutputSchema.extend({
    appliedHeadLimit: zod.number().int().nonnegative(),
    appliedOffset: zod.number().int().nonnegative(),
  }),
});

const rpcGlobEntrySchema = zod.union([
  globEntrySchema.options[0].extend({ modifiedAt: zod.string().optional() }).strict(),
  globEntrySchema.options[1].extend({ modifiedAt: zod.string().optional() }).strict(),
  globEntrySchema.options[2].extend({ modifiedAt: zod.string().optional() }).strict(),
]);

const globSearchRpc = defineRpc({
  input: globSearchInputSchema,
  success: globSearchOutputSchema.extend({
    entries: zod.array(rpcGlobEntrySchema),
  }),
});

const evaluateModelRpc = defineRpc({
  input: evaluateModelInputSchema,
  success: evaluateModelOutputSchema,
});

const runGeoSpecTestsRpc = defineRpc({
  input: geoSpecRunFilterInputSchema,
  success: testModelOutputSchema,
});

const exportModelRpc = defineRpc({
  input: exportModelInputSchema.extend({
    toolCallId: zod.string(),
  }),
  success: exportModelOutputSchema,
});

const captureImagesRpc = defineRpc({
  input: screenshotInputSchema.extend({ includeEdges: zod.boolean().optional() }).strict(),
  success: screenshotOutputSchema,
});

const appendFileRpc = defineRpc({
  input: zod.object({
    targetFile: zod.string(),
    content: zod.string(),
  }),
  success: zod.object({
    message: zod.string().optional(),
    bytesWritten: zod.number(),
  }),
});

const editFileRpc = defineRpc({
  input: editFileInputSchema,
  success: editFileOutputSchema.extend({
    message: zod.string().optional(),
    occurrences: zod.number().int().positive(),
    staleRecovered: zod.literal(true).optional(),
  }),
});

const skillShadowedSourceSchema = zod.object({
  source: zod.string(),
  resourceUri: zod.string().optional(),
  path: zod.string().optional(),
  skillPath: zod.string().optional(),
  fingerprint: zod.string().optional(),
});

const resolveSkillRpc = defineRpc({
  input: useSkillInputSchema.pick({ skillName: true }),
  success: useSkillOutputSchema.extend({
    title: zod.string().optional(),
    description: zod.string(),
    enabled: zod.boolean(),
    shadowedSources: zod.array(skillShadowedSourceSchema).optional(),
  }),
});

const readRevisionsRpc = defineRpc({
  input: revisionsInputSchema,
  success: revisionsOutputSchema,
});

const getParametersRpc = defineRpc({
  input: getParametersInputSchema,
  success: getParametersOutputSchema,
});

const applyParameterOperationRpc = defineRpc({
  input: applyParameterOperationInputSchema,
  success: applyParameterOperationOutputSchema,
});

// =============================================================================
// RPC Schemas Registry
// =============================================================================

type RpcSchemaEntry<Input = unknown, Result = unknown> = {
  inputSchema: zod.ZodType<Input>;
  resultSchema: zod.ZodType<Result>;
};

/**
 * Type representing the RPC schemas registry.
 * Used for type inference in sendRpcRequest.
 * @public
 */
export type RpcSchemasRegistry = {
  [rpcName.readFile]: RpcSchemaEntry<ReadFileRpcInput, ReadFileRpcResult>;
  [rpcName.createFile]: RpcSchemaEntry<CreateFileRpcInput, CreateFileRpcResult>;
  [rpcName.deleteFile]: RpcSchemaEntry<DeleteFileRpcInput, DeleteFileRpcResult>;
  [rpcName.listDirectory]: RpcSchemaEntry<ListDirectoryRpcInput, ListDirectoryRpcResult>;
  [rpcName.grep]: RpcSchemaEntry<GrepRpcInput, GrepRpcResult>;
  [rpcName.globSearch]: RpcSchemaEntry<GlobSearchRpcInput, GlobSearchRpcResult>;
  [rpcName.evaluateModel]: RpcSchemaEntry<EvaluateModelRpcInput, EvaluateModelRpcResult>;
  [rpcName.captureImages]: RpcSchemaEntry<CaptureImagesRpcInput, CaptureImagesRpcResult>;
  [rpcName.runGeoSpecTests]: RpcSchemaEntry<RunGeoSpecTestsRpcInput, RunGeoSpecTestsRpcResult>;
  [rpcName.exportModel]: RpcSchemaEntry<ExportModelRpcInput, ExportModelRpcResult>;
  [rpcName.appendFile]: RpcSchemaEntry<AppendFileRpcInput, AppendFileRpcResult>;
  [rpcName.editFile]: RpcSchemaEntry<EditFileRpcInput, EditFileRpcResult>;
  [rpcName.resolveSkill]: RpcSchemaEntry<ResolveSkillRpcInput, ResolveSkillRpcResult>;
  [rpcName.readRevisions]: RpcSchemaEntry<ReadRevisionsRpcInput, ReadRevisionsRpcResult>;
  [rpcName.getParameters]: RpcSchemaEntry<GetParametersRpcInput, GetParametersRpcResult>;
  [rpcName.applyParameterOperation]: RpcSchemaEntry<ApplyParameterOperationRpcInput, ApplyParameterOperationRpcResult>;
  [rpcName.writeTodos]: RpcSchemaEntry<WriteTodosRpcInput, WriteTodosRpcResult>;
  [rpcName.askQuestions]: typeof askQuestionsRpc;
  [rpcName.arrangeWorkbench]: typeof arrangeWorkbenchRpc;
  [rpcName.installPackages]: typeof installPackagesRpc;
};

/**
 * Runtime registry mapping RPC names to their Zod schemas.
 * Used by ChatRpcService for validating WebSocket RPC inputs/results.
 * @public
 */
export const rpcSchemasRegistry: RpcSchemasRegistry = {
  [rpcName.readFile]: {
    inputSchema: readFileRpc.inputSchema,
    resultSchema: readFileRpc.resultSchema,
  },
  [rpcName.createFile]: {
    inputSchema: createFileRpc.inputSchema,
    resultSchema: createFileRpc.resultSchema,
  },
  [rpcName.deleteFile]: {
    inputSchema: deleteFileRpc.inputSchema,
    resultSchema: deleteFileRpc.resultSchema,
  },
  [rpcName.listDirectory]: {
    inputSchema: listDirectoryRpc.inputSchema,
    resultSchema: listDirectoryRpc.resultSchema,
  },
  [rpcName.grep]: {
    inputSchema: grepRpc.inputSchema,
    resultSchema: grepRpc.resultSchema,
  },
  [rpcName.globSearch]: {
    inputSchema: globSearchRpc.inputSchema,
    resultSchema: globSearchRpc.resultSchema,
  },
  [rpcName.evaluateModel]: {
    inputSchema: evaluateModelRpc.inputSchema,
    resultSchema: evaluateModelRpc.resultSchema,
  },
  [rpcName.captureImages]: {
    inputSchema: captureImagesRpc.inputSchema,
    resultSchema: captureImagesRpc.resultSchema,
  },
  [rpcName.runGeoSpecTests]: {
    inputSchema: runGeoSpecTestsRpc.inputSchema,
    resultSchema: runGeoSpecTestsRpc.resultSchema,
  },
  [rpcName.exportModel]: {
    inputSchema: exportModelRpc.inputSchema,
    resultSchema: exportModelRpc.resultSchema,
  },
  [rpcName.appendFile]: {
    inputSchema: appendFileRpc.inputSchema,
    resultSchema: appendFileRpc.resultSchema,
  },
  [rpcName.editFile]: {
    inputSchema: editFileRpc.inputSchema,
    resultSchema: editFileRpc.resultSchema,
  },
  [rpcName.resolveSkill]: {
    inputSchema: resolveSkillRpc.inputSchema,
    resultSchema: resolveSkillRpc.resultSchema,
  },
  [rpcName.readRevisions]: {
    inputSchema: readRevisionsRpc.inputSchema,
    resultSchema: readRevisionsRpc.resultSchema,
  },
  [rpcName.getParameters]: {
    inputSchema: getParametersRpc.inputSchema,
    resultSchema: getParametersRpc.resultSchema,
  },
  [rpcName.applyParameterOperation]: {
    inputSchema: applyParameterOperationRpc.inputSchema,
    resultSchema: applyParameterOperationRpc.resultSchema,
  },
  [rpcName.writeTodos]: {
    inputSchema: writeTodosRpc.inputSchema,
    resultSchema: writeTodosRpc.resultSchema,
  },
  [rpcName.askQuestions]: askQuestionsRpc,
  [rpcName.arrangeWorkbench]: arrangeWorkbenchRpc,
  [rpcName.installPackages]: installPackagesRpc,
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Extract input type for a given RPC name.
 * @public
 */
export type RpcInput<T extends keyof RpcSchemasRegistry> = z.infer<RpcSchemasRegistry[T]['inputSchema']>;

/**
 * Extract result type for a given RPC name.
 * @public
 */
export type RpcResult<T extends keyof RpcSchemasRegistry> = z.infer<RpcSchemasRegistry[T]['resultSchema']>;

/**
 * Discriminated union of all RPC calls.
 * Each variant links the RPC name to its corresponding input type,
 * enabling TypeScript to narrow the `args` type when switching on `rpcName`.
 *
 * @public
 *
 * @example <caption>Switching on RPC call type</caption>
 * ```typescript
 * import type { RpcCall } from '@taucad/chat';
 *
 * function handleRpc(call: RpcCall) {
 *   switch (call.rpcName) {
 *     case 'read_file':
 *       return call.args.targetFile; // args narrowed to ReadFileRpcInput
 *   }
 * }
 * ```
 */
export type RpcCall<K extends keyof RpcSchemasRegistry = keyof RpcSchemasRegistry> = {
  [P in K]: {
    rpcName: P;
    args: RpcInput<P>;
  };
}[K];

// =============================================================================
// Inferred Types
// =============================================================================

/** @public */
export type RpcClientErrorCode = z.infer<typeof rpcClientErrorCodeSchema>;
/** @public */
export type RpcClientError = z.infer<typeof rpcClientErrorSchema>;

/**
 * Named identifiers for wire `errorCode` values (mirrors `rpcClientErrorCodeSchema`).
 * Use this instead of bare string literals so additions/removals stay aligned with Zod.
 *
 * @public
 */
export const rpcClientErrorCode = {
  fileNotFound: 'FILE_NOT_FOUND',
  permissionDenied: 'PERMISSION_DENIED',
  ioError: 'IO_ERROR',
  parseError: 'PARSE_ERROR',
  authenticationError: 'AUTHENTICATION_ERROR',
  operationTimeout: 'OPERATION_TIMEOUT',
  resultTooLarge: 'RESULT_TOO_LARGE',
  skillNotFound: 'SKILL_NOT_FOUND',
  unknown: 'UNKNOWN',
  unknownGeometryUnit: 'UNKNOWN_GEOMETRY_UNIT',
  validationError: 'VALIDATION_ERROR',
  contextNotFound: 'CONTEXT_NOT_FOUND',
  ambiguousMatch: 'AMBIGUOUS_MATCH',
  editConflict: 'EDIT_CONFLICT',
  unsupportedTextEncoding: 'UNSUPPORTED_TEXT_ENCODING',
  invalidTextEncoding: 'INVALID_TEXT_ENCODING',
  writeVerificationFailed: 'WRITE_VERIFICATION_FAILED',
  recordConflict: 'RECORD_CONFLICT',
  invalidRecord: 'INVALID_RECORD',
} as const satisfies Record<string, RpcClientErrorCode>;

/** @public */
export type ReadFileRpcInput = z.infer<typeof readFileRpc.inputSchema>;
/** @public */
export type ReadFileRpcSuccess = z.infer<typeof readFileRpc.successSchema>;
/** @public */
export type ReadFileRpcResult = z.infer<typeof readFileRpc.resultSchema>;

/** @public */
export type WriteTodosRpcInput = z.infer<typeof writeTodosRpc.inputSchema>;
/** @public */
export type WriteTodosRpcSuccess = z.infer<typeof writeTodosRpc.successSchema>;
/** @public */
export type WriteTodosRpcResult = z.infer<typeof writeTodosRpc.resultSchema>;

/** @public */
export type InstallPackagesRpcInput = z.infer<typeof installPackagesRpc.inputSchema>;
/** @public */
export type InstallPackagesRpcResult = z.infer<typeof installPackagesRpc.resultSchema>;

/** @public */
export type AskQuestionsRpcInput = z.infer<typeof askQuestionsRpc.inputSchema>;
/** @public */
export type AskQuestionsRpcResult = z.infer<typeof askQuestionsRpc.resultSchema>;

/** @public */
export type CreateFileRpcInput = z.infer<typeof createFileRpc.inputSchema>;
/** @public */
export type CreateFileRpcSuccess = z.infer<typeof createFileRpc.successSchema>;
/** @public */
export type CreateFileRpcResult = z.infer<typeof createFileRpc.resultSchema>;

/** @public */
export type DeleteFileRpcInput = z.infer<typeof deleteFileRpc.inputSchema>;
/** @public */
export type DeleteFileRpcSuccess = z.infer<typeof deleteFileRpc.successSchema>;
/** @public */
export type DeleteFileRpcResult = z.infer<typeof deleteFileRpc.resultSchema>;

/** @public */
export type ListDirectoryRpcInput = z.infer<typeof listDirectoryRpc.inputSchema>;
/** @public */
export type ListDirectoryRpcSuccess = z.infer<typeof listDirectoryRpc.successSchema>;
/** @public */
export type ListDirectoryRpcResult = z.infer<typeof listDirectoryRpc.resultSchema>;

/** @public */
export type GrepRpcInput = z.infer<typeof grepRpc.inputSchema>;
/** @public */
export type GrepRpcSuccess = z.infer<typeof grepRpc.successSchema>;
/** @public */
export type GrepRpcResult = z.infer<typeof grepRpc.resultSchema>;

/** @public */
export type GlobSearchRpcInput = z.infer<typeof globSearchRpc.inputSchema>;
/** @public */
export type GlobSearchRpcSuccess = z.infer<typeof globSearchRpc.successSchema>;
/** @public */
export type GlobSearchRpcResult = z.infer<typeof globSearchRpc.resultSchema>;

/** @public */
export type EvaluateModelRpcInput = z.infer<typeof evaluateModelRpc.inputSchema>;
/** @public */
export type EvaluateModelRpcSuccess = z.infer<typeof evaluateModelRpc.successSchema>;
/** @public */
export type EvaluateModelRpcResult = z.infer<typeof evaluateModelRpc.resultSchema>;

/** @public */
export type CaptureImagesRpcInput = z.infer<typeof captureImagesRpc.inputSchema>;
/** @public */
export type CaptureImagesRpcSuccess = z.infer<typeof captureImagesRpc.successSchema>;
/** @public */
export type CaptureImagesRpcResult = z.infer<typeof captureImagesRpc.resultSchema>;

/** @public */
export type RunGeoSpecTestsRpcInput = z.infer<typeof runGeoSpecTestsRpc.inputSchema>;
/** @public */
export type RunGeoSpecTestsRpcSuccess = z.infer<typeof runGeoSpecTestsRpc.successSchema>;
/** @public */
export type RunGeoSpecTestsRpcResult = z.infer<typeof runGeoSpecTestsRpc.resultSchema>;

/** @public */
export type ExportModelRpcInput = z.infer<typeof exportModelRpc.inputSchema>;
/** @public */
export type ExportModelRpcSuccess = z.infer<typeof exportModelRpc.successSchema>;
/** @public */
export type ExportModelRpcResult = z.infer<typeof exportModelRpc.resultSchema>;

/** @public */
export type AppendFileRpcInput = z.infer<typeof appendFileRpc.inputSchema>;
/** @public */
export type AppendFileRpcSuccess = z.infer<typeof appendFileRpc.successSchema>;
/** @public */
export type AppendFileRpcResult = z.infer<typeof appendFileRpc.resultSchema>;

/** @public */
export type EditFileRpcInput = z.infer<typeof editFileRpc.inputSchema>;
/** @public */
export type EditFileRpcSuccess = z.infer<typeof editFileRpc.successSchema>;
/** @public */
export type EditFileRpcResult = z.infer<typeof editFileRpc.resultSchema>;

/** @public */
export type ResolveSkillRpcInput = z.infer<typeof resolveSkillRpc.inputSchema>;
/** @public */
export type ResolveSkillRpcSuccess = z.infer<typeof resolveSkillRpc.successSchema>;
/** @public */
export type ResolveSkillRpcResult = z.infer<typeof resolveSkillRpc.resultSchema>;

/** @public */
export type ReadRevisionsRpcInput = z.infer<typeof readRevisionsRpc.inputSchema>;
/** @public */
export type ReadRevisionsRpcSuccess = z.infer<typeof readRevisionsRpc.successSchema>;
/** @public */
export type ReadRevisionsRpcResult = z.infer<typeof readRevisionsRpc.resultSchema>;

/** @public */
export type GetParametersRpcInput = z.infer<typeof getParametersRpc.inputSchema>;
/** @public */
export type GetParametersRpcSuccess = z.infer<typeof getParametersRpc.successSchema>;
/** @public */
export type GetParametersRpcResult = z.infer<typeof getParametersRpc.resultSchema>;

/** @public */
export type ApplyParameterOperationRpcInput = z.infer<typeof applyParameterOperationRpc.inputSchema>;
/** @public */
export type ApplyParameterOperationRpcSuccess = z.infer<typeof applyParameterOperationRpc.successSchema>;
/** @public */
export type ApplyParameterOperationRpcResult = z.infer<typeof applyParameterOperationRpc.resultSchema>;
