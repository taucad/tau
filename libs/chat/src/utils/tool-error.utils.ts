import type { ToolExecutionError } from '#types/tool.types.js';
import type { RpcExecutionError, RpcValidationError } from '#types/rpc.types.js';
import type { RpcClientError } from '#schemas/rpc.schema.js';
import { isRpcExecutionError, isRpcClientError } from '#types/rpc.types.js';

/**
 * All possible tool execution error codes.
 */
export const toolErrorCodes = [
  'TOOL_EXECUTION_TIMEOUT',
  'CLIENT_DISCONNECTED',
  'NO_CLIENT_CONNECTION',
  'TOOL_INPUT_VALIDATION_FAILED',
  'TOOL_OUTPUT_VALIDATION_FAILED',
  'TOOL_EXECUTION_ERROR',
  'USER_INTERRUPTED',
  'TOOL_NO_RESULTS',
] as const;

export type ToolErrorCode = (typeof toolErrorCodes)[number];

/**
 * Type guard to check if a value is a ToolExecutionError.
 * Use in tool component output-available case before accessing typed properties.
 */
export function isToolExecutionError(value: unknown): value is ToolExecutionError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'errorCode' in value &&
    typeof (value as { errorCode: unknown }).errorCode === 'string' &&
    toolErrorCodes.includes((value as { errorCode: string }).errorCode as ToolErrorCode)
  );
}

/**
 * Convert an RPC execution error to a tool execution error.
 * Use this in tool implementations to convert RPC-layer errors to tool-layer errors
 * that can be returned to the LLM.
 *
 * @param rpcError - The RPC execution error or validation error from ChatRpcService
 * @param toolName - The name of the tool (for error attribution)
 * @param toolCallId - The tool call ID (for tracking)
 * @returns A ToolExecutionError that can be returned to the LLM
 *
 * @example
 * ```typescript
 * const result = await chatRpcService.sendRpcRequest(chatId, toolCallId, rpcName, args);
 *
 * if (isRpcExecutionError(result)) {
 *   return rpcErrorToToolError(result, toolName.readFile, toolCallId);
 * }
 * ```
 */
export function rpcErrorToToolError(
  rpcError: RpcExecutionError | RpcValidationError,
  toolName: string,
  toolCallId: string,
): ToolExecutionError {
  // Map RPC error codes to tool error codes
  switch (rpcError.errorCode) {
    case 'TIMEOUT': {
      return {
        errorCode: 'TOOL_EXECUTION_TIMEOUT',
        message: rpcError.message,
        toolName,
        toolCallId,
      };
    }

    case 'CLIENT_DISCONNECTED': {
      return {
        errorCode: 'CLIENT_DISCONNECTED',
        message: rpcError.message,
        toolName,
        toolCallId,
      };
    }

    case 'NO_CONNECTION': {
      return {
        errorCode: 'NO_CLIENT_CONNECTION',
        message: 'Unable to connect to the client.',
        toolName,
        toolCallId,
      };
    }

    case 'INPUT_VALIDATION_FAILED': {
      const validationError = rpcError as RpcValidationError;
      return {
        errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
        message: validationError.message,
        toolName,
        toolCallId,
        validationErrors: validationError.validationErrors,
        rawOutput: validationError.rawOutput,
      };
    }

    case 'OUTPUT_VALIDATION_FAILED': {
      const validationError = rpcError as RpcValidationError;
      return {
        errorCode: 'TOOL_OUTPUT_VALIDATION_FAILED',
        message: validationError.message,
        toolName,
        toolCallId,
        validationErrors: validationError.validationErrors,
        rawOutput: validationError.rawOutput,
      };
    }

    case 'UNHANDLED_CLIENT_ERROR': {
      return {
        errorCode: 'TOOL_EXECUTION_ERROR',
        message: rpcError.message,
        toolName,
        toolCallId,
      };
    }
  }
}

/**
 * Get a user-friendly error title for each error code.
 */
export function getToolErrorTitle(errorCode: ToolErrorCode): string {
  switch (errorCode) {
    case 'TOOL_EXECUTION_TIMEOUT': {
      return 'Tool Timed Out';
    }

    case 'CLIENT_DISCONNECTED': {
      return 'Connection Lost';
    }

    case 'NO_CLIENT_CONNECTION': {
      return 'No Connection';
    }

    case 'TOOL_INPUT_VALIDATION_FAILED': {
      return 'Invalid Input';
    }

    case 'TOOL_OUTPUT_VALIDATION_FAILED': {
      return 'Validation Failed';
    }

    case 'TOOL_EXECUTION_ERROR': {
      return 'Tool Error';
    }

    case 'USER_INTERRUPTED': {
      return 'Interrupted';
    }

    case 'TOOL_NO_RESULTS': {
      return 'No Results';
    }
  }
}

/**
 * Get a user-friendly description for each error code.
 */
export function getToolErrorDescription(errorCode: ToolErrorCode): string {
  switch (errorCode) {
    case 'TOOL_EXECUTION_TIMEOUT': {
      return 'The tool took too long to execute and was terminated.';
    }

    case 'CLIENT_DISCONNECTED': {
      return 'The connection was lost while the tool was running.';
    }

    case 'NO_CLIENT_CONNECTION': {
      return 'No browser tab is connected. Please refresh the page.';
    }

    case 'TOOL_INPUT_VALIDATION_FAILED': {
      return 'The tool received invalid input arguments.';
    }

    case 'TOOL_OUTPUT_VALIDATION_FAILED': {
      return 'The tool returned data in an unexpected format.';
    }

    case 'TOOL_EXECUTION_ERROR': {
      return 'An error occurred while executing the tool.';
    }

    case 'USER_INTERRUPTED': {
      return 'Tool execution was interrupted by user.';
    }

    case 'TOOL_NO_RESULTS': {
      return 'The tool completed but found no content to return.';
    }
  }
}

