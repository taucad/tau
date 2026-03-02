import type { DynamicStructuredTool } from '@langchain/core/tools';
import type { InferUITools, Tool as AiTool, UIToolInvocation } from 'ai';
import type { toolName, toolMode } from '#constants/tool.constants.js';
import type { EditFileInput, EditFileOutput } from '#schemas/tools/edit-file.tool.schema.js';
import type {
  TestModelInput,
  TestModelOutput,
  EditTestsInput,
  EditTestsOutput,
} from '#schemas/tools/test-model.tool.schema.js';
import type { WebBrowserInput, WebBrowserOutput } from '#schemas/tools/web-browser.tool.schema.js';
import type { WebSearchInput, WebSearchOutput } from '#schemas/tools/web-search.tool.schema.js';
import type { ReadFileInput, ReadFileOutput } from '#schemas/tools/read-file.tool.schema.js';
import type { ListDirectoryInput, ListDirectoryOutput } from '#schemas/tools/list-directory.tool.schema.js';
import type { CreateFileInput, CreateFileOutput } from '#schemas/tools/create-file.tool.schema.js';
import type { DeleteFileInput, DeleteFileOutput } from '#schemas/tools/delete-file.tool.schema.js';
import type { GrepInput, GrepOutput } from '#schemas/tools/grep.tool.schema.js';
import type { GlobSearchInput, GlobSearchOutput } from '#schemas/tools/glob-search.tool.schema.js';
import type { GetKernelResultInput, GetKernelResultOutput } from '#schemas/tools/get-kernel-result.tool.schema.js';
import type { ScreenshotInput, ScreenshotOutput } from '#schemas/tools/screenshot.tool.schema.js';
import type {
  TransferToCadExpertInput,
  TransferToCadExpertOutput,
} from '#schemas/tools/transfer-to-cad-expert.tool.schema.js';
import type {
  TransferToResearchExpertInput,
  TransferToResearchExpertOutput,
} from '#schemas/tools/transfer-to-research-expert.tool.schema.js';
import type {
  TransferBackToSupervisorInput,
  TransferBackToSupervisorOutput,
} from '#schemas/tools/transfer-back-to-supervisor.tool.schema.js';

// =============================================================================
// Tool Error Types
// =============================================================================

/**
 * Structured error returned to LLM when tool execution times out.
 */
export type ToolTimeoutError = {
  errorCode: 'TOOL_EXECUTION_TIMEOUT';
  message: string;
  toolName: string;
  toolCallId: string;
};

/**
 * Structured error returned to LLM when client disconnects during tool execution.
 */
export type ToolDisconnectedError = {
  errorCode: 'CLIENT_DISCONNECTED';
  message: string;
  toolName: string;
  toolCallId: string;
};

/**
 * Structured error returned to LLM when no client is connected.
 */
export type ToolNoConnectionError = {
  errorCode: 'NO_CLIENT_CONNECTION';
  message: string;
  toolName: string;
  toolCallId: string;
};

/**
 * Structured validation error returned to LLM when tool input validation fails.
 * The LLM can use this information to understand what went wrong and potentially retry.
 */
export type ToolInputValidationError = {
  errorCode: 'TOOL_INPUT_VALIDATION_FAILED';
  message: string;
  toolName: string;
  toolCallId: string;
  validationErrors: Array<{ path: string; message: string }>;
  rawOutput: unknown;
};

/**
 * Structured validation error returned to LLM when tool output validation fails.
 * The LLM can use this information to understand what went wrong and potentially retry.
 */
export type ToolOutputValidationError = {
  errorCode: 'TOOL_OUTPUT_VALIDATION_FAILED';
  message: string;
  toolName: string;
  toolCallId: string;
  validationErrors: Array<{ path: string; message: string }>;
  rawOutput: unknown;
};

/**
 * Combined validation error type for both input and output validation failures.
 */
export type ToolValidationError = ToolInputValidationError | ToolOutputValidationError;

/**
 * Generic tool execution error for unexpected failures.
 * Used when a tool throws an error that doesn't fit other categories.
 */
export type ToolGenericExecutionError = {
  errorCode: 'TOOL_EXECUTION_ERROR';
  message: string;
  toolName: string;
  toolCallId: string;
};

/**
 * Structured error for when the user interrupts a tool mid-execution.
 * Used on both client (finalizeInterruptedToolParts) and server (orphaned tool call sanitizer).
 */
