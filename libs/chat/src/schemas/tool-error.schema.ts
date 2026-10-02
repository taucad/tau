import { z } from 'zod';

/** All possible tool execution error codes. @public */
export const toolErrorCodes = [
  'TOOL_EXECUTION_TIMEOUT',
  'CLIENT_DISCONNECTED',
  'NO_CLIENT_CONNECTION',
  'TOOL_INPUT_VALIDATION_FAILED',
  'TOOL_OUTPUT_VALIDATION_FAILED',
  'TOOL_EXECUTION_ERROR',
  'USER_INTERRUPTED',
  'STREAM_ERROR',
  'ORPHANED_TOOL_CALL',
  'TOOL_NO_RESULTS',
] as const;

/** Runtime schema for tool execution error codes. @public */
export const toolErrorCodeSchema = z.enum(toolErrorCodes);

const toolErrorBase = z.object({
  message: z.string(),
  toolName: z.string(),
  toolCallId: z.string(),
});

const validationErrorBase = toolErrorBase.extend({
  validationErrors: z.array(z.object({ path: z.string(), message: z.string() })),
  // JSON omits undefined diagnostic output; validation details remain required.
  rawOutput: z.unknown().optional(),
});

/** Complete contract checked before exposing tool-error fields to consumers. @internal */
export const toolExecutionErrorSchema = z.discriminatedUnion('errorCode', [
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.TOOL_EXECUTION_TIMEOUT) }),
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.CLIENT_DISCONNECTED) }),
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.NO_CLIENT_CONNECTION) }),
  validationErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.TOOL_INPUT_VALIDATION_FAILED) }),
  validationErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.TOOL_OUTPUT_VALIDATION_FAILED) }),
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.TOOL_EXECUTION_ERROR) }),
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.USER_INTERRUPTED) }),
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.STREAM_ERROR) }),
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.ORPHANED_TOOL_CALL) }),
  toolErrorBase.extend({ errorCode: z.literal(toolErrorCodeSchema.enum.TOOL_NO_RESULTS) }),
]);
