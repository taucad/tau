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

// =============================================================================
// RPC Error Types
// =============================================================================

/**
 * Error codes for business-level RPC failures.
 * These are distinct from infrastructure errors (timeout, disconnect) which
 * are handled by ToolExecutionError.
 */
export const rpcClientErrorCodeSchema = zod.enum([
  'FILE_NOT_FOUND',
  'PERMISSION_DENIED',
  'IO_ERROR',
  'PARSE_ERROR',
  'UNKNOWN',
]);

/**
 * Base error schema for all RPC failures.
 * Used as the error variant in discriminated unions.
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
 * @example
 * ```typescript
 * const readFileRpc = defineRpc({
 *   input: zod.object({ targetFile: zod.string() }),
 *   success: zod.object({ content: zod.string(), totalLines: zod.number() }),
 * });
 *
 * // Use: readFileRpc.inputSchema, readFileRpc.successSchema, readFileRpc.resultSchema
 * // Types: z.infer<typeof readFileRpc.inputSchema>, etc.
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
    offset: zod.number().optional(),
    limit: zod.number().optional(),
  }),
  success: zod.object({
    content: zod.string(),
    totalLines: zod.number(),
    startLine: zod.number().optional(),
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
  }),
  success: zod.object({
    matches: zod.array(grepMatchSchema),
    totalMatches: zod.number(),
    truncated: zod.boolean().optional(),
  }),
});

const globSearchRpc = defineRpc({
  input: zod.object({
    pattern: zod.string(),
    path: zod.string().optional(),
  }),
  success: zod.object({
    files: zod.array(zod.string()),
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
  input: zod.object({}),
  success: zod.object({
    observations: zod.array(observationSchema),
  }),
});

const fetchGeometryRpc = defineRpc({
  input: zod.object({
    artifactId: zod.string().optional(),
  }),
  success: zod.object({
    glb: zod.instanceof(Uint8Array),
    artifactPath: zod.string().optional(),
  }),
});

const captureScreenshotRpc = defineRpc({
  input: zod.object({}),
  success: zod.object({
    images: zod.array(
      zod.object({
        view: zod.string(),
        dataUrl: zod.string(),
      }),
    ),
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
  [rpcName.captureScreenshot]: RpcSchemaEntry<CaptureScreenshotRpcInput, CaptureScreenshotRpcResult>;
};

/**
 * Runtime registry mapping RPC names to their Zod schemas.
 * Used by ChatRpcService for validating WebSocket RPC inputs/results.
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
  [rpcName.captureScreenshot]: {
    inputSchema: captureScreenshotRpc.inputSchema,
    resultSchema: captureScreenshotRpc.resultSchema,
  },
};

// =============================================================================
// Helper Types
// =============================================================================

/**
 * Extract input type for a given RPC name.
 */
export type RpcInput<T extends keyof RpcSchemasRegistry> = z.infer<RpcSchemasRegistry[T]['inputSchema']>;

/**
 * Extract result type for a given RPC name.
 */
export type RpcResult<T extends keyof RpcSchemasRegistry> = z.infer<RpcSchemasRegistry[T]['resultSchema']>;

/**
 * Discriminated union of all RPC calls.
 * Each variant links the RPC name to its corresponding input type,
 * enabling TypeScript to narrow the `args` type when switching on `rpcName`.
 *
 * @example
 * ```typescript
 * function handleRpc(call: RpcCall): Promise<unknown> {
 *   switch (call.rpcName) {
 *     case 'read_file':
 *       // call.args is automatically narrowed to ReadFileRpcInput
 *       return handleReadFile(call.args);
 *     // ...
 *   }
 * }
 * ```
 */
export type RpcCall = {
  [K in keyof RpcSchemasRegistry]: {
    rpcName: K;
    args: RpcInput<K>;
  };
}[keyof RpcSchemasRegistry];

// =============================================================================
// Inferred Types
// =============================================================================

export type RpcClientErrorCode = z.infer<typeof rpcClientErrorCodeSchema>;
export type RpcClientError = z.infer<typeof rpcClientErrorSchema>;

export type ReadFileRpcInput = z.infer<typeof readFileRpc.inputSchema>;
export type ReadFileRpcSuccess = z.infer<typeof readFileRpc.successSchema>;
export type ReadFileRpcResult = z.infer<typeof readFileRpc.resultSchema>;

export type CreateFileRpcInput = z.infer<typeof createFileRpc.inputSchema>;
export type CreateFileRpcSuccess = z.infer<typeof createFileRpc.successSchema>;
export type CreateFileRpcResult = z.infer<typeof createFileRpc.resultSchema>;

export type DeleteFileRpcInput = z.infer<typeof deleteFileRpc.inputSchema>;
export type DeleteFileRpcSuccess = z.infer<typeof deleteFileRpc.successSchema>;
export type DeleteFileRpcResult = z.infer<typeof deleteFileRpc.resultSchema>;

export type ListDirectoryRpcInput = z.infer<typeof listDirectoryRpc.inputSchema>;
export type ListDirectoryRpcSuccess = z.infer<typeof listDirectoryRpc.successSchema>;
export type ListDirectoryRpcResult = z.infer<typeof listDirectoryRpc.resultSchema>;

export type GrepRpcInput = z.infer<typeof grepRpc.inputSchema>;
export type GrepRpcSuccess = z.infer<typeof grepRpc.successSchema>;
export type GrepRpcResult = z.infer<typeof grepRpc.resultSchema>;

export type GlobSearchRpcInput = z.infer<typeof globSearchRpc.inputSchema>;
export type GlobSearchRpcSuccess = z.infer<typeof globSearchRpc.successSchema>;
export type GlobSearchRpcResult = z.infer<typeof globSearchRpc.resultSchema>;

export type GetKernelResultRpcInput = z.infer<typeof getKernelResultRpc.inputSchema>;
export type GetKernelResultRpcSuccess = z.infer<typeof getKernelResultRpc.successSchema>;
export type GetKernelResultRpcResult = z.infer<typeof getKernelResultRpc.resultSchema>;

export type CaptureObservationsRpcInput = z.infer<typeof captureObservationsRpc.inputSchema>;
export type CaptureObservationsRpcSuccess = z.infer<typeof captureObservationsRpc.successSchema>;
export type CaptureObservationsRpcResult = z.infer<typeof captureObservationsRpc.resultSchema>;

export type FetchGeometryRpcInput = z.infer<typeof fetchGeometryRpc.inputSchema>;
export type FetchGeometryRpcSuccess = z.infer<typeof fetchGeometryRpc.successSchema>;
export type FetchGeometryRpcResult = z.infer<typeof fetchGeometryRpc.resultSchema>;

export type CaptureScreenshotRpcInput = z.infer<typeof captureScreenshotRpc.inputSchema>;
export type CaptureScreenshotRpcSuccess = z.infer<typeof captureScreenshotRpc.successSchema>;
export type CaptureScreenshotRpcResult = z.infer<typeof captureScreenshotRpc.resultSchema>;