/**
 * Parse the errorText from output-error state into a ToolExecutionError.
 * Used to extract structured error information from the JSON-stringified
 * error text returned by the tool error handler middleware.
 *
 * @param errorText - The error text from the tool invocation's output-error state
 * @returns The parsed ToolExecutionError if valid, undefined otherwise
 */
export function parseToolErrorText(errorText: string): ToolExecutionError | undefined {
  try {
    const parsed: unknown = JSON.parse(errorText);
    if (isToolExecutionError(parsed)) {
      return parsed;
    }
  } catch {
    // Not valid JSON, return undefined
  }

  return undefined;
}

// =============================================================================
// ToolError Class
// =============================================================================

/**
 * Error class for tool execution failures.
 * Carries structured error data that middleware can extract.
 *
 * @example
 * ```typescript
 * throw new ToolError({
 *   errorCode: 'TOOL_EXECUTION_ERROR',
 *   message: 'Cannot read file',
 *   toolName: 'read_file',
 *   toolCallId: 'call_123',
 * });
 * ```
 */
export class ToolError extends Error {
  public readonly data: ToolExecutionError;

  public constructor(data: ToolExecutionError) {
    super(data.message);
    this.name = 'ToolError';
    this.data = data;
  }
}

// =============================================================================
// RPC Assertion Functions
// =============================================================================

/**
 * Assert RPC execution succeeded (no infrastructure errors).
 * Throws ToolError for timeout, disconnect, validation failures.
 * Allows RpcClientError to pass through for custom handling.
 *
 * Use this when you need to handle client errors specially (e.g., FILE_NOT_FOUND
 * should use default content instead of failing).
 *
 * @param result - The RPC result to check
 * @param toolName - The name of the tool (for error attribution)
 * @param toolCallId - The tool call ID (for tracking)
 * @throws ToolError if result is an RpcExecutionError or RpcValidationError
 *
 * @example
 * ```typescript
 * const result = await chatRpcService.sendRpcRequest(...);
 *
 * assertRpcExecution(result, toolName.editTests, toolCallId);
 *
 * // Now result is narrowed to RpcClientError | SuccessType
 * if (isRpcClientError(result)) {
 *   if (result.errorCode === 'FILE_NOT_FOUND') {
 *     // Handle gracefully - use default content
 *   } else {
 *     throw new ToolError({...});
 *   }
 * }
 *
 * // Use result.content
 * ```
 */
export function assertRpcExecution<T>(
  result: T | RpcExecutionError | RpcValidationError,
  toolName: string,
  toolCallId: string,
): asserts result is Exclude<T, RpcExecutionError | RpcValidationError> {
  if (isRpcExecutionError(result)) {
    throw new ToolError(rpcErrorToToolError(result, toolName, toolCallId));
  }
}

/**
 * Resolver for client error messages.
 * Can be a static string or a function that receives the error for dynamic messages.
 */
export type ClientErrorMessageResolver = string | ((error: RpcClientError) => string);

/**
 * Assert RPC fully succeeded (no infrastructure OR client errors).
 * Throws ToolError for any non-success result.
 *
 * Use this for the common case where any error should fail the tool.
 *
 * @param result - The RPC result to check
 * @param options - Context for error attribution
 * @param options.toolName - The name of the tool (for error attribution)
 * @param options.toolCallId - The tool call ID (for tracking)
 * @param options.clientErrorMessage - Optional custom message for client errors.
 *   Can be a string or a function that receives the RpcClientError for dynamic messages.
 * @throws ToolError if result is any kind of error
 *
 * @example
 * ```typescript
 * // Static message
 * assertRpcSuccess(result, { toolName: toolName.readFile, toolCallId, clientErrorMessage: 'Cannot read file' });
 *
 * // Dynamic message based on error code
 * assertRpcSuccess(result, {
 *   toolName: toolName.readFile,
 *   toolCallId,
 *   clientErrorMessage: (error) => {
 *     if (error.errorCode === 'FILE_NOT_FOUND') {
 *       return 'File not found';
 *     }
 *     return 'Cannot read file';
 *   },
 * });
 * ```
 */
export function assertRpcSuccess<T extends { success: boolean }>(
  result: T | RpcExecutionError | RpcValidationError,
  options: { toolName: string; toolCallId: string; clientErrorMessage?: ClientErrorMessageResolver },
): asserts result is Exclude<T, RpcExecutionError | RpcValidationError | RpcClientError> {
  const { toolName, toolCallId, clientErrorMessage } = options;
  assertRpcExecution(result, toolName, toolCallId);

  if (isRpcClientError(result)) {
    // Resolve message: call function if provided, otherwise use string or fallback to result.message
    const message =
      typeof clientErrorMessage === 'function' ? clientErrorMessage(result) : (clientErrorMessage ?? result.message);

    throw new ToolError({
      errorCode: 'TOOL_EXECUTION_ERROR',
      message,
      toolName,
      toolCallId,
    });
  }
}
