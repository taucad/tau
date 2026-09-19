import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import type { Auth } from 'better-auth';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import type { HostsService } from '#api/hosts/hosts.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { LlmGatewayController } from '#api/llm/llm-gateway.controller.js';
import { LlmGatewayService } from '#api/llm/llm-gateway.service.js';
import type { ModelInvocationIntent } from '#api/llm/model-invocation.types.js';
import { LlmGatewayAuthGuard, readLlmGatewayPrincipal } from '#api/llm/llm-gateway.guard.js';
import { readSingleHeader, validateAnthropicHeaders } from '#api/llm/llm-gateway.headers.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

const request = (headers: Record<string, string> = {}, rawHeaders?: string[]): FastifyRequest =>
  ({
    headers,
    query: {},
    raw: {
      rawHeaders: rawHeaders ?? Object.entries(headers).flatMap(([name, value]) => [name, value]),
      once: () => undefined,
    },
  }) as unknown as FastifyRequest;

const contextFor = (value: FastifyRequest): ExecutionContext =>
  ({
    getClass: () => class GatewayTestController {},
    getHandler: () => () => undefined,
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => value }),
  }) as unknown as ExecutionContext;

const config = {
  get(key: string) {
    if (key === 'TAU_FRONTEND_URL') return 'https://tau.new';
    if (key === 'ADDITIONAL_CORS_ORIGINS') return ['https://taucad.dev'];
    if (key === 'NODE_ENV') return 'production';
    return undefined;
  },
} as unknown as ConfigService<Environment, true>;

const errorType = (error: unknown): string | undefined => {
  if (!(error instanceof LlmGatewayError)) return undefined;
  const response = error.getResponse() as { error?: { type?: string } };
  return response.error?.type;
};

const errorMessage = (error: unknown): string | undefined => {
  if (!(error instanceof LlmGatewayError)) return undefined;
  const response = error.getResponse() as { error?: { message?: string } };
  return response.error?.message;
};

describe('gateway authentication boundary', () => {
  const createGuard = (input: { sessionUserId?: string; deviceOwnerId?: string }) => {
    const auth = {
      api: {
        getSession: vi.fn(async () =>
          input.sessionUserId === undefined ? null : { user: { id: input.sessionUserId } },
        ),
      },
    } as unknown as Auth;
    const hosts = {
      authenticateDevice: vi.fn(async () =>
        input.deviceOwnerId === undefined ? undefined : { ownerId: input.deviceOwnerId },
      ),
    } as unknown as HostsService;
    return { guard: new LlmGatewayAuthGuard(new Reflector(), auth, hosts, config), hosts };
  };

  it('binds the combined authentication guard to both controller routes', () => {
    expect(Reflect.getMetadata('__guards__', LlmGatewayController)).toContain(LlmGatewayAuthGuard);
  });

  it('accepts a Better Auth session principal', async () => {
    const { guard, hosts } = createGuard({ sessionUserId: 'user_session' });
    const incoming = request({ cookie: 'tau.session_token=session' });
    await expect(guard.canActivate(contextFor(incoming))).resolves.toBe(true);
    expect(readLlmGatewayPrincipal(incoming)).toBe('user_session');
    expect(hosts.authenticateDevice).not.toHaveBeenCalled();
  });

  it('accepts an existing paired-device bearer credential', async () => {
    const { guard, hosts } = createGuard({ deviceOwnerId: 'user_device' });
    const incoming = request({ authorization: 'Bearer device-token' });
    await expect(guard.canActivate(contextFor(incoming))).resolves.toBe(true);
    expect(readLlmGatewayPrincipal(incoming)).toBe('user_device');
    expect(hosts.authenticateDevice).toHaveBeenCalledWith('Bearer device-token');
  });

  it('returns a typed refusal when neither credential resolves', async () => {
    const { guard } = createGuard({});
    const refusal = guard.canActivate(contextFor(request()));
    await expect(refusal).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError && error.getStatus() === 401 && errorType(error) === 'UNAUTHENTICATED',
    );
  });

  it('admits the desktop renderer origin at the model gateway (B7)', async () => {
    const { guard } = createGuard({ sessionUserId: 'user_desktop' });
    const incoming = request({ origin: 'app://tau', cookie: 'tau.session_token=session' });
    await expect(guard.canActivate(contextFor(incoming))).resolves.toBe(true);
  });

  // Proves NODE_ENV reaches the validator: without it the dev-only origins
  // would be admitted here too (MAJOR 8).
  it('refuses the dev-desktop renderer origin in a production deployment', async () => {
    const { guard } = createGuard({ sessionUserId: 'user_dev' });
    const refusal = guard.canActivate(contextFor(request({ origin: 'http://localhost:3001' })));
    await expect(refusal).rejects.toSatisfy((error: unknown) => errorType(error) === 'ORIGIN_NOT_ALLOWED');
  });

  it('rejects a browser origin outside the configured Tau origins before authentication', async () => {
    const { guard } = createGuard({ sessionUserId: 'user_session' });
    const refusal = guard.canActivate(contextFor(request({ origin: 'https://attacker.example' })));
    await expect(refusal).rejects.toSatisfy((error: unknown) => errorType(error) === 'ORIGIN_NOT_ALLOWED');
  });
});

