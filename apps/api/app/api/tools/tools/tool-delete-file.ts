import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { deleteFileInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, DeleteFileInput, DeleteFileOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const deleteFileToolDefinition = {
  name: toolName.deleteFile,
  description: `Delete a file from the project filesystem.

Use this tool to:
- Remove unused or obsolete files
- Clean up temporary files
- Remove files that are no longer needed

The operation will fail gracefully if:
- The file doesn't exist
- The operation is rejected for security reasons
- The file cannot be deleted`,
  schema: deleteFileInputSchema,
} as const;

export const deleteFileTool: ChatTool<
  typeof deleteFileInputSchema,
  DeleteFileInput,
  DeleteFileOutput,
  typeof toolName.deleteFile
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.deleteFile,
    args,
  });

  // Assert RPC success - throws ToolError for any infrastructure or client error
  assertRpcSuccess(result, {
    toolName: toolName.deleteFile,
    toolCallId,
    clientErrorMessage: `Cannot delete file "${args.targetFile}"`,
  });

  // Return success output. `diffStats` carries the pre-deletion content (R7)
  // for the restore timeline; it is undefined for missing/binary/legacy deletes.
  const output: DeleteFileOutput = {
    message: result.message,
    diffStats: result.diffStats,
  };
  return output;
}, deleteFileToolDefinition);
