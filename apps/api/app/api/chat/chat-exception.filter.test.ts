/* oxlint-disable eslint-plugin-promise/prefer-await-to-then, eslint-plugin-promise/valid-params -- filter.catch() is a method name, not Promise.catch() */
/* oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument -- test mock casts */
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import type { ChatError } from '@taucad/types';
import { ChatExceptionFilter } from '#api/chat/chat-exception.filter.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';

function createMockArgumentsHost() {
  const response = {
    raw: { headersSent: false, destroyed: false, writableEnded: false, destroy: vi.fn() },
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };

  const request = { url: '/api/v1/chat', id: 'req_test_123', headers: {} };

  return {
    host: {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as unknown as ArgumentsHost,
    response,
  };
}

/** Mirrors drizzle-orm's DrizzleQueryError, whose message embeds the failed SQL and bound params. */
const leakySql =
  'Failed query: insert into "agent_device" ("owner_id", "label", "credential_hash") values ($1, $2, $3)\nparams: user_01H,proj_42,ws_7';

class DrizzleQueryError extends Error {
  public constructor() {
    super(leakySql);
    this.name = 'DrizzleQueryError';
  }
}

function sentError(response: { send: ReturnType<typeof vi.fn> }): ChatError {
  return response.send.mock.calls[0]?.[0] as ChatError;
}

describe('ChatExceptionFilter unknown-error disclosure', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs a post-headers failure and closes the stream without writing another response', () => {
    const { host, response } = createMockArgumentsHost();
    response.raw.headersSent = true;
    new ChatExceptionFilter().catch(new Error('Malformed provider stream'), host);
    expect(response.raw.destroy).toHaveBeenCalledTimes(1);
    expect(response.header).not.toHaveBeenCalled();
    expect(response.status).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
  });

  it('does not leak driver internals in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const { host, response } = createMockArgumentsHost();

    new ChatExceptionFilter().catch(new DrizzleQueryError(), host);

    const chatError = sentError(response);
    expect(chatError.raw).toBeUndefined();
    expect(JSON.stringify(chatError)).not.toContain('agent_device');
    expect(JSON.stringify(chatError)).not.toContain('proj_42');
    expect(chatError).toMatchObject({
      category: 'server',
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Internal server error',
      httpStatus: 500,
      requestId: 'req_test_123',
    });
  });

  it('keeps raw for debugging outside production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const { host, response } = createMockArgumentsHost();

    new ChatExceptionFilter().catch(new DrizzleQueryError(), host);

    expect(sentError(response).raw).toBe(leakySql);
  });

  it.each([
    {
      status: 429,
      code: 'FUNDED_HELPER_LIMIT',
      message: 'The naming helper is at its funded-operation failsafe.',
      category: 'rate_limit',
    },
    {
      status: 503,
      code: 'BILLING_RECOVERY_UNAVAILABLE',
      message: 'Tau is finalizing earlier funded work. Try again shortly.',
      category: 'overloaded',
    },
  ] as const)('preserves a funded gateway error as ChatError', ({ status, code, message, category }) => {
    const { host, response } = createMockArgumentsHost();

    new ChatExceptionFilter().catch(new LlmGatewayError(status, code, message), host);

    expect(sentError(response)).toMatchObject({
      category,
      code,
      message,
      httpStatus: status,
      requestId: 'req_test_123',
    });
  });
});
