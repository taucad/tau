import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import type { ScreenshotOutput } from '@taucad/chat';
import { screenshotInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const screenshotToolDefinition = {
  name: toolName.screenshot,
  description: `Capture a screenshot of the current 3D model for visual verification.

Modes:
- single: Captures the current camera perspective (1 image)
- multi_angle: Captures all 6 orthographic views (front, back, right, left, top, bottom)

Use after tests pass to verify the model looks correct visually.`,
  schema: screenshotInputSchema,
} as const;

export const screenshotTool = tool(async (args, runtime: ToolRuntime): Promise<ScreenshotOutput> => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;

  if (args.mode === 'multi_angle') {
    const result = await chatRpcService.sendRpcRequest({
      chatId,
      toolCallId,
      rpcName: rpcName.captureObservations,
      args: {},
    });

    assertRpcSuccess(result, {
      toolName: toolName.screenshot,
      toolCallId,
      clientErrorMessage: 'Failed to capture multi-angle screenshots',
    });

    return {
      images: result.observations.map((obs) => ({
        view: obs.side,
        dataUrl: obs.src,
      })),
    };
  }

  // Single screenshot mode
  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.captureScreenshot,
    args: {},
  });

  assertRpcSuccess(result, {
    toolName: toolName.screenshot,
    toolCallId,
    clientErrorMessage: 'Failed to capture screenshot',
  });

  return {
    images: result.images.map((img) => ({
      view: img.view,
      dataUrl: img.dataUrl,
    })),
  };
}, screenshotToolDefinition);
