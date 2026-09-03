import type { RpcClientError } from '#schemas/rpc.schema.js';
import { z } from 'zod';
import type { rpcExecutionErrorCode, rpcName } from '#constants/rpc.constants.js';
import { rpcExecutionErrorCodes } from '#constants/rpc.constants.js';

// =============================================================================
// RPC Name Types
// =============================================================================

/**
 * RPC operation names.
 * These are the names of remote procedure calls that the server can invoke on the client.
 * @public
 */
export type RpcName = (typeof rpcName)[keyof typeof rpcName];

// =============================================================================
// RPC Execution Error Types
// =============================================================================

/**
 * Error codes for RPC infrastructure failures.
 * These are distinct from client errors (RpcClientError with success: false).
 * Derived from rpcExecutionErrorCode constants.
 * @public
 */
export type RpcExecutionErrorCode = (typeof rpcExecutionErrorCode)[keyof typeof rpcExecutionErrorCode];

/** Runtime schema for RPC infrastructure error codes. @public */
export const rpcExecutionErrorCodeSchema = z.enum(rpcExecutionErrorCodes);

const rpcExecutionErrorSchema = z.looseObject({
  errorCode: rpcExecutionErrorCodeSchema,
});

/**
 * Base RPC execution error for infrastructure failures.
 * Returned by ChatRpcService when RPC execution fails due to
 * connection issues, timeouts, or validation errors.
 * @public
 */
export type RpcExecutionError = {
  errorCode: RpcExecutionErrorCode;
  message: string;
  rpcName: string;
};

/**
 * RPC validation error with detailed validation information.
 * Returned when input or output validation fails.
 * @public
 */
export type RpcValidationError = {
  errorCode: typeof rpcExecutionErrorCode.inputValidationFailed | typeof rpcExecutionErrorCode.outputValidationFailed;
  message: string;
  rpcName: string;
  validationErrors: Array<{ path: string; message: string }>;
  rawOutput?: unknown;
};

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard for RPC execution errors (infrastructure failures).
 * Use this to check if an RPC result is an infrastructure error
 * before checking for client errors (isRpcClientError).
 *
 * @public
 *
 * @example <caption>Narrowing infrastructure errors</caption>
 * ```typescript
 * import { isRpcExecutionError } from '@taucad/chat';
 *
 * const result: unknown = { errorCode: 'TIMEOUT', message: 'Timed out', rpcName: 'read_file' };
 *
 * if (isRpcExecutionError(result)) {
 *   console.log(result.errorCode); // narrowed to RpcExecutionError
 * }
 * ```
 */
export function isRpcExecutionError(result: unknown): result is RpcExecutionError {
  return rpcExecutionErrorSchema.safeParse(result).success;
}

/**
 * Type guard for RPC client errors (success: false).
 * Use this to discriminate between success and error results
 * after checking for infrastructure errors (isRpcExecutionError).
 *
 * RPC client errors are structured business-level errors returned by the
 * client (e.g., FILE_NOT_FOUND, PERMISSION_DENIED), as opposed to
 * infrastructure errors (timeout, disconnect) which are RpcExecutionErrors.
 *
 * @public
 *
 * @example <caption>Checking client-level errors</caption>
 * ```typescript
 * import { isRpcClientError } from '@taucad/chat';
 *
 * const result = { success: false, errorCode: 'FILE_NOT_FOUND', message: 'Not found' };
 *
 * if (isRpcClientError(result)) {
 *   console.log(result.errorCode); // narrowed to RpcClientError
 * }
 * ```
 */
export function isRpcClientError(result: { success: boolean }): result is RpcClientError {
  return !result.success;
}
