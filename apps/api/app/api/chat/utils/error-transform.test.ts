import { describe, it, expect } from 'vitest';
import type { UIMessageChunk } from 'ai';
import type { ChatError } from '@taucad/types';
import { createErrorTransform } from '#api/chat/utils/error-transform.js';

/**
 * Helper to parse a normalized error JSON string.
 */
function parseNormalizedError(jsonString: string): ChatError {
  return JSON.parse(jsonString) as ChatError;
}

const anthropicCreditMessage =
  'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';

const statusPrefixedAnthropicCreditErrorText = `400 {"type":"error","error":{"type":"invalid_request_error","message":"${anthropicCreditMessage}"}}`;

/**
 * Helper to read all chunks from a reader.
 */
async function readAllChunks(reader: ReadableStreamDefaultReader<UIMessageChunk>): Promise<UIMessageChunk[]> {
  const result = await reader.read();
  if (result.done) {
    return [];
  }

  const rest = await readAllChunks(reader);
  return [result.value, ...rest];
}

/**
 * Helper to process chunks through the error transform.
 */
async function processChunks(chunks: UIMessageChunk[]): Promise<UIMessageChunk[]> {
  const transform = createErrorTransform();
  const reader = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }

      controller.close();
    },
  })
    .pipeThrough(transform)
    .getReader();

  return readAllChunks(reader);
}

