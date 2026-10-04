import type { z } from 'zod';
import type { toolExecutionErrorSchema } from '#schemas/tool-error.schema.js';
import type { ArrangeWorkbenchInput, ArrangeWorkbenchOutput } from '#schemas/tools/arrange-workbench.tool.schema.js';
import type { InferUITools, Tool as AiTool, UIToolInvocation } from 'ai';
import type { toolName, toolMode } from '#constants/tool.constants.js';
import type { EditFileInput, EditFileOutput } from '#schemas/tools/edit-file.tool.schema.js';
import type { TestModelInput, TestModelOutput } from '#schemas/tools/test-model.tool.schema.js';
import type { WebBrowserInput, WebBrowserOutput } from '#schemas/tools/web-browser.tool.schema.js';
import type { WebSearchInput, WebSearchOutput } from '#schemas/tools/web-search.tool.schema.js';
import type { ReadFileInput, ReadFileOutput } from '#schemas/tools/read-file.tool.schema.js';
import type { UseSkillInput, UseSkillOutput } from '#schemas/tools/use-skill.tool.schema.js';
import type { ListDirectoryInput, ListDirectoryOutput } from '#schemas/tools/list-directory.tool.schema.js';
import type { CreateFileInput, CreateFileOutput } from '#schemas/tools/create-file.tool.schema.js';
import type { DeleteFileInput, DeleteFileOutput } from '#schemas/tools/delete-file.tool.schema.js';
import type { GrepInput, GrepOutput } from '#schemas/tools/grep.tool.schema.js';
import type { GlobSearchInput, GlobSearchOutput } from '#schemas/tools/glob-search.tool.schema.js';
import type { EvaluateModelInput, EvaluateModelOutput } from '#schemas/tools/evaluate-model.tool.schema.js';
import type { ExportModelInput, ExportModelOutput } from '#schemas/tools/export-model.tool.schema.js';
import type { ScreenshotInput, ScreenshotOutput } from '#schemas/tools/screenshot.tool.schema.js';
import type { RevisionsInput, RevisionsOutput } from '#schemas/tools/revisions.tool.schema.js';
import type { UpdateTodosInput, UpdateTodosOutput } from '#schemas/tools/update-todos.tool.schema.js';
import type { AskQuestionsInput, AskQuestionsOutput } from '#schemas/tools/ask-questions.tool.schema.js';
import type {
  CheckJobInput,
  CheckJobOutput,
  GetMachineInput,
  GetMachineOutput,
  GetPrintProfilesInput,
  GetPrintProfilesOutput,
  ListMachinesInput,
  ListMachinesOutput,
  MachineActionInput,
  MachineActionOutput,
  RequestJobInput,
  RequestJobOutput,
  StopMachineInput,
  StopMachineOutput,
} from '#schemas/tools/machine.tool.schema.js';
import type {
  ApplyParameterOperationInput,
  ApplyParameterOperationOutput,
  GetParametersInput,
  GetParametersOutput,
} from '#schemas/tools/parameter.tool.schema.js';

// =============================================================================
// Tool Error Types
// =============================================================================

/**
 * Structured error returned to LLM when tool execution times out.
 * @public
 */
export type ToolTimeoutError = Extract<ToolExecutionError, { errorCode: 'TOOL_EXECUTION_TIMEOUT' }>;

/**
 * Structured error returned to LLM when client disconnects during tool execution.
 * @public
 */
export type ToolDisconnectedError = Extract<ToolExecutionError, { errorCode: 'CLIENT_DISCONNECTED' }>;

/**
 * Structured error returned to LLM when no client is connected.
 * @public
 */
export type ToolNoConnectionError = Extract<ToolExecutionError, { errorCode: 'NO_CLIENT_CONNECTION' }>;

/**
 * Structured validation error returned to LLM when tool input validation fails.
 * The LLM can use this information to understand what went wrong and potentially retry.
 * @public
 */
export type ToolInputValidationError = Extract<ToolExecutionError, { errorCode: 'TOOL_INPUT_VALIDATION_FAILED' }>;

/**
 * Structured validation error returned to LLM when tool output validation fails.
 * The LLM can use this information to understand what went wrong and potentially retry.
 * @public
 */
export type ToolOutputValidationError = Extract<ToolExecutionError, { errorCode: 'TOOL_OUTPUT_VALIDATION_FAILED' }>;

/**
 * Combined validation error type for both input and output validation failures.
 * @public
 */
export type ToolValidationError = ToolInputValidationError | ToolOutputValidationError;

/**
 * Generic tool execution error for unexpected failures.
 * Used when a tool throws an error that doesn't fit other categories.
 * @public
 */
export type ToolGenericExecutionError = Extract<ToolExecutionError, { errorCode: 'TOOL_EXECUTION_ERROR' }>;

/**
 * Structured error for when the user interrupts a tool mid-execution.
 * Used on both client (finalizeInterruptedToolParts) and server (orphaned tool call sanitizer).
 * @public
 */
