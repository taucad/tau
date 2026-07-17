import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import { exportGeometryInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import type { ChatTool, ExportGeometryInput, ExportGeometryOutput } from '@taucad/chat';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

/** @internal */
export const exportGeometryToolDefinition = {
  name: toolName.exportGeometry,
  description: `Produce a persisted interchange/mesh artifact for one geometry unit and write it under \`.tau/artifacts/\` in the active project workspace.

Give explicit \`targetFile\` and \`format\` (extension only, matching the Tau MIME/extension registry — include the leading dot nowhere).

Examples: \`format: "stl"\`, \`format: "step"\`, \`format: "glb"\`, \`format: "3mf"\`. The runtime must expose an export route for that extension on the user's active kernel — when it does not, the tool surfaces an RPC error explaining the rejection.

Returns an ordered \`files\` array with each producer name, persisted \`artifactPath\`, \`mimeType\`, and \`byteLength\`. The first entry is the primary artifact and later entries are required companions.

For deterministic measurement runs, create or edit \`*.geospec.ts\` tests and use \`${toolName.testModel}\` instead.`,
  schema: exportGeometryInputSchema,
} as const;

/** @internal */
export const exportGeometryTool: ChatTool<
  typeof exportGeometryInputSchema,
  ExportGeometryInput,
  ExportGeometryOutput,
  typeof toolName.exportGeometry
> = tool(async (args, runtime: ToolRuntime) => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.exportGeometry,
    args: { ...args, toolCallId },
  });

  assertRpcSuccess(result, {
    toolName: toolName.exportGeometry,
    toolCallId,
    clientErrorMessage: `Cannot export geometry for "${args.targetFile}" (${args.format})`,
  });

  return {
    format: result.format,
    files: result.files,
  };
}, exportGeometryToolDefinition);
