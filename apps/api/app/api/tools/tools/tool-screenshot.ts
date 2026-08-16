import type { ToolRuntime } from '@langchain/core/tools';
import { tool } from '@langchain/core/tools';
import type { ScreenshotOutput } from '@taucad/chat';
import { screenshotInputSchema } from '@taucad/chat';
import { assertRpcSuccess } from '@taucad/chat/utils';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';

export const screenshotToolDefinition = {
  name: toolName.screenshot,
  description: `Capture a screenshot of a specific geometry unit's 3D model for visual inspection.

You MUST pass \`targetFile\` (the source file path of the geometry unit to screenshot, e.g. "main.ts" or "lib/bracket.scad"). There is no project-level fallback. The requested geometry unit is resolved or created, then its render is awaited before headless capture. The call fails for a missing source file, render failure or render timeout, an unavailable renderer, or invalid image artifacts.

Modes:
- single: Captures one deterministic perspective isometric image
- multi_angle: Captures 6 separate orthographic images (front, back, right, left, top, bottom)

Every image includes:
- an in-image view label; canonical axis-aligned labels name the camera position as View From ±axis
- a camera-aligned red-X, green-Y, blue-Z orientation indicator with dot/cross depth notation
- a physical scale bar; orthographic scale is depth-invariant, while perspective scale is measured at the subject-center plane and marked @ center

Use these annotations when reasoning about orientation, handedness, opposite faces, and size.`,
  schema: screenshotInputSchema,
} as const;

export const screenshotTool = tool(async (args, runtime: ToolRuntime): Promise<ScreenshotOutput> => {
  const { chatRpcService, thread_id: chatId } = runtime.configurable as ChatRpcConfigurable;
  const { toolCallId } = runtime;
  const { targetFile } = args;

  const result = await chatRpcService.sendRpcRequest({
    chatId,
    toolCallId,
    rpcName: rpcName.captureImages,
    args: { mode: args.mode, targetFile },
  });

  assertRpcSuccess(result, {
    toolName: toolName.screenshot,
    toolCallId,
    clientErrorMessage: `Failed to capture screenshot for ${targetFile}`,
  });

  return {
    images: result.images.map((img) => ({
      view: img.view,
      dataUrl: img.dataUrl,
    })),
  };
}, screenshotToolDefinition);
