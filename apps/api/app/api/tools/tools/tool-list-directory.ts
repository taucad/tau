import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { listDirectoryInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, ListDirectoryInput, ListDirectoryOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const listDirectoryToolDefinition = {
  name: toolName.listDirectory,
  description: `List files and directories in a given path within the project.

Use this tool to:
- Explore the project structure
- Find files in specific directories
- Understand the organization of the codebase

The path should be relative to the project root. Use an empty string "" to list the root directory.`,
  schema: listDirectoryInputSchema,
} as const;

export const listDirectoryTool: ChatTool<
  typeof listDirectoryInputSchema,
  ListDirectoryInput,
  ListDirectoryOutput,
  typeof toolName.listDirectory
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.listDirectory,
    args,
  });

  // Assert RPC success - throws ToolError for any infrastructure or client error
  assertRpcSuccess(result, {
    toolName: toolName.listDirectory,
    toolCallId,
  });

  // Return success output
  return {
    entries: result.entries,
    path: result.path,
  };
}, listDirectoryToolDefinition);
