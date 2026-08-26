import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { getKernelResultInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, GetKernelResultInput, GetKernelResultOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const getKernelResultToolDefinition = {
  name: toolName.getKernelResult,
  description: `Check the status of the CAD kernel and retrieve any compilation errors for a specific file.

Parameters:
- targetFile: The file to check kernel results for (relative to project root)

Use this tool AFTER using \`edit_file\` or \`create_file\` to verify that your code changes compiled successfully.

Returns:
- status: 'ready' if compilation succeeded, 'error' if there were errors, 'pending' if still processing
- kernelIssues: Array of compilation/runtime errors if any occurred

Best Practice: Always call this tool after making file changes to ensure the model renders correctly before proceeding.

After compilation succeeds, use \`test_model\` to run GeoSpec geometry tests.`,
  schema: getKernelResultInputSchema,
} as const;

export const getKernelResultTool: ChatTool<
  typeof getKernelResultInputSchema,
  GetKernelResultInput,
  GetKernelResultOutput,
  typeof toolName.getKernelResult
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.getKernelResult,
    args,
  });

  // Assert RPC success - throws ToolError for any infrastructure or client error
  assertRpcSuccess(result, {
    toolName: toolName.getKernelResult,
    toolCallId,
    clientErrorMessage: `Cannot get kernel result for "${args.targetFile}"`,
  });

  // Return success output
  return {
    status: result.status,
    kernelIssues: result.kernelIssues,
  };
}, getKernelResultToolDefinition);
