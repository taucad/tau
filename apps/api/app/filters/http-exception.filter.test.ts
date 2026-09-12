/* oxlint-disable eslint-plugin-promise/prefer-await-to-then, eslint-plugin-promise/valid-params -- filter.catch() is a method name, not Promise.catch() */
/* oxlint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-confusing-void-expression -- test mock casts */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import * as otelApi from '@opentelemetry/api';
import { HttpExceptionFilter } from '#filters/http-exception.filter.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';

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
