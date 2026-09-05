import { EventEmitter } from 'node:events';
import type { ServerResponse } from 'node:http';
import IORedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { Reflector } from '@nestjs/core';
import type { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { ArgumentsHost, ExecutionContext } from '@nestjs/common';
import type { Auth } from 'better-auth';
import type { FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Environment } from '#config/environment.config.js';
import type { HostsService } from '#api/hosts/hosts.service.js';
import type { RedisService } from '#redis/redis.service.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { LlmGatewayController } from '#api/llm/llm-gateway.controller.js';
import { LlmGatewayAuthGuard, readLlmGatewayPrincipal } from '#api/llm/llm-gateway.guard.js';
import { readSingleHeader, validateAnthropicHeaders } from '#api/llm/llm-gateway.headers.js';
import { LlmGatewayLimiter } from '#api/llm/llm-gateway-limiter.service.js';
import type { LlmGatewayOptions } from '#api/llm/llm-gateway.options.js';
import { GatewayAbortScope, GatewayDownstreamLifecycle } from '#api/llm/llm-gateway.stream.js';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';

const gatewayOptions: LlmGatewayOptions = {
  requestsPerMinute: 10,
  maxConcurrentRequests: 1,
  maxProviderConcurrentRequests: 10,
  upstreamIdleTimeoutMs: 100,
  postAbortSettlementTimeoutMs: 200,
  concurrencyLeaseMs: 300_000,
  concurrencyHeartbeatMs: 60_000,
  maxSseEventBytes: 256 * 1024,
};

const request = (headers: Record<string, string> = {}, rawHeaders?: string[]): FastifyRequest =>
  ({
    headers,
    raw: { rawHeaders: rawHeaders ?? Object.entries(headers).flatMap(([name, value]) => [name, value]) },
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

describe('gateway per-principal admission', () => {
  let redis: Redis | undefined;

  afterEach(() => {
    redis?.disconnect();
    redis = undefined;
  });

  it('caps concurrency per principal without blocking another principal', async () => {
    redis = new IORedisMock() as unknown as Redis;
    await redis.flushall();
    const limiter = new LlmGatewayLimiter({ client: redis } as unknown as RedisService, gatewayOptions);
    const first = await limiter.acquire('user_a', 'openai');
    await expect(limiter.acquire('user_a', 'openai')).rejects.toSatisfy(
      (error: unknown) => errorType(error) === 'RATE_LIMITED',
    );
    const otherPrincipal = await limiter.acquire('user_b', 'openai');
    await first.release();
    await otherPrincipal.release();
  });

  it('caps requests per minute independently of released concurrency slots', async () => {
    redis = new IORedisMock() as unknown as Redis;
    await redis.flushall();
    const limiter = new LlmGatewayLimiter({ client: redis } as unknown as RedisService, {
      ...gatewayOptions,
      maxConcurrentRequests: 10,
      requestsPerMinute: 2,
    });
    const first = await limiter.acquire('user_rate', 'openai');
    await first.release();
    const second = await limiter.acquire('user_rate', 'openai');
    await second.release();
    await expect(limiter.acquire('user_rate', 'openai')).rejects.toSatisfy(
      (error: unknown) => errorType(error) === 'RATE_LIMITED',
    );
  });

  it('meters concurrency-saturated retries against the principal rate limit', async () => {
    redis = new IORedisMock() as unknown as Redis;
    await redis.flushall();
    const limiter = new LlmGatewayLimiter({ client: redis } as unknown as RedisService, {
      ...gatewayOptions,
      requestsPerMinute: 2,
    });
    const first = await limiter.acquire('user_saturated', 'openai');
    await expect(limiter.acquire('user_saturated', 'openai')).rejects.toSatisfy(
      (error: unknown) => errorType(error) === 'RATE_LIMITED',
    );
    await first.release();
    await expect(limiter.acquire('user_saturated', 'openai')).rejects.toSatisfy(
      (error: unknown) => errorType(error) === 'RATE_LIMITED',
    );
  });

  it('caps aggregate provider concurrency across different principals', async () => {
    redis = new IORedisMock() as unknown as Redis;
    await redis.flushall();
    const limiter = new LlmGatewayLimiter(
      { client: redis } as unknown as RedisService,
      { ...gatewayOptions, maxProviderConcurrentRequests: 1 } as LlmGatewayOptions,
    );
    const acquire = limiter.acquire.bind(limiter);

    const first = await acquire('user_provider_a', 'openai');
    let otherProvider: { release(): Promise<void> } | undefined;
    try {
      let secondError: unknown;
      try {
        const unexpected = await acquire('user_provider_b', 'openai');
        await unexpected.release();
      } catch (error) {
        secondError = error;
      }
      expect(errorType(secondError)).toBe('RATE_LIMITED');
      otherProvider = await acquire('user_provider_b', 'anthropic');
    } finally {
      await first.release();
      await otherProvider?.release();
    }
  });
});

describe('gateway abort settlement state', () => {
  afterEach(() => vi.useRealTimers());

  it('keeps client abort and gateway destroy mutually exclusive', () => {
    const clientRaw = new EventEmitter();
    const onClientAbort = vi.fn();
    const client = new GatewayDownstreamLifecycle(
      clientRaw as unknown as Pick<ServerResponse, 'once' | 'removeListener'>,
      onClientAbort,
    );
    clientRaw.emit('close');
    expect(client.cause).toBe('client_abort');
    expect(onClientAbort).toHaveBeenCalledOnce();

    const gatewayRaw = new EventEmitter();
    const onGatewayClose = vi.fn();
    const gateway = new GatewayDownstreamLifecycle(
      gatewayRaw as unknown as Pick<ServerResponse, 'once' | 'removeListener'>,
      onGatewayClose,
    );
    gateway.markGatewayDestroy();
    gatewayRaw.emit('close');
    expect(gateway.cause).toBe('gateway_destroy');
    expect(onGatewayClose).not.toHaveBeenCalled();
  });

  it('aborts a stalled post-client-abort drain at its idle deadline', async () => {
    vi.useFakeTimers();
    const scope = new GatewayAbortScope(20, 100);
    scope.touch();
    scope.startPostAbortDrain();
    await vi.advanceTimersByTimeAsync(21);
    expect(scope.controller.signal.aborted).toBe(true);
    expect(scope.abortReason).toBe('upstream_idle');
  });

  it('aborts an active post-client-abort drain at its total settlement deadline', async () => {
    vi.useFakeTimers();
    const scope = new GatewayAbortScope(100, 20);
    scope.touch();
    scope.startPostAbortDrain();
    await vi.advanceTimersByTimeAsync(21);
    expect(scope.controller.signal.aborted).toBe(true);
    expect(scope.abortReason).toBe('settlement_deadline');
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
