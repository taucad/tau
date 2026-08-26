import { HumanMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPromptCachingMiddleware } from '#api/chat/middleware/prompt-caching.middleware.js';
import { invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

describe('createPromptCachingMiddleware', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn().mockResolvedValue({ content: 'response' });
  });

  it('should add Anthropic cache control through model settings', async () => {
    const middleware = createPromptCachingMiddleware('anthropic');
    const messages: BaseMessage[] = [new HumanMessage('What is the capital of France?')];

    await invokeWrapModelCall(middleware, { messages, modelSettings: { temperature: 0.2 } }, handler);

    expect(handler).toHaveBeenCalledTimes(1);
    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[]; modelSettings?: Record<string, unknown> }];
    expect(request.messages).toBe(messages);
    expect(request.messages[0]).toBe(messages[0]);
    expect(request.modelSettings).toMatchObject({
      temperature: 0.2,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Anthropic API setting name.
      cache_control: { type: 'ephemeral', ttl: '5m' },
    });
  });

  it('should preserve typed ToolMessage content without adding cache_control blocks', async () => {
    const middleware = createPromptCachingMiddleware('anthropic');
    const tool = new ToolMessage({
      content: [
        { type: 'input_text', text: 'Captured 1 screenshot.' },
        // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses API native shape uses snake_case.
        { type: 'input_image', image_url: 'data:image/png;base64,abc', detail: 'auto' },
      ],
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case.
      tool_call_id: 'call_screenshot',
      name: 'screenshot',
    });

    await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

    const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
    expect(request.messages[0]).toBe(tool);
    expect(tool.content).toEqual([
      { type: 'input_text', text: 'Captured 1 screenshot.' },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses API native shape uses snake_case.
      { type: 'input_image', image_url: 'data:image/png;base64,abc', detail: 'auto' },
    ]);
  });

  it.each(['openai', 'vertexai', 'cerebras', 'together', 'ollama'] as const)(
    'should leave the request untouched for %s target',
    async (provider) => {
      const middleware = createPromptCachingMiddleware(provider);
      const original = new HumanMessage('Hello');
      const messages: BaseMessage[] = [original];

      await invokeWrapModelCall(middleware, { messages, modelSettings: { temperature: 0.1 } }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[]; modelSettings?: Record<string, unknown> }];
      expect(request.messages).toBe(messages);
      expect(request.messages[0]).toBe(original);
      expect(request.modelSettings).toEqual({ temperature: 0.1 });
    },
  );
});
