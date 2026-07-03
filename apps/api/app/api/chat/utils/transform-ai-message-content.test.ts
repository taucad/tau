import { AIMessage } from '@langchain/core/messages';
import { describe, it, expect } from 'vitest';
import { transformAiMessageContent } from '#api/chat/utils/transform-ai-message-content.js';

const toUpperCase = (text: string): string => text.toUpperCase();
const identity = (text: string): string => text;

describe('transformAiMessageContent', () => {
  describe('string content', () => {
    it('should apply fn to string content', () => {
      const message = new AIMessage({ content: 'hello world' });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result.content).toBe('HELLO WORLD');
    });

    it('should short-circuit when fn returns identical string', () => {
      const message = new AIMessage({ content: 'unchanged' });
      const result = transformAiMessageContent(message, identity);
      expect(result).toBe(message);
    });
  });

  describe('array content — text blocks', () => {
    it('should apply fn to text block text', () => {
      const message = new AIMessage({
        content: [{ type: 'text', text: 'hello' }],
      });
      const result = transformAiMessageContent(message, toUpperCase);
      const blocks = result.content as Array<{ type: string; text: string }>;
      expect(blocks[0]!.text).toBe('HELLO');
    });

    it('should short-circuit when no text blocks are changed', () => {
      const message = new AIMessage({
        content: [{ type: 'text', text: 'ALREADY UPPER' }],
      });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result).toBe(message);
    });
  });

  describe('array content — reasoning blocks', () => {
    it('should apply fn to reasoning block reasoning', () => {
      const message = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'thinking' }],
      });
      const result = transformAiMessageContent(message, toUpperCase);
      const blocks = result.content as Array<{ type: string; reasoning: string }>;
      expect(blocks[0]!.reasoning).toBe('THINKING');
    });

    it('should short-circuit when no reasoning blocks are changed', () => {
      const message = new AIMessage({
        content: [{ type: 'reasoning', reasoning: 'UPPER' }],
      });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result).toBe(message);
    });
  });

  describe('mixed content', () => {
    it('should apply fn to both text and reasoning blocks', () => {
      const message = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'thinking' },
          { type: 'text', text: 'response' },
        ],
      });
      const result = transformAiMessageContent(message, toUpperCase);
      const blocks = result.content as Array<{ type: string; reasoning?: string; text?: string }>;
      expect(blocks[0]!.reasoning).toBe('THINKING');
      expect(blocks[1]!.text).toBe('RESPONSE');
    });

    it('should not modify non-text, non-reasoning blocks', () => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain multimodal content block format
      const imageBlock = { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } };
      const message = new AIMessage({
        content: [imageBlock, { type: 'text', text: 'caption' }],
      });
      const result = transformAiMessageContent(message, toUpperCase);
      const blocks = result.content as Array<Record<string, unknown>>;
      expect(blocks[0]).toEqual(imageBlock);
      expect(blocks[1]).toEqual({ type: 'text', text: 'CAPTION' });
    });

    it('should only transform blocks that change', () => {
      const message = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'ALREADY UPPER' },
          { type: 'text', text: 'needs change' },
        ],
      });
      const result = transformAiMessageContent(message, toUpperCase);
      const blocks = result.content as Array<{ type: string; reasoning?: string; text?: string }>;
      expect(blocks[0]!.reasoning).toBe('ALREADY UPPER');
      expect(blocks[1]!.text).toBe('NEEDS CHANGE');
    });
  });

  describe('metadata preservation', () => {
    it('should preserve message id', () => {
      const message = new AIMessage({ content: 'hello', id: 'msg_123' });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result.id).toBe('msg_123');
    });

    it('should preserve tool_calls', () => {
      const toolCalls = [{ id: 'call_1', name: 'read_file', args: { path: '/main.ts' } }];
      const message = new AIMessage({
        content: 'hello',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        tool_calls: toolCalls,
      });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result.tool_calls).toEqual(toolCalls);
    });

    it('should preserve additional_kwargs', () => {
      const message = new AIMessage({
        content: 'hello',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        additional_kwargs: { custom: 'value' },
      });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result.additional_kwargs).toEqual({ custom: 'value' });
    });

    it('should preserve invalid_tool_calls', () => {
      const invalidToolCalls = [
        {
          id: 'call_bad',
          name: 'read_file',
          args: '{"targetFile":',
          error: 'Malformed args.',
          type: 'invalid_tool_call',
        },
      ];
      const message = new AIMessage({
        content: 'hello',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- LangChain API uses snake_case
        invalid_tool_calls: invalidToolCalls,
      });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result.invalid_tool_calls).toEqual(invalidToolCalls);
    });

    it('should preserve response_metadata', () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const responseMetadata = { model: 'claude-3-5-sonnet-20241022', stop_reason: 'end_turn' };
      const message = new AIMessage({
        content: 'hello',
        response_metadata: responseMetadata,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result.response_metadata).toEqual(responseMetadata);
    });

    it('should preserve usage_metadata', () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const usageMetadata = {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        input_token_details: { cache_read: 80, cache_creation: 20 },
      };
      const message = new AIMessage({
        content: 'hello',
        usage_metadata: usageMetadata,
      });
      /* eslint-enable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result.usage_metadata).toEqual(usageMetadata);
    });

    it('should preserve all metadata together when transforming array content', () => {
      /* eslint-disable @typescript-eslint/naming-convention -- LangChain API uses snake_case */
      const toolCalls = [{ id: 'call_1', name: 'edit_file', args: {} }];
      const responseMetadata = { model: 'gpt-4o' };
      const usageMetadata = {
        input_tokens: 200,
        output_tokens: 100,
        total_tokens: 300,
        input_token_details: { cache_read: 0, cache_creation: 0 },
      };
      const message = new AIMessage({
        content: [
          { type: 'reasoning', reasoning: 'thinking' },
          { type: 'text', text: 'response' },
        ],
        id: 'msg_all_meta',
        tool_calls: toolCalls,
        additional_kwargs: { custom: 'data' },
        response_metadata: responseMetadata,
        usage_metadata: usageMetadata,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- AIMessage constructor union type
      } as any);
      /* eslint-enable @typescript-eslint/naming-convention -- LangChain API uses snake_case */

      const result = transformAiMessageContent(message, toUpperCase);
      const blocks = result.content as Array<{ type: string; reasoning?: string; text?: string }>;

      expect(blocks[0]!.reasoning).toBe('THINKING');
      expect(blocks[1]!.text).toBe('RESPONSE');
      expect(result.id).toBe('msg_all_meta');
      expect(result.tool_calls).toEqual(toolCalls);
      expect(result.additional_kwargs).toEqual({ custom: 'data' });
      expect(result.response_metadata).toEqual(responseMetadata);
      expect(result.usage_metadata).toEqual(usageMetadata);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string content', () => {
      const message = new AIMessage({ content: '' });
      const result = transformAiMessageContent(message, toUpperCase);
      expect(result).toBe(message);
    });

    it('should handle empty array content', () => {
      const message = new AIMessage({ content: [] });
      const result = transformAiMessageContent(message, identity);
      expect(result).toBe(message);
    });
  });
});