describe('gateway provider headers', () => {
  it('rejects duplicate provider headers instead of selecting one', () => {
    const incoming = request({ 'anthropic-version': '2023-06-01' }, [
      'anthropic-version',
      '2023-06-01',
      'Anthropic-Version',
      '2024-01-01',
    ]);
    let caught: unknown;
    try {
      readSingleHeader(incoming, 'anthropic-version');
    } catch (error) {
      caught = error;
    }
    expect(errorType(caught)).toBe('INVALID_REQUEST');
    expect(errorMessage(caught)).toContain('Duplicate anthropic-version headers');
  });

  it('allows only the production Anthropic version and beta set', () => {
    expect(
      validateAnthropicHeaders({
        version: '2023-06-01',
        beta: 'fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
      }),
    ).toEqual({
      version: '2023-06-01',
      beta: 'fine-grained-tool-streaming-2025-05-14,interleaved-thinking-2025-05-14',
    });
    for (const [headers, message] of [
      [{ version: '2099-01-01' }, 'Unsupported anthropic-version'],
      [{ beta: 'unknown-beta' }, 'Unsupported anthropic-beta'],
    ] as const) {
      let caught: unknown;
      try {
        validateAnthropicHeaders(headers);
      } catch (error) {
        caught = error;
      }
      expect(errorType(caught)).toBe('INVALID_REQUEST');
      expect(errorMessage(caught)).toContain(message);
    }
  });
});