export type ToolUserInterruptedError = {
  errorCode: 'USER_INTERRUPTED';
  message: string;
  toolName: string;
  toolCallId: string;
};

/**
 * Structured error for when a tool completes successfully but returns no results.
 * Common with web extraction (blocked pages, JS-rendered content, auth-gated sites).
 * Treated as a recoverable, expected case rather than a failure.
 */
export type ToolNoResultsError = {
  errorCode: 'TOOL_NO_RESULTS';
  message: string;
  toolName: string;
  toolCallId: string;
};

/**
 * All possible structured tool errors including validation errors.
 * These are returned to the LLM so it can reason about errors.
 */
export type ToolExecutionError =
  | ToolTimeoutError
  | ToolDisconnectedError
  | ToolNoConnectionError
  | ToolValidationError
  | ToolGenericExecutionError
  | ToolUserInterruptedError
  | ToolNoResultsError;

// =============================================================================
// Tool Name Types
// =============================================================================

export type ToolName = (typeof toolName)[keyof typeof toolName];

/**
 * The tool mode. One of:
 * - none: No tools are allowed
 * - auto: Let AI decide which tools to use
 * - any: Require tool use (all available)
 * - custom: Make these tools available
 */
export type ToolMode = (typeof toolMode)[keyof typeof toolMode];

/**
 * The tool selection is either a tool mode or an array of tool names.
 */
export type ToolSelection = ToolMode | ToolName[];

export type MyTools = InferUITools<{
  [toolName.editFile]: AiTool<EditFileInput, EditFileOutput>;
  [toolName.testModel]: AiTool<TestModelInput, TestModelOutput>;
  [toolName.editTests]: AiTool<EditTestsInput, EditTestsOutput>;
  [toolName.webBrowser]: AiTool<WebBrowserInput, WebBrowserOutput>;
  [toolName.webSearch]: AiTool<WebSearchInput, WebSearchOutput>;
  [toolName.readFile]: AiTool<ReadFileInput, ReadFileOutput>;
  [toolName.listDirectory]: AiTool<ListDirectoryInput, ListDirectoryOutput>;
  [toolName.createFile]: AiTool<CreateFileInput, CreateFileOutput>;
  [toolName.deleteFile]: AiTool<DeleteFileInput, DeleteFileOutput>;
  [toolName.grep]: AiTool<GrepInput, GrepOutput>;
  [toolName.globSearch]: AiTool<GlobSearchInput, GlobSearchOutput>;
  [toolName.getKernelResult]: AiTool<GetKernelResultInput, GetKernelResultOutput>;
  [toolName.screenshot]: AiTool<ScreenshotInput, ScreenshotOutput>;
  [toolName.transferToCadExpert]: AiTool<TransferToCadExpertInput, TransferToCadExpertOutput>;
  [toolName.transferToResearchExpert]: AiTool<TransferToResearchExpertInput, TransferToResearchExpertOutput>;
  [toolName.transferBackToSupervisor]: AiTool<TransferBackToSupervisorInput, TransferBackToSupervisorOutput>;
}>;

/**
 * Type-safe tool invocation for a specific tool.
 * Wraps UIToolInvocation with the correct input/output types from MyTools.
 *
 * Usage: ToolInvocation<typeof toolName.readFile>
 */
export type ToolInvocation<T extends keyof MyTools> = UIToolInvocation<MyTools[T]>;

/**
 * A LangChain DynamicStructuredTool that can return either the success output
 * or a ToolExecutionError. This is used for all chat tools that communicate
 * with the client via WebSocket, where errors can occur during execution.
 *
 * @template SchemaT - The Zod schema type for the tool input
 * @template SchemaOutputT - The parsed output type from the schema (usually z.infer<SchemaT>)
 * @template SchemaInputT - The input type to the schema (usually same as SchemaOutputT)
 * @template SuccessOutputT - The success output type of the tool
 * @template NameT - The literal string type of the tool name
 *
 * @example
 * ```ts
 * export const myTool: ChatTool<
 *   typeof myInputSchema,
 *   MyInput,
 *   MyOutput,
 *   typeof toolName.myTool
 * > = tool(async (args, runtime) => {
 *   // ...
 * }, myToolDefinition);
 * ```
 */
export type ChatTool<
  SchemaT,
  SchemaOutputT,
  SuccessOutputT,
  NameT extends string,
  SchemaInputT = SchemaOutputT,
> = DynamicStructuredTool<SchemaT, SchemaOutputT, SchemaInputT, SuccessOutputT | ToolExecutionError, NameT>;
