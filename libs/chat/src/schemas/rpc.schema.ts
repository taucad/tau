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
import { diffStatsWithContentSchema } from '#schemas/tools/diff.schema.js';
import { kernelIssueSchema } from '#schemas/tools/issue.schema.js';
import { observationSchema } from '#schemas/tools/test-model.tool.schema.js';
import { exportGeometryFormatSchema } from '#schemas/tools/export-geometry.tool.schema.js';

// =============================================================================
// RPC Error Types
// =============================================================================

/**
 * Error codes for business-level RPC failures.
 * These are distinct from infrastructure errors (timeout, disconnect) which
 * are handled by ToolExecutionError.
 * @public
 */
export const rpcClientErrorCodeSchema = zod.enum([
  'FILE_NOT_FOUND',
  'NO_TOP_LEVEL_GEOMETRY',
  'PERMISSION_DENIED',
  'IO_ERROR',
  'PARSE_ERROR',
  'RENDER_TIMEOUT',
  'RESULT_TOO_LARGE',
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
  input: zod.object({
    targetFile: zod.string(),
    offset: zod.number().int().min(1).optional(),
    limit: zod.number().int().min(1).max(2000).optional(),
  }),
  success: zod.object({
    content: zod.string(),
    totalLines: zod.number(),
    startLine: zod.number().optional(),
    truncated: zod.boolean().optional(),
    createdAt: zod.string().optional(),
    modifiedAt: zod.string().optional(),
  }),
});

const createFileRpc = defineRpc({
  input: zod.object({
    targetFile: zod.string(),
    content: zod.string(),
  }),
  success: zod.object({
    message: zod.string().optional(),
    diffStats: diffStatsWithContentSchema,
  }),
});

const deleteFileRpc = defineRpc({
  input: zod.object({
    targetFile: zod.string(),
  }),
  success: zod.object({
    message: zod.string(),
  }),
});

const directoryEntrySchema = zod.object({
  name: zod.string(),
  type: zod.enum(['file', 'dir']),
  size: zod.number(),
  modifiedAt: zod.string().optional(),
});

const listDirectoryRpc = defineRpc({
  input: zod.object({
    path: zod.string(),
  }),
  success: zod.object({
    entries: zod.array(directoryEntrySchema),
    path: zod.string(),
  }),
});

const grepMatchSchema = zod.object({
  file: zod.string(),
  line: zod.number(),
  content: zod.string(),
});

const grepRpc = defineRpc({
  input: zod.object({
    pattern: zod.string(),
    path: zod.string().optional(),
    glob: zod.string().optional(),
    caseSensitive: zod.boolean().optional(),
    headLimit: zod.number().int().min(1).max(1000).optional(),
    offset: zod.number().int().min(0).optional(),
  }),
  success: zod.object({
    matches: zod.array(grepMatchSchema),
    totalMatches: zod.number(),
    truncated: zod.boolean().optional(),
    appliedHeadLimit: zod.number().int().nonnegative(),
    appliedOffset: zod.number().int().nonnegative(),
  }),
});

const globFileEntrySchema = zod.object({
  path: zod.string(),
  isDirectory: zod.boolean().optional(),
  size: zod.number().optional(),
  modifiedAt: zod.string().optional(),
});

const globSearchRpc = defineRpc({
  input: zod.object({
    pattern: zod.string(),
    path: zod.string().optional(),
  }),
  success: zod.object({
    files: zod.array(zod.string()),
    entries: zod.array(globFileEntrySchema).optional(),
    totalFiles: zod.number(),
  }),
});

const getKernelResultRpc = defineRpc({
  input: zod.object({
    targetFile: zod.string(),
  }),
  success: zod.object({
    status: zod.enum(['ready', 'error', 'pending']),
    kernelIssues: zod.array(kernelIssueSchema).optional(),
  }),
});

const captureObservationsRpc = defineRpc({
  input: zod.object({
    targetFile: zod.string(),
  }),
  success: zod.object({
    observations: zod.array(observationSchema),
  }),
});

const exportGeometryRpc = defineRpc({
  input: zod.object({
    toolCallId: zod.string(),
    targetFile: zod.string(),
    format: exportGeometryFormatSchema,
  }),
  success: zod.object({
    artifactPath: zod.string(),
    format: exportGeometryFormatSchema,
    mimeType: zod.string(),
    byteLength: zod.number().int().nonnegative(),
  }),
});

