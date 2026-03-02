import type { Logger } from '@nestjs/common';
import { createMiddleware } from 'langchain';
import { ToolMessage } from '@langchain/core/messages';
import { z } from 'zod';
import type { ToolInputValidationError, ToolGenericExecutionError } from '@taucad/chat';
import { ToolError } from '@taucad/chat/utils';

/**
 * Context schema for tool error handler middleware.
 * Requires a logger instance for error logging.
 */
const toolErrorContextSchema = z.object({
  logger: z.custom<Logger>(),
});

/**
 * Parse validation error details from a LangChain schema validation error message.
 * Extracts structured validation errors from messages like:
 * "✖ Invalid input: expected string, received number → at targetFile"
 */
function parseValidationErrors(message: string): Array<{ path: string; message: string }> {
  const validationErrors: Array<{ path: string; message: string }> = [];

  // Split by newlines and process each line
  const lines = message.split('\n');
  for (const line of lines) {
    // Match lines like "✖ Invalid input: expected string, received number"
    // followed by "  → at targetFile"
    const errorMatch = /[✖✗]\s*(.+?)(?:\s*→\s*at\s+(.+))?$/.exec(line);
    if (errorMatch) {
      const [, errorMessage, path] = errorMatch;
      if (errorMessage) {
        validationErrors.push({
          path: path?.trim() ?? 'root',
          message: errorMessage.trim(),
        });
      }
    }

    // Also match standalone path lines like "  → at targetFile"
    const pathOnlyMatch = /^\s*→\s*at\s+(.+)$/.exec(line);
    const pathValue = pathOnlyMatch?.[1];
    if (pathValue && validationErrors.length > 0) {
      // Update the last error with the path
      const lastError = validationErrors.at(-1);
      if (lastError?.path === 'root') {
        lastError.path = pathValue.trim();
      }
    }
  }

  return validationErrors;
}

/**
 * Parse a LangChain tool error message into a structured error object.
 * Detects schema validation errors and extracts meaningful information.
 */
function parseToolError(
  error: Error,
  toolName: string,
  toolCallId: string,
): ToolInputValidationError | ToolGenericExecutionError {
  const { message } = error;

  // Check for schema validation errors (from Zod via LangChain)
  if (message.includes('did not match expected schema') || message.includes('Invalid input')) {
    const validationErrors = parseValidationErrors(message);

    return {
      errorCode: 'TOOL_INPUT_VALIDATION_FAILED',
      message: 'Tool received invalid input. Please check the arguments and try again.',
      toolName,
      toolCallId,
      validationErrors:
        validationErrors.length > 0 ? validationErrors : [{ path: 'root', message: 'Schema validation failed' }],
      rawOutput: undefined,
    };
  }

  // Generic tool execution error
  return {
    errorCode: 'TOOL_EXECUTION_ERROR',
    message: message || 'An unexpected error occurred during tool execution.',
    toolName,
    toolCallId,
  };
}

/**
 * Middleware that catches tool execution errors and converts them to
 * structured JSON responses that the frontend can properly display.
 *
 * This middleware intercepts errors thrown during tool execution (including
 * Zod schema validation errors from LangChain) and converts them into
 * structured error objects with:
 * - errorCode: A machine-readable error type
 * - message: A human-readable error description
 * - toolName: The name of the tool that failed
 * - toolCallId: The ID of the tool call for tracking
 * - validationErrors: (for validation errors) Array of field-level errors
 *
 * The structured errors are returned as JSON in the ToolMessage content,
 * allowing the frontend to properly detect and display them using
 * isToolExecutionError() type guard.
 */
export const toolErrorHandlerMiddleware = createMiddleware({
  name: 'ToolErrorHandler',
  contextSchema: toolErrorContextSchema,

  async wrapToolCall(request, handler) {
    const { logger } = request.runtime.context;

    try {
      return await handler(request);
    } catch (error) {
      const toolName = request.toolCall.name;
      const toolCallId = request.toolCall.id ?? 'unknown';

      // Check for structured ToolError first (from assertRpcSuccess/assertRpcExecution)
      if (error instanceof ToolError) {
        const { errorCode, message } = error.data;
        logger.warn(`Tool error [${toolCallId}] ${toolName}: ${errorCode} - ${message}`, error.stack);

        return new ToolMessage({
          content: JSON.stringify(error.data),
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: toolCallId,
          name: toolName,
          status: 'error',
        });
      }

      // Parse unstructured errors into a structured format
      const structuredError = parseToolError(
        error instanceof Error ? error : new Error(String(error)),
        toolName,
        toolCallId,
      );

      // Log unstructured errors with full stack trace for debugging
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      logger.error(
        `Unhandled tool error [${toolCallId}] ${toolName}: ${structuredError.errorCode} - ${errorMessage}`,
        errorStack,
      );

      // Return a ToolMessage with JSON content
      // The frontend will parse this and detect it via isToolExecutionError()
      return new ToolMessage({
        content: JSON.stringify(structuredError),
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: toolCallId,
        name: toolName,
        status: 'error',
      });
    }
  },
});
