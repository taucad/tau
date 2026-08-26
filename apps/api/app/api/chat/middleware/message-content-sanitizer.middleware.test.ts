import { HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { messageContentSanitizerMiddleware } from '#api/chat/middleware/message-content-sanitizer.middleware.js';
import { invokeWrapModelCall } from '#testing/middleware-testing.utils.js';

/**
 * Type for a content block used in tests.
 */
type TestContentBlock = {
  type: string;
  text?: string;
  reasoning?: string;
};

describe('messageContentSanitizerMiddleware', () => {
  let handler: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    handler = vi.fn().mockResolvedValue({ content: 'response' });
  });

  describe('AIMessages with only reasoning blocks (interrupted thinking)', () => {
    it('should add placeholder text block when AIMessage has only a reasoning block', async () => {
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'Let me think about this...' }],
      });

      const messages: BaseMessage[] = [new HumanMessage('Hello'), aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      const sanitizedAiMessage = request.messages[1] as AIMessage;
      const contentBlocks = sanitizedAiMessage.content as TestContentBlock[];

      // Should have the original reasoning block plus an added text block
      expect(contentBlocks).toHaveLength(2);
      expect(contentBlocks[0]).toEqual({
        type: 'reasoning',
        reasoning: 'Let me think about this...',
      });
      expect(contentBlocks[1]).toEqual({
        type: 'text',
        text: '[interrupted]',
      });
    });

    it('should add placeholder text block when AIMessage has multiple reasoning blocks', async () => {
      const aiMessage = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'First thought...' },
          { type: 'reasoning', reasoning: 'Second thought...' },
        ],
      });

      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const sanitizedAiMessage = request.messages[0] as AIMessage;
      const contentBlocks = sanitizedAiMessage.content as TestContentBlock[];

      expect(contentBlocks).toHaveLength(3);
      expect(contentBlocks[0]).toEqual({ type: 'reasoning', reasoning: 'First thought...' });
      expect(contentBlocks[1]).toEqual({ type: 'reasoning', reasoning: 'Second thought...' });
      expect(contentBlocks[2]).toEqual({ type: 'text', text: '[interrupted]' });
    });

    it('should handle interrupted thinking mid-conversation', async () => {
      // Simulate: User → AI (thinking interrupted) → User follow-up
      const messages: BaseMessage[] = [
        new HumanMessage('Build a gear'),
        new AIMessage({
          content: [{ type: 'reasoning', reasoning: 'I need to calculate the gear parameters...' }],
        }),
        new HumanMessage('not a slice, the whole thing'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // Human messages should be unchanged
      expect((request.messages[0] as HumanMessage).content).toBe('Build a gear');
      expect((request.messages[2] as HumanMessage).content).toBe('not a slice, the whole thing');

      // Interrupted AI message should have text block added
      const sanitizedAiMessage = request.messages[1] as AIMessage;
      const contentBlocks = sanitizedAiMessage.content as TestContentBlock[];
      expect(contentBlocks).toHaveLength(2);
      expect(contentBlocks[0]).toEqual({
        type: 'reasoning',
        reasoning: 'I need to calculate the gear parameters...',
      });
      expect(contentBlocks[1]).toEqual({ type: 'text', text: '[interrupted]' });
    });
  });

  describe('AIMessages with text block containing empty string', () => {
    it('should add placeholder when text block has empty string', async () => {
      const aiMessage = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'Thinking...' },
          { type: 'text', text: '' },
        ],
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const sanitizedAiMessage = request.messages[0] as AIMessage;
      const contentBlocks = sanitizedAiMessage.content as TestContentBlock[];

      // Should have reasoning + the placeholder text block appended
      expect(contentBlocks).toHaveLength(3);
      expect(contentBlocks[0]).toEqual({ type: 'reasoning', reasoning: 'Thinking...' });
      expect(contentBlocks[1]).toEqual({ type: 'text', text: '' });
      expect(contentBlocks[2]).toEqual({ type: 'text', text: '[interrupted]' });
    });
  });

  describe('AIMessages with empty content', () => {
    it('should add placeholder text block when AIMessage has empty string content', async () => {
      const aiMessage = new AIMessage({ content: '' });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const sanitizedAiMessage = request.messages[0] as AIMessage;
      const contentBlocks = sanitizedAiMessage.content as TestContentBlock[];

      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({ type: 'text', text: '[interrupted]' });
    });

    it('should add placeholder text block when AIMessage has empty array content', async () => {
      const aiMessage = new AIMessage({ content: [] });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const sanitizedAiMessage = request.messages[0] as AIMessage;
      const contentBlocks = sanitizedAiMessage.content as TestContentBlock[];

      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({ type: 'text', text: '[interrupted]' });
    });

    it('should preserve invalid_tool_calls when adding placeholder text', async () => {
      const invalidToolCall: NonNullable<AIMessage['invalid_tool_calls']>[number] = {
        id: 'call_bad_args',
        name: 'read_file',
        args: '{"limit":40}{"targetFile":"main.ts"}',
        error: 'Malformed args.',
        type: 'invalid_tool_call',
      };
      const aiMessage = new AIMessage({
        content: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        invalid_tool_calls: [invalidToolCall],
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const sanitizedAiMessage = request.messages[0] as AIMessage;
      expect(sanitizedAiMessage.content).toEqual([{ type: 'text', text: '[interrupted]' }]);
      expect(sanitizedAiMessage.invalid_tool_calls).toEqual([invalidToolCall]);
    });
  });

  describe('AIMessages that should not be modified', () => {
    it('should not modify AIMessage with string content', async () => {
      const aiMessage = new AIMessage('Hello! I can help with that.');
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.content).toBe('Hello! I can help with that.');
    });

    it('should not modify AIMessage with text content blocks', async () => {
      const aiMessage = new AIMessage({
        content: [{ type: 'text', text: 'Some response' }],
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      const contentBlocks = result.content as TestContentBlock[];

      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({ type: 'text', text: 'Some response' });
    });

    it('should not modify AIMessage with reasoning AND text blocks', async () => {
      const aiMessage = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'Thinking...' },
          { type: 'text', text: 'Here is my answer' },
        ],
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      const contentBlocks = result.content as TestContentBlock[];

      expect(contentBlocks).toHaveLength(2);
      expect(contentBlocks[0]).toEqual({ type: 'reasoning', reasoning: 'Thinking...' });
      expect(contentBlocks[1]).toEqual({ type: 'text', text: 'Here is my answer' });
    });
  });

  describe('AIMessages with tool_calls should not be modified', () => {
    it('should not modify AIMessage with tool_calls and empty content', async () => {
      // `tool_use` blocks count as valid content for the Anthropic API,
      // and reconstructing these messages can break tool_use/tool_result pairing
      const aiMessage = new AIMessage({
        content: '',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_123', name: 'read_file', args: { path: '/test.txt' } }],
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;

      // Content should remain unchanged
      expect(result.content).toBe('');

      // Tool calls should be preserved
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]?.name).toBe('read_file');
    });

    it('should not modify AIMessage with tool_calls and only reasoning blocks', async () => {
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'I should read the file...' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_456', name: 'read_file', args: { path: '/main.ts' } }],
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      const contentBlocks = result.content as TestContentBlock[];

      // Content should remain unchanged — only reasoning, no text added
      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({ type: 'reasoning', reasoning: 'I should read the file...' });

      // Tool calls should be preserved
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]?.name).toBe('read_file');
    });
  });

  describe('non-AIMessage types should not be modified', () => {
    it('should not modify HumanMessage', async () => {
      const messages: BaseMessage[] = [new HumanMessage('Hello')];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect((request.messages[0] as HumanMessage).content).toBe('Hello');
    });

    it('should not modify ToolMessage', async () => {
      const messages: BaseMessage[] = [
        new ToolMessage({
          content: '{"result": "success"}',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_123',
          name: 'test_tool',
        }),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect((request.messages[0] as ToolMessage).content).toBe('{"result": "success"}');
    });
  });

  describe('preserves message properties', () => {
    it('should preserve message id', async () => {
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'Thinking...' }],
        id: 'msg_abc123',
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages[0]?.id).toBe('msg_abc123');
    });

    it('should preserve tool_calls by skipping messages that have them', async () => {
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'I should read the file' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: [{ id: 'call_456', name: 'read_file', args: { path: '/main.ts' } }],
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;

      // Message should be entirely unchanged (skipped by middleware)
      expect(result.tool_calls).toHaveLength(1);
      expect(result.tool_calls?.[0]?.name).toBe('read_file');
      const contentBlocks = result.content as TestContentBlock[];
      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]).toEqual({ type: 'reasoning', reasoning: 'I should read the file' });
    });

    it('should preserve additional_kwargs', async () => {
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'Thinking...' }],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: { custom: 'value' },
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages[0]?.additional_kwargs).toEqual({ custom: 'value' });
    });

    it('should drop provider-visible legacy tool metadata when adding interrupted placeholder', async () => {
      const aiMessage = new AIMessage({
        content: [],
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: {
          custom: 'value',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          tool_calls: [
            {
              id: 'call_empty_name',
              type: 'function',
              function: { name: '', arguments: '{}' },
            },
          ],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI-compatible legacy metadata uses snake_case
          function_call: { name: '', arguments: '{}' },
        },
      });
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.content).toEqual([{ type: 'text', text: '[interrupted]' }]);
      expect(result.additional_kwargs).toEqual({ custom: 'value' });
    });

    it('should preserve response_metadata when adding placeholder to array content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const responseMetadata = { model: 'claude-3-5-sonnet-20241022', stop_reason: 'end_turn' };
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'Thinking...' }],
        response_metadata: responseMetadata,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.response_metadata).toEqual(responseMetadata);
    });

    it('should preserve usage_metadata when adding placeholder to array content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const usageMetadata = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        input_token_details: { cache_read: 80, cache_creation: 20 },
      };
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'Thinking...' }],
        usage_metadata: usageMetadata,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.usage_metadata).toEqual(usageMetadata);
    });

    it('should preserve response_metadata when adding placeholder to empty content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const responseMetadata = { model: 'claude-3-5-sonnet-20241022' };
      const aiMessage = new AIMessage({
        content: '',
        response_metadata: responseMetadata,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.response_metadata).toEqual(responseMetadata);
    });

    it('should preserve usage_metadata when adding placeholder to empty content', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const usageMetadata = {
        input_tokens: 50,
        output_tokens: 10,
        total_tokens: 60,
        input_token_details: { cache_read: 0, cache_creation: 0 },
      };
      const aiMessage = new AIMessage({
        content: '',
        usage_metadata: usageMetadata,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;
      expect(result.usage_metadata).toEqual(usageMetadata);
    });

    it('should preserve all metadata properties together when sanitizing', async () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const responseMetadata = { model: 'claude-3-5-sonnet-20241022', stop_reason: 'end_turn' };
      const usageMetadata = {
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 300,
        input_token_details: { cache_read: 150, cache_creation: 50 },
      };
      const additionalKwargs = { custom: 'data' };
      const aiMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'Interrupted thinking...' }],
        id: 'msg_full_metadata',
        additional_kwargs: additionalKwargs,
        response_metadata: responseMetadata,
        usage_metadata: usageMetadata,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- Re-enable naming convention after LangChain metadata */
      const messages: BaseMessage[] = [aiMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const result = request.messages[0] as AIMessage;

      const contentBlocks = result.content as TestContentBlock[];
      expect(contentBlocks).toHaveLength(2);
      expect(contentBlocks[1]).toEqual({ type: 'text', text: '[interrupted]' });

      expect(result.id).toBe('msg_full_metadata');
      expect(result.additional_kwargs).toEqual(additionalKwargs);
      expect(result.response_metadata).toEqual(responseMetadata);
      expect(result.usage_metadata).toEqual(usageMetadata);
    });
  });

  describe('immutability', () => {
    it('should not mutate the original messages array', async () => {
      const originalMessage = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'Thinking...' }],
      });
      const messages: BaseMessage[] = [originalMessage];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      // Original message content should still be unchanged
      const contentBlocks = originalMessage.content as TestContentBlock[];
      expect(contentBlocks).toHaveLength(1);
      expect(contentBlocks[0]?.type).toBe('reasoning');
    });

    it('should create a new array with sanitized messages', async () => {
      const messages: BaseMessage[] = [
        new AIMessage({
          content: [{ type: 'reasoning', reasoning: 'Thinking...' }],
        }),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages).not.toBe(messages);
    });
  });

  describe('orphaned tool calls (interrupted tool execution)', () => {
    it('should insert synthetic ToolMessage when AIMessage has tool_calls but no following ToolMessages', async () => {
      // Simulate: AI calls a tool → user interrupts → sends new message
      const messages: BaseMessage[] = [
        new HumanMessage('Build a gear'),
        new AIMessage({
          content: [{ type: 'text', text: 'Let me create that for you.' }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_abc', name: 'create_file', args: { targetFile: 'gear.ts' } }],
        }),
        // No ToolMessage follows — stream was interrupted
        new HumanMessage('Actually, make it a cylinder'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // Should have 4 messages: Human, AI, synthetic ToolMessage, Human
      expect(request.messages).toHaveLength(4);

      // The synthetic ToolMessage should be inserted after the AIMessage
      const syntheticTool = request.messages[2] as ToolMessage;
      expect(syntheticTool).toBeInstanceOf(ToolMessage);

      const toolContent = JSON.parse(syntheticTool.content as string) as Record<string, unknown>;
      expect(toolContent).toEqual({
        errorCode: 'USER_INTERRUPTED',
        message: 'Tool execution was interrupted.',
        toolName: 'create_file',
        toolCallId: 'call_abc',
      });

      expect(syntheticTool.tool_call_id).toBe('call_abc');
      expect(syntheticTool.name).toBe('create_file');
      expect(syntheticTool.status).toBe('error');
    });

    it('should insert synthetic ToolMessage when AIMessage with tool_calls is the last message', async () => {
      // Edge case: tool call is at the very end of the conversation (no following messages)
      const messages: BaseMessage[] = [
        new HumanMessage('Read the file'),
        new AIMessage({
          content: [{ type: 'text', text: 'Reading...' }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_end', name: 'read_file', args: { targetFile: 'test.ts' } }],
        }),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      expect(request.messages).toHaveLength(3);
      const syntheticTool = request.messages[2] as ToolMessage;
      expect(syntheticTool).toBeInstanceOf(ToolMessage);

      const toolContent = JSON.parse(syntheticTool.content as string) as Record<string, unknown>;
      expect(toolContent).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: 'read_file',
        toolCallId: 'call_end',
      });
    });

    it('should not insert synthetic ToolMessages when all tool_calls have matching ToolMessages', async () => {
      const messages: BaseMessage[] = [
        new HumanMessage('Build a gear'),
        new AIMessage({
          content: [{ type: 'text', text: 'Creating the file.' }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_matched', name: 'create_file', args: { targetFile: 'gear.ts' } }],
        }),
        new ToolMessage({
          content: '{"success": true}',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_matched',
          name: 'create_file',
        }),
        new HumanMessage('Looks good'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // No synthetic messages should be inserted
      expect(request.messages).toHaveLength(4);
      expect((request.messages[2] as ToolMessage).content).toBe('{"success": true}');
    });

    it('should insert only missing ToolMessages when AIMessage has multiple tool_calls partially matched', async () => {
      const messages: BaseMessage[] = [
        new AIMessage({
          content: [{ type: 'text', text: 'Running two tools.' }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [
            { id: 'call_1', name: 'read_file', args: { targetFile: 'a.ts' } },
            { id: 'call_2', name: 'create_file', args: { targetFile: 'b.ts' } },
          ],
        }),
        // Only one ToolMessage — the second tool was interrupted
        new ToolMessage({
          content: '{"content": "file a"}',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_1',
          name: 'read_file',
        }),
        new HumanMessage('Continue'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // Should have 4 messages: AI, synthetic ToolMessage, existing ToolMessage, Human
      // (synthetic is inserted right after the AIMessage, before existing ToolMessages)
      expect(request.messages).toHaveLength(4);

      // First ToolMessage should be synthetic (for the orphaned call_2)
      const syntheticTool = request.messages[1] as ToolMessage;
      expect(syntheticTool).toBeInstanceOf(ToolMessage);

      const toolContent = JSON.parse(syntheticTool.content as string) as Record<string, unknown>;
      expect(toolContent).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: 'create_file',
        toolCallId: 'call_2',
      });

      // Second ToolMessage should be the original (for call_1)
      expect((request.messages[2] as ToolMessage).content).toBe('{"content": "file a"}');

      // Human message should be last
      expect((request.messages[3] as HumanMessage).content).toBe('Continue');
    });

    it('should handle multiple interrupted tool calls in a conversation', async () => {
      // Two separate AIMessages with orphaned tool calls
      const messages: BaseMessage[] = [
        new HumanMessage('First task'),
        new AIMessage({
          content: [{ type: 'text', text: 'Working on first.' }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_first', name: 'create_file', args: {} }],
        }),
        // Interrupted — no ToolMessage
        new HumanMessage('Second task'),
        new AIMessage({
          content: [{ type: 'text', text: 'Working on second.' }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_second', name: 'edit_file', args: {} }],
        }),
        // Also interrupted
        new HumanMessage('Third task'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // Should insert 2 synthetic ToolMessages: 7 total
      expect(request.messages).toHaveLength(7);

      // First synthetic after first AI
      const firstSynthetic = request.messages[2] as ToolMessage;
      expect(firstSynthetic).toBeInstanceOf(ToolMessage);

      expect(firstSynthetic.tool_call_id).toBe('call_first');

      // Second synthetic after second AI
      const secondSynthetic = request.messages[5] as ToolMessage;
      expect(secondSynthetic).toBeInstanceOf(ToolMessage);

      expect(secondSynthetic.tool_call_id).toBe('call_second');
    });

    it('should be idempotent -- synthetic ToolMessages already present should not be duplicated', async () => {
      // Simulate a second turn where synthetic ToolMessages were already inserted previously
      const syntheticContent = JSON.stringify({
        errorCode: 'USER_INTERRUPTED',
        message: 'Tool execution was interrupted.',
        toolName: 'create_file',
        toolCallId: 'call_existing',
      });

      const messages: BaseMessage[] = [
        new AIMessage({
          content: [{ type: 'text', text: 'Creating file.' }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_existing', name: 'create_file', args: {} }],
        }),
        // This is a synthetic ToolMessage from a previous run
        new ToolMessage({
          content: syntheticContent,
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_existing',
          name: 'create_file',
          status: 'error',
        }),
        new HumanMessage('Try again'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // Should NOT insert any additional synthetic messages — already matched
      expect(request.messages).toHaveLength(3);
    });
  });

  describe('partial-input output-error parts (interrupted tools)', () => {
    /**
     * The sanitizer operates on the provider-agnostic LangChain BaseMessage shape after
     * `toBaseMessages` has flattened MyUIMessage parts. Each test below mirrors the wire
     * mental model of one provider so we can assert that the orphaned-tool insertion produces
     * a tool_call/tool_result pair the provider will accept (Finding 4 in the research doc).
     */
    it('should pair Anthropic tool_use with synthetic tool_result preserving partial args', async () => {
      const messages: BaseMessage[] = [
        new HumanMessage('Inspect main.ts.'),
        new AIMessage({
          content: [
            { type: 'text', text: 'Reading the file…' },
            {
              type: 'tool_use',
              id: 'toolu_anthropic_partial',
              name: 'read_file',
              input: { limit: 15 },
            },
          ],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'toolu_anthropic_partial', name: 'read_file', args: { limit: 15 } }],
        }),
        new HumanMessage('continue'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const synthetic = request.messages.find(
        (message): message is ToolMessage =>
          ToolMessage.isInstance(message) && message.tool_call_id === 'toolu_anthropic_partial',
      );
      if (!synthetic) {
        throw new Error('expected synthetic ToolMessage paired with Anthropic tool_use');
      }
      expect(synthetic.name).toBe('read_file');
      expect(synthetic.status).toBe('error');
      const content = JSON.parse(synthetic.content as string) as Record<string, unknown>;
      expect(content).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: 'read_file',
        toolCallId: 'toolu_anthropic_partial',
      });
    });

    it('should pair Vertex functionCall with synthetic functionResponse preserving partial args', async () => {
      const messages: BaseMessage[] = [
        new HumanMessage('Run the search.'),
        new AIMessage({
          content: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'fn_vertex_partial', name: 'web_search', args: { query: 'gears' } }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          additional_kwargs: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- Vertex wire field uses snake_case
            function_call: { name: 'web_search', arguments: '{"query":"gears"}' },
          },
        }),
        new HumanMessage('actually never mind'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const synthetic = request.messages.find(
        (message): message is ToolMessage =>
          ToolMessage.isInstance(message) && message.tool_call_id === 'fn_vertex_partial',
      );
      if (!synthetic) {
        throw new Error('expected synthetic ToolMessage paired with Vertex functionCall');
      }
      expect(synthetic.name).toBe('web_search');
      expect(synthetic.status).toBe('error');
      const content = JSON.parse(synthetic.content as string) as Record<string, unknown>;
      expect(content).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: 'web_search',
        toolCallId: 'fn_vertex_partial',
      });
    });

    it('should pair OpenAI tool_calls with synthetic tool message preserving partial args', async () => {
      const messages: BaseMessage[] = [
        new HumanMessage('Open file.'),
        new AIMessage({
          content: '',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_openai_partial', name: 'read_file', args: { limit: 15 } }],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          additional_kwargs: {
            // eslint-disable-next-line @typescript-eslint/naming-convention -- OpenAI wire field uses snake_case
            tool_calls: [
              {
                id: 'call_openai_partial',
                type: 'function',
                function: { name: 'read_file', arguments: '{"limit":15}' },
              },
            ],
          },
        }),
        new HumanMessage('continue'),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      const synthetic = request.messages.find(
        (message): message is ToolMessage =>
          ToolMessage.isInstance(message) && message.tool_call_id === 'call_openai_partial',
      );
      if (!synthetic) {
        throw new Error('expected synthetic ToolMessage paired with OpenAI tool_call');
      }
      expect(synthetic.name).toBe('read_file');
      expect(synthetic.status).toBe('error');
      const content = JSON.parse(synthetic.content as string) as Record<string, unknown>;
      expect(content).toMatchObject({
        errorCode: 'USER_INTERRUPTED',
        toolName: 'read_file',
        toolCallId: 'call_openai_partial',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty messages array', async () => {
      const messages: BaseMessage[] = [];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];
      expect(request.messages).toHaveLength(0);
    });

    it('should handle mixed message types in conversation', async () => {
      const messages: BaseMessage[] = [
        new HumanMessage('Build a gear'),
        new AIMessage({
          content: [{ type: 'reasoning', reasoning: 'Interrupted thinking...' }],
        }),
        new HumanMessage('Try again'),
        new AIMessage({
          content: [
            { type: 'reasoning', reasoning: 'Let me think again...' },
            { type: 'text', text: 'Here is the gear design.' },
          ],
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_calls: [{ id: 'call_1', name: 'create_file', args: {} }],
        }),
        new ToolMessage({
          content: '{"success": true}',
          // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
          tool_call_id: 'call_1',
          name: 'create_file',
        }),
      ];

      await invokeWrapModelCall(messageContentSanitizerMiddleware, { messages }, handler);

      const [request] = handler.mock.calls[0] as [{ messages: BaseMessage[] }];

      // First AI message (interrupted) should have text block added
      const firstAi = request.messages[1] as AIMessage;
      const firstAiBlocks = firstAi.content as TestContentBlock[];
      expect(firstAiBlocks).toHaveLength(2);
      expect(firstAiBlocks[1]).toEqual({ type: 'text', text: '[interrupted]' });

      // Second AI message (has text block) should be unchanged
      const secondAi = request.messages[3] as AIMessage;
      const secondAiBlocks = secondAi.content as TestContentBlock[];
      expect(secondAiBlocks).toHaveLength(2);
      expect(secondAiBlocks[0]).toEqual({ type: 'reasoning', reasoning: 'Let me think again...' });
      expect(secondAiBlocks[1]).toEqual({ type: 'text', text: 'Here is the gear design.' });

      // Human and tool messages should be unchanged
      expect((request.messages[0] as HumanMessage).content).toBe('Build a gear');
      expect((request.messages[2] as HumanMessage).content).toBe('Try again');
      expect((request.messages[4] as ToolMessage).content).toBe('{"success": true}');
    });
  });
});
