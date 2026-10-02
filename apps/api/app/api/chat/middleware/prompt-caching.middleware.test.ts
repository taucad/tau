import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPromptCachingMiddleware } from '#api/chat/middleware/prompt-caching.middleware.js';
import { invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

/**
 * Type for content block with cache control.
 */
type ContentBlockWithCacheControl = {
  type: string;
  text?: string;
  cache_control?: { type: 'ephemeral' };
};

// All existing assertions cover the Anthropic cache-write path, so resolve the
// factory once with the Anthropic provider for backwards-compatibility with
// the test suite. Dedicated provider-gating coverage lives at the bottom of
// this file.
const promptCachingMiddleware = createPromptCachingMiddleware('anthropic');

describe('promptCachingMiddleware', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn().mockResolvedValue({ content: 'response' });
  });

  describe('caching HumanMessage (last message)', () => {
    it('should add cache_control to last HumanMessage with string content', async () => {
      const messages: BaseMessage[] = [new HumanMessage('What is the capital of France?')];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      const lastMessage = request.messages[0] as HumanMessage;
      expect(lastMessage.content).toBeInstanceOf(Array);

      const contentBlocks = lastMessage.content as ContentBlockWithCacheControl[];
      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: 'What is the capital of France?',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should add cache_control to the last content block when HumanMessage has array content', async () => {
      const humanMessage = new HumanMessage({
        content: [
          { type: 'text', text: 'First part' },
          { type: 'text', text: 'Second part' },
        ],
      });

      const messages: BaseMessage[] = [humanMessage];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const lastMessage = request.messages[0] as HumanMessage;
      const contentBlocks = lastMessage.content as ContentBlockWithCacheControl[];

      // First block should NOT have cache_control
      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: 'First part',
      });

      // Last block SHOULD have cache_control
      expect(contentBlocks[1]).toEqual({
        type: 'text',
        text: 'Second part',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });
    });
  });

  describe('caching AIMessage (last message)', () => {
    it('should add cache_control to last AIMessage with string content', async () => {
      const messages: BaseMessage[] = [new HumanMessage('Hello'), new AIMessage('Hi there!')];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // First message (HumanMessage) should NOT be modified
      const firstMessage = request.messages[0] as HumanMessage;
      expect(firstMessage.content).toBe('Hello');

      // Last message (AIMessage) should have cache_control
      const lastMessage = request.messages[1] as AIMessage;
      const contentBlocks = lastMessage.content as ContentBlockWithCacheControl[];
      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: 'Hi there!',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should add cache_control to AIMessage with array content', async () => {
      const aiMessage = new AIMessage({
        content: [
          { type: 'text', text: 'First thought' },
          { type: 'text', text: 'Second thought' },
        ],
      });

      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const lastMessage = request.messages[0] as AIMessage;
      const contentBlocks = lastMessage.content as ContentBlockWithCacheControl[];

      // First block should NOT have cache_control
      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: 'First thought',
      });

      // Last block SHOULD have cache_control
      expect(contentBlocks[1]).toEqual({
        type: 'text',
        text: 'Second thought',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });
    });

    it('should add cache_control to AIMessage with empty content but tool_calls', async () => {
      const aiMessage = new AIMessage({
        content: '',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_123', name: 'read_file', args: { path: '/test.txt' } }],
      });

      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const lastMessage = request.messages[0] as AIMessage;
      const contentBlocks = lastMessage.content as ContentBlockWithCacheControl[];

      // Should create a text block with empty string and cache_control
      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: '',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });

      // Tool calls should be preserved
      expect(lastMessage.tool_calls).toHaveLength(1);
      expect(lastMessage.tool_calls?.[0]?.name).toBe('read_file');
    });
  });

  describe('caching ToolMessage (last message)', () => {
    it('should add cache_control to last ToolMessage with string content', async () => {
      const messages: BaseMessage[] = [
        new HumanMessage('Read the file'),
        new AIMessage({
          content: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_123', name: 'read_file', args: {} }],
        }),
        new ToolMessage({
          content: '{"content": "file contents", "totalLines": 10}',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_123',
          name: 'read_file',
        }),
      ];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // First two messages should NOT be modified
      const humanMessage = request.messages[0] as HumanMessage;
      expect(humanMessage.content).toBe('Read the file');

      // Last message (ToolMessage) should have cache_control
      const toolMessage = request.messages[2] as ToolMessage;
      const contentBlocks = toolMessage.content as ContentBlockWithCacheControl[];
      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: '{"content": "file contents", "totalLines": 10}',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });

      // Tool call ID and name should be preserved
      expect(toolMessage.tool_call_id).toBe('call_123');
      expect(toolMessage.name).toBe('read_file');
    });

    it('should add cache_control to ToolMessage with array content', async () => {
      const toolMessage = new ToolMessage({
        content: [
          { type: 'text', text: 'Part 1' },
          { type: 'text', text: 'Part 2' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_456',
        name: 'some_tool',
      });

      const messages: BaseMessage[] = [toolMessage];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const lastMessage = request.messages[0] as ToolMessage;
      const contentBlocks = lastMessage.content as ContentBlockWithCacheControl[];

      // First block should NOT have cache_control
      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: 'Part 1',
      });

      // Last block SHOULD have cache_control
      expect(contentBlocks[1]).toEqual({
        type: 'text',
        text: 'Part 2',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });
    });
  });

  describe('AIMessage metadata preservation', () => {
    it('should preserve response_metadata when caching AIMessage with string content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const responseMetadata = { model: 'claude-3-5-sonnet-20241022', stop_reason: 'end_turn' };
      const messages: BaseMessage[] = [
        new AIMessage({
          content: 'Response text',
          response_metadata: responseMetadata,
        }),
      ];
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.response_metadata).toEqual(responseMetadata);
    });

    it('should preserve usage_metadata when caching AIMessage with string content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const usageMetadata = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        input_token_details: { cache_read: 80, cache_creation: 20 },
      };
      const messages: BaseMessage[] = [
        new AIMessage({
          content: 'Response text',
          usage_metadata: usageMetadata,
        }),
      ];
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.usage_metadata).toEqual(usageMetadata);
    });

    it('should preserve response_metadata when caching AIMessage with array content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const responseMetadata = { model: 'gpt-4o-2024-05-13' };
      const messages: BaseMessage[] = [
        new AIMessage({
          content: [{ type: 'text', text: 'Array response' }],
          response_metadata: responseMetadata,
        }),
      ];
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.response_metadata).toEqual(responseMetadata);
    });

    it('should preserve usage_metadata when caching AIMessage with array content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const usageMetadata = {
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 300,
        input_token_details: { cache_read: 0, cache_creation: 0 },
      };
      const messages: BaseMessage[] = [
        new AIMessage({
          content: [{ type: 'text', text: 'Array response' }],
          usage_metadata: usageMetadata,
        }),
      ];
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.usage_metadata).toEqual(usageMetadata);
    });

    it('should preserve response_metadata when caching AIMessage with only tool_calls', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const responseMetadata = { model: 'claude-3-5-sonnet-20241022' };
      const messages: BaseMessage[] = [
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'call_1', name: 'read_file', args: {} }],
          response_metadata: responseMetadata,
        }),
      ];
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.response_metadata).toEqual(responseMetadata);
    });

    it('should preserve usage_metadata when caching AIMessage with only tool_calls', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const usageMetadata = {
        input_tokens: 50,
        output_tokens: 25,
        total_tokens: 75,
        input_token_details: { cache_read: 0, cache_creation: 0 },
      };
      const messages: BaseMessage[] = [
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'call_1', name: 'read_file', args: {} }],
          usage_metadata: usageMetadata,
        }),
      ];
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.usage_metadata).toEqual(usageMetadata);
    });

    it('should preserve all metadata properties together when caching AIMessage', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const toolCalls = [{ id: 'call_1', name: 'read_file', args: {} }];
      const responseMetadata = { model: 'claude-3-5-sonnet-20241022', stop_reason: 'end_turn' };
      const usageMetadata = {
        input_tokens: 300,
        output_tokens: 150,
        total_tokens: 450,
        input_token_details: { cache_read: 200, cache_creation: 100 },
      };
      const additionalKwargs = { custom: 'value' };

      const messages: BaseMessage[] = [
        new AIMessage({
          content: 'Full metadata test',
          id: 'msg_cache_full',
          tool_calls: toolCalls,
          additional_kwargs: additionalKwargs,
          response_metadata: responseMetadata,
          usage_metadata: usageMetadata,
        }),
      ];
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;

      expect(result.id).toBe('msg_cache_full');
      expect(result.tool_calls).toEqual(toolCalls);
      expect(result.additional_kwargs).toEqual(additionalKwargs);
      expect(result.response_metadata).toEqual(responseMetadata);
      expect(result.usage_metadata).toEqual(usageMetadata);
    });
  });

  describe('agent turn simulation (multiple tool calls)', () => {
    it('should cache the last message in a typical agent turn flow', async () => {
      // Simulate: User → AI with tool_calls → Tool results (last message)
      const messages: BaseMessage[] = [
        new HumanMessage('Build a rounded rectangle plate'),
        new AIMessage({
          content: 'I will create the plate for you.',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [
            { id: 'call_1', name: 'create_file', args: { targetFile: 'main.ts' } },
            { id: 'call_2', name: 'get_kernel_result', args: {} },
          ],
        }),
        new ToolMessage({
          content: '{"success": true}',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_1',
          name: 'create_file',
        }),
        new ToolMessage({
          content: '{"status": "ready"}',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_2',
          name: 'get_kernel_result',
        }),
      ];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // Only the LAST message should have cache_control
      // First 3 messages should NOT be modified
      expect((request.messages[0] as HumanMessage).content).toBe('Build a rounded rectangle plate');
      expect((request.messages[1] as AIMessage).content).toBe('I will create the plate for you.');
      expect((request.messages[2] as ToolMessage).content).toBe('{"success": true}');

      // Last ToolMessage should have cache_control
      const lastMessage = request.messages[3] as ToolMessage;
      const contentBlocks = lastMessage.content as ContentBlockWithCacheControl[];
      expect(contentBlocks[0]?.cache_control).toEqual({ type: 'ephemeral' });
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', async () => {
      const messages: BaseMessage[] = [];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages).toHaveLength(0);
    });

    it('should handle single message of any type', async () => {
      const messages: BaseMessage[] = [new HumanMessage('Hello!')];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const message = request.messages[0] as HumanMessage;
      const contentBlocks = message.content as ContentBlockWithCacheControl[];

      expect(contentBlocks[0]).toEqual({
        type: 'text',
        text: 'Hello!',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        cache_control: { type: 'ephemeral' },
      });
    });
  });

  describe('immutability', () => {
    it('should not mutate the original messages array', async () => {
      const originalMessage = new HumanMessage('Original message');
      const messages: BaseMessage[] = [originalMessage];
      const originalMessagesLength = messages.length;

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      // Original array should not be mutated
      expect(messages).toHaveLength(originalMessagesLength);
      // Original message should still have string content
      expect(originalMessage.content).toBe('Original message');
    });

    it('should create a new array with modified messages', async () => {
      const messages: BaseMessage[] = [new HumanMessage('Test')];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // The returned array should be different from the input
      expect(request.messages).not.toBe(messages);
    });

    it('should not mutate original ToolMessage', async () => {
      const originalToolMessage = new ToolMessage({
        content: '{"result": "success"}',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_123',
        name: 'test_tool',
      });
      const messages: BaseMessage[] = [originalToolMessage];

      await invokeWrapModelCall(promptCachingMiddleware, { messages }, handler);

      // Original message should still have string content
      expect(originalToolMessage.content).toBe('{"result": "success"}');
    });
  });

  // ---------------------------------------------------------------------------
  // Provider gating
  //
  // `cache_control` is an Anthropic-only marker. Other providers either ignore
  // it (legacy OpenAI Chat Completions tool outputs that get JSON.stringify'd)
  // or actively reject it: OpenAI's Responses API returns 400 "Unknown
  // parameter" when `cache_control` lands on a typed `function_call_output`
  // item such as `input_image`. The middleware therefore must be a no-op for
  // every non-Anthropic target.
  // ---------------------------------------------------------------------------

  describe('non-Anthropic provider gating (no-op)', () => {
    it.each(['openai', 'vertexai', 'cerebras', 'together', 'ollama'] as const)(
      'leaves messages untouched for %s target (no cache_control added)',
      async (provider) => {
        const middleware = createPromptCachingMiddleware(provider);
        const original = new HumanMessage('Hello');
        const messages: BaseMessage[] = [original];

        await invokeWrapModelCall(middleware, { messages }, handler);

        const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
        expect(request.messages).toBe(messages);
        expect(request.messages[0]).toBe(original);
      },
    );

    it('does not add cache_control to ToolMessage typed-list content for openai target', async () => {
      const middleware = createPromptCachingMiddleware('openai');
      const tool = new ToolMessage({
        content: [
          { type: 'input_text', text: 'Captured 1 screenshot.' },
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI Responses API native shape uses snake_case
          { type: 'input_image', image_url: 'data:image/png;base64,abc', detail: 'auto' },
        ],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_call_id: 'call_screenshot',
        name: 'screenshot',
      });

      await invokeWrapModelCall(middleware, { messages: [tool] }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const out = request.messages[0] as ToolMessage;
      const blocks = out.content as ContentBlockWithCacheControl[];
      for (const block of blocks) {
        expect(block.cache_control).toBeUndefined();
      }
    });
  });
});
