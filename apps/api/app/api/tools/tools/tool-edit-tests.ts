import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { editTestsInputSchema, isRpcClientError } from '@taucad/chat';
import { assertRpcExecution, assertRpcSuccess, ToolError } from '@taucad/chat/utils';
import type { ChatTool, EditTestsInput, EditTestsOutput } from '@taucad/chat';
import { toolName, rpcName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const editTestsToolDefinition = {
  name: toolName.editTests,
  description: `Edit test.json to add, modify, or remove test requirements.

Uses the same pattern as edit_file - specify edits with // ... existing code ... to represent unchanged sections.

Example:
{
  "requirements": [
    { "id": "req_width", "type": "measurement", "description": "Model is 100mm wide", "check": "boundingBox", "expected": { "size": { "x": 100 } }, "tolerance": 1 },
    { "id": "req_centered", "type": "measurement", "description": "Centered at origin XY", "check": "boundingBox", "expected": { "center": { "x": 0, "y": 0 } }, "tolerance": 0.5 },
    { "id": "req_mesh", "type": "measurement", "description": "Single solid mesh", "check": "meshCount", "expected": { "count": 1 } }
  ]
}

Checks: boundingBox (expected: { size: { x?, y?, z? }, center: { x?, y?, z? } } — specify only axes to check), meshCount, vertexCount.

Use this tool BEFORE making model changes (TDD approach).`,
  schema: editTestsInputSchema,
} as const;

const testFile = 'test.json';

// Default test.json content when file doesn't exist
const defaultTestFile = JSON.stringify(
  {
    requirements: [],
  },
  null,
  2,
);

export const editTestsTool: ChatTool<
  typeof editTestsInputSchema,
  EditTestsInput,
  EditTestsOutput,
  typeof toolName.editTests
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, fileEditService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;
  const { codeEdit } = args;

  // Step 1: Read the current test.json content via RPC
  const readResult = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.readFile,
    args: { targetFile: testFile },
  });

  // Assert infrastructure success - throws ToolError for timeout, disconnect, validation
  assertRpcExecution(readResult, toolName.editTests, toolCallId);

  // Handle client errors - only use default for "file not found", propagate other errors
  let originalContent: string;
  if (isRpcClientError(readResult)) {
    if (readResult.errorCode === 'FILE_NOT_FOUND') {
      // File doesn't exist yet, use default content
      originalContent = defaultTestFile;
    } else {
      // Other errors (permissions, I/O, etc.) should be propagated
      throw new ToolError({
        errorCode: 'TOOL_EXECUTION_ERROR',
        message: `Cannot read test.json: ${readResult.message}`,
        toolName: toolName.editTests,
        toolCallId,
      });
    }
  } else {
    originalContent = readResult.content === '' ? defaultTestFile : readResult.content;
  }

  // Step 2: Apply the edit using FileEditService (Morph fast-apply)
  const editResult = await fileEditService.applyFileEdit({
    targetFile: testFile,
    originalContent,
    codeEdit,
    instructions: 'Apply the test requirements edit to test.json',
  });

  if (!editResult.success) {
    throw new ToolError({
      errorCode: 'TOOL_EXECUTION_ERROR',
      message: `Failed to apply edit to test.json: ${editResult.error}`,
      toolName: toolName.editTests,
      toolCallId,
    });
  }

  // Step 3: Write the edited content back via RPC
  const writeResult = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.createFile,
    args: { targetFile: testFile, content: editResult.editedContent },
  });

  // Assert RPC success - throws ToolError for any infrastructure or client error
  assertRpcSuccess(writeResult, {
    toolName: toolName.editTests,
    toolCallId,
    clientErrorMessage: 'Cannot save test.json',
  });

  const result: EditTestsOutput = {
    diffStats: {
      linesAdded: editResult.diffStats?.linesAdded ?? 0,
      linesRemoved: editResult.diffStats?.linesRemoved ?? 0,
      originalContent,
      modifiedContent: editResult.editedContent,
    },
  };
  return result;
}, editTestsToolDefinition);
