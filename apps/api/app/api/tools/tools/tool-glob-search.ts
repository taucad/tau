import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { globSearchInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, GlobSearchInput, GlobSearchOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const globSearchToolDefinition = {
  name: toolName.globSearch,
  description: `Find files matching a glob pattern in the project.

Use this tool to:
- Find all files of a certain type (e.g., "**/*.scad", "**/*.ts")
- Locate files in specific directories (e.g., "lib/**/*.scad")
- Discover files by name pattern (e.g., "**/test_*.scad")

Common glob patterns:
- "**/*.ext" - All files with extension in any directory
- "dir/**/*" - All files under a specific directory
- "**/prefix_*" - Files starting with a prefix in any directory

For searching file contents, use \`grep\`.`,
  schema: globSearchInputSchema,
} as const;

export const globSearchTool: ChatTool<
  typeof globSearchInputSchema,
  GlobSearchInput,
  GlobSearchOutput,
  typeof toolName.globSearch
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.globSearch,
    args,
  });

  // Assert RPC success - throws ToolError for any infrastructure or client error
  assertRpcSuccess(result, {
    toolName: toolName.globSearch,
    toolCallId,
  });

  // Return success output
  return {
    files: result.files,
    totalFiles: result.totalFiles,
  };
}, globSearchToolDefinition);
