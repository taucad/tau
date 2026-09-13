import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { grepInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, GrepInput, GrepOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const grepToolDefinition = {
  name: toolName.grep,
  description: `Search for text patterns in files using regular expressions.

This is a powerful search tool for finding exact matches in file contents.

Usage:
- Supports full regex syntax, e.g. "function\\s+\\w+", "import.*from"
- Escape special characters for exact matches, e.g. "functionCall\\("
- Use the glob parameter to filter by file type, e.g. "*.scad", "*.ts"
- Results show file path, line number, and matching line content
- Defaults to first 50 matches; pass \`headLimit\` (1-1000) to widen, \`offset\` to paginate.

Use this tool when you need to:
- Find specific code patterns or function calls
- Locate variable or function definitions
- Search for text across multiple files

For finding files by name pattern, use \`glob\`.`,
  schema: grepInputSchema,
} as const;

export const grepTool: ChatTool<typeof grepInputSchema, GrepInput, GrepOutput, typeof toolName.grep> = tool(
  async (args, runtime: ToolRuntime) => {
    const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
    const { toolCallId } = runtime;

    const result = await chatRpcService.sendRpcRequest({ chatId, toolCallId, rpcName: rpcName.grep, args });

    // Assert RPC success - throws ToolError for any infrastructure or client error
    assertRpcSuccess(result, {
      toolName: toolName.grep,
      toolCallId,
    });

    // Return success output
    return {
      matches: result.matches,
      totalMatches: result.totalMatches,
      truncated: result.truncated,
      appliedHeadLimit: result.appliedHeadLimit,
      appliedOffset: result.appliedOffset,
    };
  },
  grepToolDefinition,
);