describe('gateway receipt attribution', () => {
  const attemptHeaders = { 'x-tau-attempt-id': 'attempt_boundary' };

  /** Drives a real route through a real service and records the intents it built. */
  const relay = async (headers: Record<string, string>, rawHeaders?: string[]): Promise<ModelInvocationIntent[]> => {
    const intents: ModelInvocationIntent[] = [];
    const reply: Record<string, unknown> = { raw: { once: () => undefined, writableFinished: false } };
    for (const name of ['header', 'status', 'send']) {
      reply[name] = () => reply;
    }
    const gateway = new LlmGatewayService({
      invoke: async (intent) => {
        intents.push(intent);
        return { state: 'terminal', operationId: 'op_boundary' };
      },
    });
    await new LlmGatewayController(gateway).openai(
      request(headers, rawHeaders),
      reply as unknown as FastifyReply,
      'user_boundary',
    );
    return intents;
  };

  it('should carry both attribution headers into the invocation intent', async () => {
    const intents = await relay({
      ...attemptHeaders,
      'x-tau-project-id': 'proj_01J8ZK4E',
      'x-tau-chat-id': 'chat_01J8ZK4F',
    });

    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({
      surface: 'gateway',
      projectHint: 'proj_01J8ZK4E',
      chatHint: 'chat_01J8ZK4F',
    });
  });

  it('should leave both members absent when the caller sends neither header', async () => {
    const intents = await relay(attemptHeaders);

    expect(intents[0]).not.toHaveProperty('projectHint');
    expect(intents[0]).not.toHaveProperty('chatHint');
  });

  it.each(['project one', 'proj/1', 'a'.repeat(129)])(
    'should drop the malformed hint %s and still relay the turn',
    async (hint) => {
      // Attribution is best effort: a turn the caller is paying for is never
      // refused because its receipt would be filed under nothing.
      const intents = await relay({ ...attemptHeaders, 'x-tau-project-id': hint, 'x-tau-chat-id': 'chat_ok' });

      expect(intents).toHaveLength(1);
      expect(intents[0]).not.toHaveProperty('projectHint');
      expect(intents[0]).toMatchObject({ chatHint: 'chat_ok' });
    },
  );

  it.each(['x-tau-project-id', 'x-tau-chat-id'])('should refuse a duplicated %s with a 400', async (name) => {
    // A second value is an ambiguous identity, not a malformed one: the same
    // answer readSingleHeader already gives x-tau-attempt-id.
    const refusal = relay({ ...attemptHeaders, [name]: 'first' }, [
      'x-tau-attempt-id',
      'attempt_boundary',
      name,
      'first',
      name,
      'second',
    ]);

    await expect(refusal).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof LlmGatewayError && error.getStatus() === 400 && errorType(error) === 'INVALID_REQUEST',
    );
    await expect(refusal).rejects.toThrow(`Duplicate ${name} headers are not allowed.`);
  });
});

describe('gateway error envelope on the wire', () => {
  const catchThrough = (
    exception: unknown,
  ): { readonly status: number; readonly body: unknown; readonly headers: Record<string, string> } => {
    let status = 0;
    let body: unknown;
    const headers: Record<string, string> = {};
    const reply = {
      header: (name: string, value: string) => {
        headers[name] = value;
        return reply;
      },
      status: (code: number) => {
        status = code;
        return reply;
      },
      send: (payload: unknown) => {
        body = payload;
        return reply;
      },
    };
    const incoming = { headers: {}, id: 'req_boundary', url: '/api/v1/llm/anthropic/v1/messages' };
    new HttpExceptionFilter().catch(exception, {
      switchToHttp: () => ({ getResponse: () => reply, getRequest: () => incoming }),
    } as unknown as ArgumentsHost);
    return { status, body, headers };
  };

  // The browser host parses `{ type: 'error', error: { type, message } }`. Flattening
  // it to `{ error: 'Llm Gateway Error', code: 'BAD_REQUEST' }` deleted the only
  // actionable half of every gateway refusal.
  it.each([
    [HttpStatus.BAD_REQUEST, 'MODEL_NOT_IN_CATALOG', 'The selected model is not available.'],
    [HttpStatus.BAD_REQUEST, 'INVALID_REQUEST', 'stream must be true.'],
    [HttpStatus.PAYMENT_REQUIRED, 'INSUFFICIENT_CREDIT', 'Insufficient Tau credit for this model request.'],
    [HttpStatus.BAD_GATEWAY, 'UPSTREAM_REJECTED', 'The model provider rejected the request (HTTP 400).'],
    [HttpStatus.SERVICE_UNAVAILABLE, 'PROVIDER_UNAVAILABLE', 'The model provider is unavailable.'],
  ] as const)('preserves a %i %s envelope verbatim through the global filter', (status, type, message) => {
    const result = catchThrough(new LlmGatewayError(status, type, message));

    expect(result.status).toBe(status);
    expect(result.body).toEqual({ type: 'error', error: { type, message } });
  });

  it('still flattens a non-gateway HttpException into the shared API error shape', () => {
    const result = catchThrough(new HttpException('Forbidden resource', HttpStatus.FORBIDDEN));

    expect(result.status).toBe(HttpStatus.FORBIDDEN);
    expect(result.body).toMatchObject({ error: 'Forbidden resource', code: 'FORBIDDEN' });
  });
});