export type ToolUserInterruptedError = Extract<ToolExecutionError, { errorCode: 'USER_INTERRUPTED' }>;

/**
 * Chat SSE/stream ended before the tool invocation could complete (non-transport
 * structured API failure). Distinct from {@link ToolDisconnectedError} (transport).
 * @public
 */
export type ToolStreamError = Extract<ToolExecutionError, { errorCode: 'STREAM_ERROR' }>;

/**
 * Structured error for a streamed tool call whose input reached the UI but whose
 * provider turn ended without a matching tool output.
 * @public
 */
export type ToolOrphanedToolCallError = Extract<ToolExecutionError, { errorCode: 'ORPHANED_TOOL_CALL' }>;

/**
 * Structured error for when a tool completes successfully but returns no results.
 * Common with web extraction (blocked pages, JS-rendered content, auth-gated sites).
 * Treated as a recoverable, expected case rather than a failure.
 * @public
 */
export type ToolNoResultsError = Extract<ToolExecutionError, { errorCode: 'TOOL_NO_RESULTS' }>;

/**
 * All possible structured tool errors including validation errors.
 * These are returned to the LLM so it can reason about errors.
 * @public
 */
export type ToolExecutionError = z.infer<typeof toolExecutionErrorSchema>;

// =============================================================================
// Tool Name Types
// =============================================================================

/** @public */
export type ToolName = (typeof toolName)[keyof typeof toolName];

/**
 * The tool mode. One of:
 * - none: No tools are allowed
 * - auto: Let AI decide which tools to use
 * - any: Require tool use (all available)
 * - custom: Make these tools available
 * @public
 */
export type ToolMode = (typeof toolMode)[keyof typeof toolMode];

/**
 * The tool selection is either a tool mode or an array of tool names.
 * @public
 */
export type ToolSelection = ToolMode | ToolName[];

/** @public */
export type MyTools = InferUITools<{
  [toolName.editFile]: AiTool<EditFileInput, EditFileOutput>;
  [toolName.arrangeWorkbench]: AiTool<ArrangeWorkbenchInput, ArrangeWorkbenchOutput>;
  [toolName.testModel]: AiTool<TestModelInput, TestModelOutput>;
  [toolName.webBrowser]: AiTool<WebBrowserInput, WebBrowserOutput>;
  [toolName.webSearch]: AiTool<WebSearchInput, WebSearchOutput>;
  [toolName.useSkill]: AiTool<UseSkillInput, UseSkillOutput>;
  [toolName.readFile]: AiTool<ReadFileInput, ReadFileOutput>;
  [toolName.listDirectory]: AiTool<ListDirectoryInput, ListDirectoryOutput>;
  [toolName.createFile]: AiTool<CreateFileInput, CreateFileOutput>;
  [toolName.deleteFile]: AiTool<DeleteFileInput, DeleteFileOutput>;
  [toolName.grep]: AiTool<GrepInput, GrepOutput>;
  [toolName.globSearch]: AiTool<GlobSearchInput, GlobSearchOutput>;
  [toolName.evaluateModel]: AiTool<EvaluateModelInput, EvaluateModelOutput>;
  [toolName.exportModel]: AiTool<ExportModelInput, ExportModelOutput>;
  [toolName.screenshot]: AiTool<ScreenshotInput, ScreenshotOutput>;
  [toolName.revisions]: AiTool<RevisionsInput, RevisionsOutput>;
  [toolName.getParameters]: AiTool<GetParametersInput, GetParametersOutput>;
  [toolName.applyParameterOperation]: AiTool<ApplyParameterOperationInput, ApplyParameterOperationOutput>;
  [toolName.updateTodos]: AiTool<UpdateTodosInput, UpdateTodosOutput>;
  [toolName.askQuestions]: AiTool<AskQuestionsInput, AskQuestionsOutput>;
  [toolName.listMachines]: AiTool<ListMachinesInput, ListMachinesOutput>;
  [toolName.getMachine]: AiTool<GetMachineInput, GetMachineOutput>;
  [toolName.machineAction]: AiTool<MachineActionInput, MachineActionOutput>;
  [toolName.stopMachine]: AiTool<StopMachineInput, StopMachineOutput>;
  [toolName.getPrintProfiles]: AiTool<GetPrintProfilesInput, GetPrintProfilesOutput>;
  [toolName.requestJob]: AiTool<RequestJobInput, RequestJobOutput>;
  [toolName.checkJob]: AiTool<CheckJobInput, CheckJobOutput>;
}>;

/**
 * Type-safe tool invocation for a specific tool.
 * Wraps UIToolInvocation with the correct input/output types from MyTools.
 *
 * Usage: ToolInvocation<typeof toolName.readFile>
 * @public
 */
export type ToolInvocation<T extends keyof MyTools> = UIToolInvocation<MyTools[T]>;
