/* oxlint-disable eslint-plugin-promise/prefer-await-to-then, eslint-plugin-promise/valid-params -- filter.catch() is a method name, not Promise.catch() */
/* oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-confusing-void-expression -- test mock casts */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpException, HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as otelApi from '@opentelemetry/api';
import type { HealthCheckResult } from '@nestjs/terminus';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';
import { ReadinessRefusalException } from '#api/health/readiness-refusal.exception.js';
import { reportServerError } from '#telemetry/sentry.js';
import type * as SentryModule from '#telemetry/sentry.js';

vi.mock('#telemetry/sentry.js', async (importOriginal) => ({
  ...(await importOriginal<typeof SentryModule>()),
  reportServerError: vi.fn(),
}));

function createMockArgumentsHost(url = '/test') {
  const mockResponse = {
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };

  const mockRequest = {
    url,
    id: 'req_test_123',
    headers: {},
  };

  return {
    switchToHttp: vi.fn().mockReturnValue({
      getResponse: vi.fn().mockReturnValue(mockResponse),
      getRequest: vi.fn().mockReturnValue(mockRequest),
    }),
    response: mockResponse,
    request: mockRequest,
  };
}

describe('HttpExceptionFilter OTEL integration', () => {
  let filter: HttpExceptionFilter;
  let mockSpan: { setStatus: ReturnType<typeof vi.fn>; recordException: ReturnType<typeof vi.fn> };
  let getSpanSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    vi.mocked(reportServerError).mockClear();
    mockSpan = {
      setStatus: vi.fn(),
      recordException: vi.fn(),
    };
    getSpanSpy = vi.spyOn(otelApi.trace, 'getSpan');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should annotate OTEL span with error status for 500 errors', () => {
    getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);

    const host = createMockArgumentsHost();
    const exception = new Error('internal failure');

    filter.catch(exception, host as any);

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: otelApi.SpanStatusCode.ERROR,
      message: 'Internal server error',
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(exception);
  });

  it('should annotate OTEL span for HttpException with 5xx status', () => {
    getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);

    const host = createMockArgumentsHost();
    const exception = new HttpException('Service unavailable', HttpStatus.SERVICE_UNAVAILABLE);

    filter.catch(exception, host as any);

    expect(mockSpan.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: otelApi.SpanStatusCode.ERROR }));
  });

  it('should report an anonymous 503 as a server error', () => {
    const host = createMockArgumentsHost('/health/ready');

    filter.catch(new ServiceUnavailableException({ status: 'error' }), host as any);

    expect(reportServerError).toHaveBeenCalledTimes(1);
  });

  /* X3 (DA1): a retryable git refusal is capacity working as designed and the client
   * retries it, so it is a warning log line (and DA2's counter), not a Sentry error. */
  it.each(['GIT_LEASE_OWNER_BUSY', 'GIT_LEASE_DISK_FULL', 'GIT_PUSH_RACE_LOST', 'GIT_SERVICE_RESTARTING'])(
    'should answer a retryable %s with 503 as a warning without reporting it to Sentry',
    (code) => {
      getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);
      const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const host = createMockArgumentsHost('/v1/git/prj_1/git-receive-pack');

      filter.catch(new ServiceUnavailableException({ code, message: 'Busy; retry shortly.' }), host as any);

      expect(host.response.status).toHaveBeenCalledWith(503);
      expect(host.response.send).toHaveBeenCalledWith(expect.objectContaining({ code, statusCode: 503 }));
      expect(reportServerError).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
      expect(mockSpan.setStatus).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith({ code, statusCode: 503, requestId: 'req_test_123' }, 'Retryable git refusal');
    },
  );

  it.each([
    [HttpStatus.INTERNAL_SERVER_ERROR, 'GIT_REPOSITORY_INCOMPLETE'],
    [HttpStatus.SERVICE_UNAVAILABLE, 'GIT_REPOSITORY_INCOMPLETE'],
    [HttpStatus.SERVICE_UNAVAILABLE, 'GIT_SOMETHING_NEW'],
    [HttpStatus.INTERNAL_SERVER_ERROR, 'GIT_LEASE_OWNER_BUSY'],
  ] as const)('should still report a %i %s to Sentry', (status, code) => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const host = createMockArgumentsHost('/v1/git/prj_1/git-upload-pack');

    filter.catch(new HttpException({ code, message: 'Unavailable.' }, status), host as any);

    expect(reportServerError).toHaveBeenCalledTimes(1);
  });

  it('should answer a readiness refusal with 503 without re-reporting it as a server error', () => {
    getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const host = createMockArgumentsHost('/health/ready');
    const result: HealthCheckResult = {
      status: 'error',
      info: {},
      error: { database: { status: 'down' } },
      details: {},
    };

    filter.catch(new ReadinessRefusalException([{ indicator: 'database' }], result), host as any);

    expect(host.response.status).toHaveBeenCalledWith(503);
    expect(host.response.send).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'SERVICE_UNAVAILABLE', statusCode: 503, path: '/health/ready' }),
    );
    expect(reportServerError).not.toHaveBeenCalled();
    expect(errorLog).not.toHaveBeenCalled();
    expect(mockSpan.setStatus).not.toHaveBeenCalled();
  });

  it('should NOT annotate OTEL span for 4xx errors', () => {
    getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);

    const host = createMockArgumentsHost();
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, host as any);

    expect(mockSpan.setStatus).not.toHaveBeenCalled();
    expect(mockSpan.recordException).not.toHaveBeenCalled();
  });

  it('should NOT annotate OTEL span for 400 Bad Request', () => {
    getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);

    const host = createMockArgumentsHost();
    const exception = new HttpException('Bad request', HttpStatus.BAD_REQUEST);

    filter.catch(exception, host as any);

    expect(mockSpan.setStatus).not.toHaveBeenCalled();
  });

  it('should handle case when no active OTEL span exists', () => {
    getSpanSpy.mockReturnValue(undefined);

    const host = createMockArgumentsHost();
    const exception = new Error('server crash');

    expect(() => filter.catch(exception, host as any)).not.toThrow();
  });

  it('should not reply again once the response has already been sent', () => {
    getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {
      // Test-local logger sink.
    });

    const host = createMockArgumentsHost();
    (host.response as unknown as { sent: boolean }).sent = true;
    const error = new Error('settlement failed after the stream');

    filter.catch(error, host as any);

    expect(host.response.send).not.toHaveBeenCalled();
    expect(host.response.status).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith(
      { err: error, requestId: 'req_test_123' },
      'Request failed after its response was already sent',
    );
  });

  it.each([
    ['FUNDED_OPERATION_LIMIT', HttpStatus.TOO_MANY_REQUESTS, '30'],
    ['FUNDED_HELPER_LIMIT', HttpStatus.TOO_MANY_REQUESTS, '30'],
    ['BILLING_RECOVERY_UNAVAILABLE', HttpStatus.SERVICE_UNAVAILABLE, '60'],
  ] as const)('should return a bounded Retry-After with the %s envelope', (type, status, seconds) => {
    const host = createMockArgumentsHost();

    filter.catch(new LlmGatewayError(status, type, 'refused'), host as any);

    expect(host.response.header).toHaveBeenCalledWith('retry-after', seconds);
    expect(host.response.status).toHaveBeenCalledWith(status);
    expect(host.response.send).toHaveBeenCalledWith({ type: 'error', error: { type, message: 'refused' } });
  });

  it('should send a structured refusal retry estimate as the Retry-After header', () => {
    const host = createMockArgumentsHost();

    filter.catch(
      new HttpException({ code: 'GITHUB_RATE_LIMITED', retryAfterSeconds: 42 }, HttpStatus.TOO_MANY_REQUESTS),
      host as any,
    );

    expect(host.response.header).toHaveBeenCalledWith('retry-after', '42');
    expect(host.response.send).toHaveBeenCalledWith(expect.objectContaining({ code: 'GITHUB_RATE_LIMITED' }));
  });

  it('should prefer the envelope own retry estimate over the static funded map', () => {
    const host = createMockArgumentsHost();

    filter.catch(
      new LlmGatewayError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', 'upstream rate limit', {
        retryAfterSeconds: 7,
      }),
      host as any,
    );

    expect(host.response.header).toHaveBeenCalledWith('retry-after', '7');
  });

  /* The interpolated string was eaten by pino-pretty: every `{…}` in a message is read as
   * a format token, so the envelope logged as `{"type":"error","error":}`. */
  it('should log the gateway refusal as a structured object rather than an interpolated envelope', () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // Test-local logger sink.
    });
    const host = createMockArgumentsHost();
    const exception = new LlmGatewayError(
      HttpStatus.BAD_GATEWAY,
      'UPSTREAM_REJECTED',
      'Configured provider returned HTTP 400.',
    );

    filter.catch(exception, host as any);

    expect(warn).toHaveBeenCalledWith(
      { gatewayRefusal: { status: 502, type: 'UPSTREAM_REJECTED' }, requestId: 'req_test_123' },
      'Model gateway refusal',
    );
  });

  it('should not offer a retry estimate for a funded refusal that retrying cannot clear, and keep its shortfall', () => {
    const host = createMockArgumentsHost();
    const details = {
      requiredCreditAtoms: '4244000',
      availableCreditAtoms: '300000',
      routeId: 'anthropic-claude-astra-5',
    };

    filter.catch(
      new LlmGatewayError(HttpStatus.PAYMENT_REQUIRED, 'INSUFFICIENT_CREDIT', 'no credit', details),
      host as any,
    );

    expect(host.response.header).not.toHaveBeenCalledWith('retry-after', expect.anything());
    expect(host.response.status).toHaveBeenCalledWith(HttpStatus.PAYMENT_REQUIRED);
    expect(host.response.send).toHaveBeenCalledWith({
      type: 'error',
      error: { type: 'INSUFFICIENT_CREDIT', message: 'no credit', details },
    });
  });

  it('should not call recordException for non-Error 5xx exceptions', () => {
    getSpanSpy.mockReturnValue(mockSpan as unknown as otelApi.Span);

    const host = createMockArgumentsHost();
    const exception = 'string error';

    filter.catch(exception, host as any);

    expect(mockSpan.setStatus).toHaveBeenCalledWith(expect.objectContaining({ code: otelApi.SpanStatusCode.ERROR }));
    expect(mockSpan.recordException).not.toHaveBeenCalled();
  });
});
