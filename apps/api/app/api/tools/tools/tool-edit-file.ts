import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { editFileInputSchema } from '@taucad/chat';
import { assertRpcSuccess, ToolError } from '@taucad/chat/utils';
import type { ChatTool, EditFileInput, EditFileOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const editFileToolDefinition = {
  name: toolName.editFile,
  description: `Use this tool to propose an edit to an existing file.

This will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.

When writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.

For example:

// ... existing code ...
FIRST_EDIT
// ... existing code ...
SECOND_EDIT
// ... existing code ...
THIRD_EDIT
// ... existing code ...

You should bias towards repeating as few lines of the original file as possible to convey the change.
Each edit should contain sufficient context of unchanged lines around the code you're editing to resolve ambiguity.
If you plan on deleting a section, you must provide surrounding context to indicate the deletion.
DO NOT omit spans of pre-existing code without using the // ... existing code ... comment to indicate its absence.`,
  schema: editFileInputSchema,
} as const;

export const editFileTool: ChatTool<
  typeof editFileInputSchema,
  EditFileInput,
  EditFileOutput,
  typeof toolName.editFile
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, fileEditService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;
  const { targetFile, codeEdit } = args;

  // Step 1: Read the original file content via RPC (raw bytes; cat-n gutter is only added by the read_file chat tool)
  // The frontend returns raw content without line numbers
  const readResult = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.readFile,
    args: { targetFile },
  });

  // Assert RPC success - throws ToolError for any infrastructure or client error
  assertRpcSuccess(readResult, {
    toolName: toolName.editFile,
    toolCallId,
    clientErrorMessage: `Cannot read file "${targetFile}"`,
  });

  // RPC returns raw file content
  const originalContent = readResult.content;

  // Step 2: Apply the edit using FileEditService
  const editResult = await fileEditService.applyFileEdit({
    targetFile,
    originalContent,
    codeEdit,
    instructions: 'Apply the code edit',
  });

  if (!editResult.success) {
    throw new ToolError({
      errorCode: 'TOOL_EXECUTION_ERROR',
      message: `Failed to apply edit to "${targetFile}": ${editResult.error}`,
      toolName: toolName.editFile,
      toolCallId,
    });
  }

  // Step 3: Write the edited content back via RPC
  const writeResult = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.createFile,
    args: { targetFile, content: editResult.editedContent },
  });

  // Assert RPC success - throws ToolError for any infrastructure or client error
  assertRpcSuccess(writeResult, {
    toolName: toolName.editFile,
    toolCallId,
    clientErrorMessage: `Cannot save file "${targetFile}"`,
  });

  // Return the result with diff stats (success only - no success property)
  const result: EditFileOutput = {
    diffStats: {
      linesAdded: editResult.diffStats?.linesAdded ?? 0,
      linesRemoved: editResult.diffStats?.linesRemoved ?? 0,
      originalContent,
      modifiedContent: editResult.editedContent,
    },
  };
  return result;
}, editFileToolDefinition);