const fetchGeometryRpc = defineRpc({
  input: zod.object({
    artifactId: zod.string().optional(),
    targetFile: zod.string(),
  }),
  success: zod.object({
    glb: zod.instanceof(Uint8Array),
    artifactPath: zod.string().optional(),
  }),
});

const captureScreenshotRpc = defineRpc({
  input: zod.object({
    targetFile: zod.string(),
  }),
  success: zod.object({
    images: zod.array(
      zod.object({
        view: zod.string(),
        dataUrl: zod.string(),
      }),
    ),
  }),
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
  input: zod.object({
    targetFile: zod.string(),
    oldString: zod.string(),
    newString: zod.string(),
    replaceAll: zod.boolean().optional(),
  }),
  success: zod.object({
    message: zod.string().optional(),
    occurrences: zod.number(),
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
  [rpcName.captureObservations]: RpcSchemaEntry<CaptureObservationsRpcInput, CaptureObservationsRpcResult>;
  [rpcName.fetchGeometry]: RpcSchemaEntry<FetchGeometryRpcInput, FetchGeometryRpcResult>;
  [rpcName.exportGeometry]: RpcSchemaEntry<ExportGeometryRpcInput, ExportGeometryRpcResult>;
  [rpcName.captureScreenshot]: RpcSchemaEntry<CaptureScreenshotRpcInput, CaptureScreenshotRpcResult>;
  [rpcName.appendFile]: RpcSchemaEntry<AppendFileRpcInput, AppendFileRpcResult>;
  [rpcName.editFile]: RpcSchemaEntry<EditFileRpcInput, EditFileRpcResult>;
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
  [rpcName.captureObservations]: {
    inputSchema: captureObservationsRpc.inputSchema,
    resultSchema: captureObservationsRpc.resultSchema,
  },
  [rpcName.fetchGeometry]: {
    inputSchema: fetchGeometryRpc.inputSchema,
    resultSchema: fetchGeometryRpc.resultSchema,
  },
  [rpcName.exportGeometry]: {
    inputSchema: exportGeometryRpc.inputSchema,
    resultSchema: exportGeometryRpc.resultSchema,
  },
  [rpcName.captureScreenshot]: {
    inputSchema: captureScreenshotRpc.inputSchema,
    resultSchema: captureScreenshotRpc.resultSchema,
  },
  [rpcName.appendFile]: {
    inputSchema: appendFileRpc.inputSchema,
    resultSchema: appendFileRpc.resultSchema,
  },
  [rpcName.editFile]: {
    inputSchema: editFileRpc.inputSchema,
    resultSchema: editFileRpc.resultSchema,
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
  noTopLevelGeometry: 'NO_TOP_LEVEL_GEOMETRY',
  permissionDenied: 'PERMISSION_DENIED',
  ioError: 'IO_ERROR',
  parseError: 'PARSE_ERROR',
  renderTimeout: 'RENDER_TIMEOUT',
  resultTooLarge: 'RESULT_TOO_LARGE',
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
export type CaptureObservationsRpcInput = z.infer<typeof captureObservationsRpc.inputSchema>;
/** @public */
export type CaptureObservationsRpcSuccess = z.infer<typeof captureObservationsRpc.successSchema>;
/** @public */
export type CaptureObservationsRpcResult = z.infer<typeof captureObservationsRpc.resultSchema>;

/** @public */
export type ExportGeometryRpcInput = z.infer<typeof exportGeometryRpc.inputSchema>;
/** @public */
export type ExportGeometryRpcSuccess = z.infer<typeof exportGeometryRpc.successSchema>;
/** @public */
export type ExportGeometryRpcResult = z.infer<typeof exportGeometryRpc.resultSchema>;

/** @public */
export type FetchGeometryRpcInput = z.infer<typeof fetchGeometryRpc.inputSchema>;
/** @public */
export type FetchGeometryRpcSuccess = z.infer<typeof fetchGeometryRpc.successSchema>;
/** @public */
export type FetchGeometryRpcResult = z.infer<typeof fetchGeometryRpc.resultSchema>;

/** @public */
export type CaptureScreenshotRpcInput = z.infer<typeof captureScreenshotRpc.inputSchema>;
/** @public */
export type CaptureScreenshotRpcSuccess = z.infer<typeof captureScreenshotRpc.successSchema>;
/** @public */
export type CaptureScreenshotRpcResult = z.infer<typeof captureScreenshotRpc.resultSchema>;

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
