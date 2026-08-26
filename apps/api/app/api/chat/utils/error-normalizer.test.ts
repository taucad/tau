/* eslint-disable @typescript-eslint/naming-convention -- Test file uses external API shapes with snake_case properties */
import type { ChatError } from '@taucad/types';
import { describe, it, expect } from 'vitest';
import { normalizeError } from '#api/chat/utils/error-normalizer.js';
import { CompactionPipelineError } from '#api/chat/utils/compaction-errors.js';

function parseNormalizedError(result: string): ChatError {
  return JSON.parse(result) as ChatError;
}

const anthropicCreditMessage =
  'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';

const statusPrefixedAnthropicCreditErrorText = `400 {"type":"error","error":{"type":"invalid_request_error","message":"${anthropicCreditMessage}"}}`;
const googleInvalidArgumentByteList = [
  ...new TextEncoder().encode(
    JSON.stringify([
      {
        error: {
          code: 400,
          message: 'Request contains an invalid argument.',
          errors: [{ message: 'Request contains an invalid argument.', domain: 'global', reason: 'badRequest' }],
          status: 'INVALID_ARGUMENT',
        },
      },
    ]),
  ),
].join(',');

describe('normalizeError', () => {
  describe('generic errors', () => {
    it('should handle plain string error', () => {
      const result = parseNormalizedError(normalizeError('Something went wrong'));

      expect(result.category).toBe('generic');
      expect(result.title).toBe('Error');
      expect(result.message).toBe('Something went wrong');
      expect(result.raw).toBe('Something went wrong');
    });

    it('should handle Error instance', () => {
      const error = new Error('Test error message');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('generic');
      expect(result.message).toBe('Test error message');
    });

    it('should handle non-string, non-Error values', () => {
      const result = parseNormalizedError(normalizeError({ custom: 'object' }));

      expect(result.category).toBe('generic');
      expect(result.message).toBe('[object Object]');
    });
  });

  describe('implementation bug errors', () => {
    it('should preserve compaction failure metadata from the error object', () => {
      const error = new CompactionPipelineError('Required compaction failed', 'morph_contract_error', {
        debugId: 'dat_debug',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
      expect(result.code).toBe('CONTEXT_COMPACTION_FAILED');
      expect(result.message).toContain('Failure kind: morph_contract_error');
      expect(result.message).toContain('Debug ID: dat_debug');
      expect(result.raw).toContain('CONTEXT_COMPACTION_FAILED');
    });

    it('should preserve compaction failure metadata from stream error text', () => {
      const result = parseNormalizedError(
        normalizeError(
          new Error(
            'CONTEXT_COMPACTION_FAILED: Required compaction failed failureKind=transcript_commit_failed failureDisposition=blocked_before_provider debugId=dat_debug',
          ),
        ),
      );

      expect(result.category).toBe('tool_error');
      expect(result.code).toBe('CONTEXT_COMPACTION_FAILED');
      expect(result.message).toContain('Failure kind: transcript_commit_failed');
      expect(result.message).toContain('Debug ID: dat_debug');
    });
  });

  describe('abort errors', () => {
    it('should detect AbortError by name', () => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('cancelled');
      expect(result.title).toBe('Request Cancelled');
    });

    it('should detect abort error by message containing "aborted"', () => {
      const error = new Error('Request was aborted by user');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('cancelled');
      expect(result.title).toBe('Request Cancelled');
    });

    it('should detect abort error by message containing "Aborted"', () => {
      const error = new Error('Aborted');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('cancelled');
      expect(result.title).toBe('Request Cancelled');
      expect(result.raw).toBe('Aborted');
    });

    it('should preserve raw message for abort errors', () => {
      const error = new Error('Operation aborted due to timeout');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('cancelled');
      expect(result.raw).toBe('Operation aborted due to timeout');
    });
  });

  describe('LangChain error codes', () => {
    it('should detect INVALID_TOOL_RESULTS and set tool_error category', () => {
      const error = Object.assign(new Error('Tool results mismatch'), {
        lc_error_code: 'INVALID_TOOL_RESULTS',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
      expect(result.code).toBe('INVALID_TOOL_RESULTS');
    });

    it('should detect MODEL_RATE_LIMIT and set rate_limit category', () => {
      const error = Object.assign(new Error('Rate limit exceeded'), {
        lc_error_code: 'MODEL_RATE_LIMIT',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('rate_limit');
      expect(result.code).toBe('MODEL_RATE_LIMIT');
      expect(result.title).toBe('Rate Limit Exceeded');
    });

    it('should detect MODEL_AUTHENTICATION and set auth category', () => {
      const error = Object.assign(new Error('Authentication failed'), {
        lc_error_code: 'MODEL_AUTHENTICATION',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('auth');
      expect(result.code).toBe('MODEL_AUTHENTICATION');
    });

    it('should detect GRAPH_RECURSION_LIMIT and set server category', () => {
      const error = Object.assign(new Error('Recursion limit exceeded'), {
        lc_error_code: 'GRAPH_RECURSION_LIMIT',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('server');
      expect(result.code).toBe('GRAPH_RECURSION_LIMIT');
    });

    it('should detect OUTPUT_PARSING_FAILURE and set tool_error category', () => {
      const error = Object.assign(new Error('Failed to parse output'), {
        lc_error_code: 'OUTPUT_PARSING_FAILURE',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
      expect(result.code).toBe('OUTPUT_PARSING_FAILURE');
    });
  });

  describe('HTTP status codes', () => {
    it('should detect 400 status as tool_error', () => {
      const error = Object.assign(new Error('Bad request'), { status: 400 });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
      expect(result.httpStatus).toBe(400);
    });

    it('should decode Google byte-list invalid argument errors', () => {
      const result = parseNormalizedError(
        normalizeError(new Error(`Google request failed with status code 400: ${googleInvalidArgumentByteList}`)),
      );

      expect(result.category).toBe('tool_error');
      expect(result.httpStatus).toBe(400);
      expect(result.code).toBe('INVALID_ARGUMENT');
      expect(result.message).toBe('Request contains an invalid argument.');
    });

    it('should detect 401 status as auth', () => {
      const error = Object.assign(new Error('Unauthorized'), { status: 401 });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('auth');
      expect(result.httpStatus).toBe(401);
    });

    it('should detect 403 status as credits', () => {
      const error = Object.assign(new Error('Forbidden'), { status: 403 });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('credits');
      expect(result.httpStatus).toBe(403);
    });

    it('should detect 429 status as rate_limit', () => {
      const error = Object.assign(new Error('Too many requests'), { status: 429 });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('rate_limit');
      expect(result.httpStatus).toBe(429);
    });

    it('should detect 503 status as overloaded', () => {
      const error = Object.assign(new Error('Service unavailable'), { status: 503 });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('overloaded');
      expect(result.httpStatus).toBe(503);
    });

    it('should detect 529 status as overloaded', () => {
      const error = Object.assign(new Error('Overloaded'), { status: 529 });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('overloaded');
      expect(result.httpStatus).toBe(529);
    });

    it('should detect 500+ status as server', () => {
      const error = Object.assign(new Error('Internal server error'), { status: 500 });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('server');
      expect(result.httpStatus).toBe(500);
    });
  });

  describe('request ID extraction', () => {
    it('should extract requestID from error', () => {
      const error = Object.assign(new Error('Error'), { requestID: 'req-123' });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.requestId).toBe('req-123');
    });

    it('should extract request_id from error', () => {
      const error = Object.assign(new Error('Error'), { request_id: 'req-456' });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.requestId).toBe('req-456');
    });

    it('should extract request_id from nested error object', () => {
      const error = Object.assign(new Error('Error'), {
        error: { request_id: 'req-789' },
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.requestId).toBe('req-789');
    });
  });

  describe('LangChain wrapped Anthropic errors', () => {
    it('should extract message from nested error.error.error structure', () => {
      // This is the exact structure LangChain creates when wrapping Anthropic errors
      const error = Object.assign(
        new Error(
          '400 {"type":"error","error":,"request_id":"req_123"}\n\nTroubleshooting URL: https://js.langchain.com/docs/troubleshooting/errors/INVALID_TOOL_RESULTS/\n',
        ),
        {
          status: 400,
          lc_error_code: 'INVALID_TOOL_RESULTS',
          requestID: 'req_123',
          error: {
            type: 'error',
            error: {
              type: 'invalid_request_error',
              message: 'tool_use ids were found without tool_result blocks: toolu_123, toolu_456',
            },
            request_id: 'req_123',
          },
        },
      );

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
      expect(result.code).toBe('INVALID_TOOL_RESULTS');
      expect(result.httpStatus).toBe(400);
      expect(result.requestId).toBe('req_123');
      // Should extract the actual message from nested structure, not the malformed message string
      // Note: message will have markdown formatting (backticks around tool_use, tool_result, etc.)
      expect(result.message).toContain('ids were found without');
      expect(result.message).toContain('blocks');
      // Should extract the help URL from the message
      expect(result.helpUrl).toBe('https://js.langchain.com/docs/troubleshooting/errors/INVALID_TOOL_RESULTS/');
    });

    it('should handle nested error with rate_limit_error type', () => {
      const error = Object.assign(new Error('429 rate limit'), {
        status: 429,
        lc_error_code: 'MODEL_RATE_LIMIT',
        error: {
          type: 'error',
          error: {
            type: 'rate_limit_error',
            message: 'Rate limit exceeded. Please retry after 60 seconds.',
          },
          request_id: 'req_rate',
        },
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('rate_limit');
      expect(result.message).toContain('Rate limit exceeded');
    });

    it('should classify nested billing message as credits even when LangChain wrapper is a tool error', () => {
      const error = Object.assign(new Error(statusPrefixedAnthropicCreditErrorText), {
        status: 400,
        lc_error_code: 'INVALID_TOOL_RESULTS',
        requestID: 'req_credit_lc',
        error: {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: anthropicCreditMessage,
          },
          request_id: 'req_credit_lc',
        },
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('credits');
      expect(result.title).toBe('Credit Limit Reached');
      expect(result.message).toBe(anthropicCreditMessage);
      expect(result.code).toBe('INVALID_TOOL_RESULTS');
      expect(result.httpStatus).toBe(400);
      expect(result.requestId).toBe('req_credit_lc');
    });

    it('should fall back to raw message if nested error structure is missing', () => {
      const error = Object.assign(new Error('400 some error'), {
        status: 400,
        lc_error_code: 'INVALID_TOOL_RESULTS',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
      expect(result.message).toContain('400 some error');
    });
  });

  describe('JSON message parsing', () => {
    it('should parse "400 {...}" format', () => {
      const error = new Error('400 {"type":"error","error":{"type":"invalid_request_error","message":"Bad request"}}');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
      expect(result.httpStatus).toBe(400);
      expect(result.message).toBe('Bad request');
      expect(result.code).toBe('invalid_request_error');
    });

    it('should classify status-prefixed Anthropic billing error as credits', () => {
      const error = new Error(statusPrefixedAnthropicCreditErrorText);

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('credits');
      expect(result.title).toBe('Credit Limit Reached');
      expect(result.message).toBe(anthropicCreditMessage);
      expect(result.code).toBe('invalid_request_error');
      expect(result.httpStatus).toBe(400);
      expect(result.raw).toBe(statusPrefixedAnthropicCreditErrorText);
    });

    it('should classify status-wrapped Anthropic billing SDK error as credits', () => {
      const error = Object.assign(new Error(statusPrefixedAnthropicCreditErrorText), {
        status: 400,
        requestID: 'req_credit_status',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('credits');
      expect(result.title).toBe('Credit Limit Reached');
      expect(result.message).toBe(anthropicCreditMessage);
      expect(result.code).toBe('invalid_request_error');
      expect(result.httpStatus).toBe(400);
      expect(result.requestId).toBe('req_credit_status');
    });

    it('should parse pure JSON Anthropic error format', () => {
      const error = new Error('{"type":"error","error":{"type":"rate_limit_error","message":"Rate limit exceeded"}}');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('rate_limit');
      expect(result.message).toBe('Rate limit exceeded');
      expect(result.code).toBe('rate_limit_error');
    });

    it('should handle authentication_error type', () => {
      const error = new Error('{"type":"error","error":{"type":"authentication_error","message":"Invalid API key"}}');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('auth');
    });

    it('should handle permission_error type', () => {
      const error = new Error(
        '{"type":"error","error":{"type":"permission_error","message":"Insufficient permissions"}}',
      );

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('credits');
    });

    it('should handle overloaded_error type', () => {
      const error = new Error(
        '{"type":"error","error":{"type":"overloaded_error","message":"The service is overloaded"}}',
      );

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('overloaded');
    });

    it('should handle api_error type', () => {
      const error = new Error('{"type":"error","error":{"type":"api_error","message":"Internal error"}}');

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('server');
    });

    it('should extract request_id from parsed JSON', () => {
      const error = new Error(
        '{"type":"error","error":{"type":"api_error","message":"Error"},"request_id":"req-json-123"}',
      );

      const result = parseNormalizedError(normalizeError(error));

      expect(result.requestId).toBe('req-json-123');
    });
  });

  describe('pattern matching', () => {
    it('should detect tool_use/tool_result pattern', () => {
      const error = new Error(
        'tool_use block must be followed by a tool_result block. The following tool_use ids did not have matching tool_result: call_123',
      );

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('tool_error');
    });

    it('should detect credit-related patterns', () => {
      const creditPatterns = [
        'Your credit balance is too low',
        'Billing issue detected',
        'Payment required',
        'Subscription expired',
        'Quota exceeded for this request',
      ];

      for (const pattern of creditPatterns) {
        const error = new Error(pattern);
        const result = parseNormalizedError(normalizeError(error));
        expect(result.category).toBe('credits');
      }
    });

    it('should detect overloaded patterns', () => {
      const overloadedPatterns = ['The server is overloaded', 'At maximum capacity', 'Server is too busy'];

      for (const pattern of overloadedPatterns) {
        const error = new Error(pattern);
        const result = parseNormalizedError(normalizeError(error));
        expect(result.category).toBe('overloaded');
      }
    });

    it('should detect rate limit patterns', () => {
      const rateLimitPatterns = ['Rate limit exceeded', 'Too many requests'];

      for (const pattern of rateLimitPatterns) {
        const error = new Error(pattern);
        const result = parseNormalizedError(normalizeError(error));
        expect(result.category).toBe('rate_limit');
      }
    });

    it('should detect authentication patterns', () => {
      const authPatterns = ['Unauthorized access', 'Authentication failed', 'Invalid API key'];

      for (const pattern of authPatterns) {
        const error = new Error(pattern);
        const result = parseNormalizedError(normalizeError(error));
        expect(result.category).toBe('auth');
      }
    });
  });

  describe('priority handling', () => {
    it('should prioritize LangChain error code over HTTP status', () => {
      const error = Object.assign(new Error('Error'), {
        lc_error_code: 'MODEL_AUTHENTICATION',
        status: 500, // Would normally be 'server'
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('auth');
      expect(result.httpStatus).toBe(500);
    });

    it('should include httpStatus even when category comes from lc_error_code', () => {
      const error = Object.assign(new Error('Error'), {
        lc_error_code: 'MODEL_RATE_LIMIT',
        status: 429,
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.category).toBe('rate_limit');
      expect(result.httpStatus).toBe(429);
    });
  });

  describe('output format', () => {
    it('should return valid JSON string', () => {
      const result = normalizeError(new Error('Test'));

      expect(() => JSON.parse(result) as unknown).not.toThrow();
    });

    it('should always include category, title, message, and raw', () => {
      const result = parseNormalizedError(normalizeError(new Error('Test')));

      expect(result).toHaveProperty('category');
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('raw');
    });

    it('should only include optional fields when present', () => {
      const simpleResult = parseNormalizedError(normalizeError(new Error('Simple error')));

      expect(simpleResult.code).toBeUndefined();
      expect(simpleResult.httpStatus).toBeUndefined();
      expect(simpleResult.requestId).toBeUndefined();
    });

    it('should include all fields when available', () => {
      const error = Object.assign(new Error('Error'), {
        lc_error_code: 'INVALID_TOOL_RESULTS',
        status: 400,
        requestID: 'req-full',
      });

      const result = parseNormalizedError(normalizeError(error));

      expect(result.code).toBe('INVALID_TOOL_RESULTS');
      expect(result.httpStatus).toBe(400);
      expect(result.requestId).toBe('req-full');
    });
  });
});

describe('first-party billing errors (B2)', () => {
  it('should extract µ$ amounts from the INSUFFICIENT_CREDITS marker into friendly copy', () => {
    const marker =
      'INSUFFICIENT_CREDITS: Your credit balance is $0.12 and this request needs about $1.11. Add credits to continue. balanceMicro=123000 requiredMicro=1111500';

    const result = parseNormalizedError(normalizeError(new Error(marker)));

    expect(result.category).toBe('credits');
    expect(result.code).toBe('INSUFFICIENT_CREDITS');
    expect(result.message).toBe(
      'Your credit balance is $0.12 and this request needs about $1.11. Add credits to continue.',
    );
  });

  it('should survive the stream error channel where only the message string remains', () => {
    const marker = 'INSUFFICIENT_CREDITS: out of credits balanceMicro=-5000000 requiredMicro=200000';

    const result = parseNormalizedError(normalizeError(marker));

    expect(result.category).toBe('credits');
    expect(result.message).toContain('$-5.00');
  });

  it('should fall back to generic credits copy when the marker carries no amounts', () => {
    const result = parseNormalizedError(normalizeError(new Error('INSUFFICIENT_CREDITS: exhausted')));

    expect(result.category).toBe('credits');
    expect(result.message).toBe('Your credit balance is too low for this request. Add credits to continue.');
  });

  it('should map first-party 402 statuses to the credits category (S35)', () => {
    const paymentRequired = Object.assign(new Error('Payment Required'), { status: 402 });

    const result = parseNormalizedError(normalizeError(paymentRequired));

    expect(result.category).toBe('credits');
    expect(result.httpStatus).toBe(402);
  });
});