describe('createErrorTransform', () => {
  describe('non-error chunks', () => {
    it('should pass through text chunks unchanged', async () => {
      const textChunk: UIMessageChunk = {
        type: 'text-delta',
        delta: 'Hello, world!',
        id: 'msg_1',
      };

      const results = await processChunks([textChunk]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(textChunk);
    });

    it('should pass through tool-input chunks unchanged', async () => {
      const toolChunk: UIMessageChunk = {
        type: 'tool-input-available',
        toolCallId: 'call_123',
        toolName: 'read_file',
        input: { path: '/test.txt' },
      };

      const results = await processChunks([toolChunk]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual(toolChunk);
    });

    it('should pass through multiple non-error chunks in order', async () => {
      const chunks: UIMessageChunk[] = [
        { type: 'text-delta', delta: 'First', id: 'msg_1' },
        { type: 'text-delta', delta: 'Second', id: 'msg_1' },
        { type: 'text-delta', delta: 'Third', id: 'msg_1' },
      ];

      const results = await processChunks(chunks);

      expect(results).toHaveLength(3);
      expect((results[0] as { delta: string }).delta).toBe('First');
      expect((results[1] as { delta: string }).delta).toBe('Second');
      expect((results[2] as { delta: string }).delta).toBe('Third');
    });
  });

  describe('error chunks', () => {
    it('should transform error chunk with plain error message', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'Something went wrong',
      };

      const results = await processChunks([errorChunk]);

      expect(results).toHaveLength(1);
      const result = results[0] as { type: 'error'; errorText: string };
      expect(result.type).toBe('error');

      const normalizedError = parseNormalizedError(result.errorText);
      expect(normalizedError.category).toBe('generic');
      expect(normalizedError.message).toBe('Something went wrong');
      expect(normalizedError.title).toBe('Error');
    });

    it('should detect rate limit error from message pattern', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'Rate limit exceeded',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('rate_limit');
      expect(normalizedError.title).toBe('Rate Limit Exceeded');
    });

    it('should detect tool_use/tool_result error pattern', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'tool_use block must be followed by a tool_result block',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('tool_error');
      expect(normalizedError.message).toContain('tool_use');
      expect(normalizedError.message).toContain('tool_result');
    });

    it('should detect overloaded error pattern', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'The server is overloaded',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('overloaded');
      expect(normalizedError.title).toBe('Service Temporarily Unavailable');
    });

    it('should detect authentication error pattern', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'Invalid API key',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('auth');
      expect(normalizedError.title).toBe('Authentication Error');
    });

    it('should detect credit-related error pattern', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'Your credit balance is too low',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('credits');
      expect(normalizedError.title).toBe('Credit Limit Reached');
    });

    it('should preserve raw error message in normalized output', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'tool_use and tool_result mismatch',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      // Raw should be unformatted
      expect(normalizedError.raw).toBe('tool_use and tool_result mismatch');
      expect(normalizedError.raw).not.toContain('`');
    });
  });

  describe('mixed chunks', () => {
    it('should process mixed chunk types correctly', async () => {
      const chunks: UIMessageChunk[] = [
        { type: 'text-delta', delta: 'Starting operation...', id: 'msg_1' },
        { type: 'tool-input-available', toolCallId: 'call_1', toolName: 'test_tool', input: {} },
        { type: 'error', errorText: 'Operation failed' },
      ];

      const results = await processChunks(chunks);

      expect(results).toHaveLength(3);
      expect((results[0] as { type: string }).type).toBe('text-delta');
      expect((results[1] as { type: string }).type).toBe('tool-input-available');
      expect((results[2] as { type: string }).type).toBe('error');

      // Only the error chunk should be transformed
      const errorResult = results[2] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(errorResult.errorText);
      expect(normalizedError.category).toBe('generic');
    });

    it('should transform multiple error chunks in sequence', async () => {
      const chunks: UIMessageChunk[] = [
        { type: 'error', errorText: 'Rate limit exceeded' },
        { type: 'error', errorText: 'Authentication failed' },
      ];

      const results = await processChunks(chunks);

      expect(results).toHaveLength(2);

      const firstError = parseNormalizedError((results[0] as { errorText: string }).errorText);
      const secondError = parseNormalizedError((results[1] as { errorText: string }).errorText);

      expect(firstError.category).toBe('rate_limit');
      expect(secondError.category).toBe('auth');
    });
  });

  describe('JSON error message parsing', () => {
    it('should parse "400 {...}" format from error text', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: '400 {"type":"error","error":{"type":"invalid_request_error","message":"Bad request"}}',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('tool_error');
      expect(normalizedError.httpStatus).toBe(400);
      expect(normalizedError.message).toBe('Bad request');
    });

    it('should classify status-prefixed Anthropic billing error text as credits', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: statusPrefixedAnthropicCreditErrorText,
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('credits');
      expect(normalizedError.title).toBe('Credit Limit Reached');
      expect(normalizedError.message).toBe(anthropicCreditMessage);
      expect(normalizedError.code).toBe('invalid_request_error');
      expect(normalizedError.httpStatus).toBe(400);
    });

    it('should parse pure JSON Anthropic error format', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: '{"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"}}',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.category).toBe('rate_limit');
      expect(normalizedError.message).toBe('Rate limit exceeded');
      expect(normalizedError.code).toBe('rate_limit_error');
    });

    it('should extract request_id from parsed JSON', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText:
          '{"type":"error","error":{"type":"api_error","message":"Internal error"},"request_id":"req-test-123"}',
      };

      const results = await processChunks([errorChunk]);
      const result = results[0] as { type: 'error'; errorText: string };
      const normalizedError = parseNormalizedError(result.errorText);

      expect(normalizedError.requestId).toBe('req-test-123');
    });
  });

  describe('error category titles', () => {
    it('should set correct title for generic error', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'Unknown error occurred',
      };

      const results = await processChunks([errorChunk]);
      const normalizedError = parseNormalizedError((results[0] as { errorText: string }).errorText);

      expect(normalizedError.title).toBe('Error');
    });

    it('should set correct title for rate_limit error', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'Too many requests',
      };

      const results = await processChunks([errorChunk]);
      const normalizedError = parseNormalizedError((results[0] as { errorText: string }).errorText);

      expect(normalizedError.title).toBe('Rate Limit Exceeded');
    });

    it('should set correct title for overloaded error', async () => {
      const errorChunk: UIMessageChunk = {
        type: 'error',
        errorText: 'Server is at maximum capacity',
      };

      const results = await processChunks([errorChunk]);
      const normalizedError = parseNormalizedError((results[0] as { errorText: string }).errorText);

      expect(normalizedError.title).toBe('Service Temporarily Unavailable');
    });
  });
});
