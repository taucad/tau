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
import {
  getKernelResultInputSchema,
  getKernelResultOutputSchema,
} from '#schemas/tools/get-kernel-result.tool.schema.js';
import { geoSpecRunFilterInputSchema, testModelOutputSchema } from '#schemas/tools/test-model.tool.schema.js';
import { exportGeometryInputSchema, exportGeometryOutputSchema } from '#schemas/tools/export-geometry.tool.schema.js';
import { screenshotInputSchema, screenshotOutputSchema } from '#schemas/tools/screenshot.tool.schema.js';
import { editFileInputSchema, editFileOutputSchema } from '#schemas/tools/edit-file.tool.schema.js';
import { useSkillInputSchema, useSkillOutputSchema } from '#schemas/tools/use-skill.tool.schema.js';
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
  'RENDER_TIMEOUT',
  'RESULT_TOO_LARGE',
  'SKILL_NOT_FOUND',
  'UNKNOWN',
  'UNKNOWN_GEOMETRY_UNIT',
  'VALIDATION_ERROR',
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
function defineRpc<Input extends zod.ZodRawShape, Success extends zod.ZodRawShape>(config: {
  input: zod.ZodObject<Input>;
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

const getKernelResultRpc = defineRpc({
  input: getKernelResultInputSchema,
  success: getKernelResultOutputSchema,
});

const runGeoSpecTestsRpc = defineRpc({
  input: geoSpecRunFilterInputSchema,
  success: testModelOutputSchema,
});

const exportGeometryRpc = defineRpc({
  input: exportGeometryInputSchema.extend({
    toolCallId: zod.string(),
  }),
  success: exportGeometryOutputSchema,
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
    occurrences: zod.number(),
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
  [rpcName.getKernelResult]: RpcSchemaEntry<GetKernelResultRpcInput, GetKernelResultRpcResult>;
  [rpcName.captureImages]: RpcSchemaEntry<CaptureImagesRpcInput, CaptureImagesRpcResult>;
  [rpcName.runGeoSpecTests]: RpcSchemaEntry<RunGeoSpecTestsRpcInput, RunGeoSpecTestsRpcResult>;
  [rpcName.exportGeometry]: RpcSchemaEntry<ExportGeometryRpcInput, ExportGeometryRpcResult>;
  [rpcName.appendFile]: RpcSchemaEntry<AppendFileRpcInput, AppendFileRpcResult>;
  [rpcName.editFile]: RpcSchemaEntry<EditFileRpcInput, EditFileRpcResult>;
  [rpcName.resolveSkill]: RpcSchemaEntry<ResolveSkillRpcInput, ResolveSkillRpcResult>;
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
  [rpcName.getKernelResult]: {
    inputSchema: getKernelResultRpc.inputSchema,
    resultSchema: getKernelResultRpc.resultSchema,
  },
  [rpcName.captureImages]: {
    inputSchema: captureImagesRpc.inputSchema,
    resultSchema: captureImagesRpc.resultSchema,
  },
  [rpcName.runGeoSpecTests]: {
    inputSchema: runGeoSpecTestsRpc.inputSchema,
    resultSchema: runGeoSpecTestsRpc.resultSchema,
  },
  [rpcName.exportGeometry]: {
    inputSchema: exportGeometryRpc.inputSchema,
    resultSchema: exportGeometryRpc.resultSchema,
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
  renderTimeout: 'RENDER_TIMEOUT',
  resultTooLarge: 'RESULT_TOO_LARGE',
  skillNotFound: 'SKILL_NOT_FOUND',
  unknown: 'UNKNOWN',
  unknownGeometryUnit: 'UNKNOWN_GEOMETRY_UNIT',
  validationError: 'VALIDATION_ERROR',
} as const satisfies Record<string, RpcClientErrorCode>;

/** @public */
export type ReadFileRpcInput = z.infer<typeof readFileRpc.inputSchema>;
/** @public */
export type ReadFileRpcSuccess = z.infer<typeof readFileRpc.successSchema>;
/** @public */
export type ReadFileRpcResult = z.infer<typeof readFileRpc.resultSchema>;

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
export type GetKernelResultRpcInput = z.infer<typeof getKernelResultRpc.inputSchema>;
/** @public */
export type GetKernelResultRpcSuccess = z.infer<typeof getKernelResultRpc.successSchema>;
/** @public */
export type GetKernelResultRpcResult = z.infer<typeof getKernelResultRpc.resultSchema>;

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
export type ExportGeometryRpcInput = z.infer<typeof exportGeometryRpc.inputSchema>;
/** @public */
export type ExportGeometryRpcSuccess = z.infer<typeof exportGeometryRpc.successSchema>;
/** @public */
export type ExportGeometryRpcResult = z.infer<typeof exportGeometryRpc.resultSchema>;

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
