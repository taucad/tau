// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { ToolRuntime } from '@langchain/core/tools';
import type { ScreenshotInput, ScreenshotOutput } from '@taucad/chat';
import { ToolError } from '@taucad/chat/utils';
import { rpcName, toolName } from '@taucad/chat/constants';
import type { ChatRpcConfigurable } from '#api/tools/tool.types.js';
import { screenshotTool, screenshotToolDefinition } from '#api/tools/tools/tool-screenshot.js';

type ScreenshotToolInvoke = {
  invoke(input: ScreenshotInput, runtime: ToolRuntime): Promise<ScreenshotOutput>;
};

type RpcResult = Awaited<ReturnType<ChatRpcConfigurable['chatRpcService']['sendRpcRequest']>>;

const createHarness = () => {
  const chatRpcService = mock<ChatRpcConfigurable['chatRpcService']>();
  const runtime = mock<ToolRuntime>({
    toolCallId: 'tool-call-1',
    configurable: {
      chatRpcService,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain runtime uses snake_case
      thread_id: 'chat-1',
    } as unknown as Record<string, unknown>,
  });
  return { chatRpcService, runtime, tool: screenshotTool as unknown as ScreenshotToolInvoke };
};

describe('screenshotToolDefinition', () => {
  it('should describe lazy headless capture and its real failure modes', () => {
    expect(screenshotToolDefinition.description).toContain('resolved or created');
    expect(screenshotToolDefinition.description).toContain('headless');
    expect(screenshotToolDefinition.description).toContain('render timeout');
    expect(screenshotToolDefinition.description).toContain('unavailable renderer');
    expect(screenshotToolDefinition.description).toContain('invalid image artifacts');
    expect(screenshotToolDefinition.description).not.toContain('viewer panel');
    expect(screenshotToolDefinition.description).not.toContain('UNKNOWN_GEOMETRY_UNIT');
  });

  it('should explain every embedded spatial annotation to the model', () => {
    expect(screenshotToolDefinition.description).toContain('View From');
    expect(screenshotToolDefinition.description).toContain('dot/cross depth notation');
    expect(screenshotToolDefinition.description).toContain('subject-center plane');
    expect(screenshotToolDefinition.description).toContain('@ center');
  });
});

describe('screenshotTool', () => {
  it('should send one exact singular capture request and return its image', async () => {
    const { chatRpcService, runtime, tool } = createHarness();
    const images: ScreenshotOutput['images'] = [
      { view: 'isometric', dataUrl: 'data:image/webp;base64,AQ==' },
    ];
    chatRpcService.sendRpcRequest.mockResolvedValue({ success: true, images } as unknown as RpcResult);

    await expect(tool.invoke({ mode: 'single', targetFile: 'lib/bracket.ts' }, runtime)).resolves.toEqual({ images });
    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledOnce();
    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith({
      chatId: 'chat-1',
      toolCallId: 'tool-call-1',
      rpcName: rpcName.captureImages,
      args: { mode: 'single', targetFile: 'lib/bracket.ts' },
    });
  });

  it('should send one multi-angle request and preserve the ordered images', async () => {
    const { chatRpcService, runtime, tool } = createHarness();
    const images = (['front', 'back', 'right', 'left', 'top', 'bottom'] as const).map((view) => ({
      view,
      dataUrl: `data:image/webp;base64,${view}`,
    }));
    chatRpcService.sendRpcRequest.mockResolvedValue({ success: true, images } as unknown as RpcResult);

    await expect(tool.invoke({ mode: 'multi_angle', targetFile: 'main.ts' }, runtime)).resolves.toEqual({ images });
    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledOnce();
    expect(chatRpcService.sendRpcRequest).toHaveBeenCalledWith({
      chatId: 'chat-1',
      toolCallId: 'tool-call-1',
      rpcName: rpcName.captureImages,
      args: { mode: 'multi_angle', targetFile: 'main.ts' },
    });
  });

  it('should throw an attributed ToolError when capture fails', async () => {
    const { chatRpcService, runtime, tool } = createHarness();
    chatRpcService.sendRpcRequest.mockResolvedValue({
      success: false,
      errorCode: 'RENDER_TIMEOUT',
      message: 'Image render timed out',
    } as unknown as RpcResult);

    try {
      await tool.invoke({ mode: 'single', targetFile: 'main.ts' }, runtime);
      expect.fail('Expected screenshot to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).data).toEqual({
        errorCode: 'TOOL_EXECUTION_ERROR',
        message: 'Failed to capture screenshot for main.ts (RENDER_TIMEOUT: Image render timed out)',
        toolName: toolName.screenshot,
        toolCallId: 'tool-call-1',
      });
    }
  });
});
