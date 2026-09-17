import process from 'node:process';
import { Catch, ConflictException, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import type { HttpErrorResponse } from '@taucad/types';
import { wirePaymentActionSchema } from '@taucad/billing';
import type { WirePaymentAction } from '@taucad/billing';
import { httpHeader } from '#constants/http-header.constant.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';

/**
 * Bounded retry estimates for the funded-admission refusals (B9 `:292`).
 *
 * Neither denial carries a per-request estimate, so each value is the blueprint's
 * own bound for the condition: 30 seconds is B9's due-to-terminal p99 target
 * (`llm-admission-failsafe-and-recovery-blueprint.md:251`), after which a saturating
 * funded operation has reached terminal; 60 seconds is the recovery claim lease
 * (`credit-ledger.service.ts:1069`), after which another claimant's lease expires.
 */
export const fundedRetryAfterSeconds: ReadonlyMap<string, number> = new Map<string, number>([
  ['FUNDED_OPERATION_LIMIT', 30],
  ['FUNDED_HELPER_LIMIT', 30],
  ['BILLING_RECOVERY_UNAVAILABLE', 60],
]);

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();

    // Extract request ID: prefer header if present, otherwise use Fastify's generated ID
    const headerRequestId = request.headers[httpHeader.requestId] as string | undefined;
    const requestId = headerRequestId ?? (request.id as string | undefined);

    // A streamed route (the model gateway) can fail after its response has left:
    // a second reply only produces `FST_ERR_REP_ALREADY_SENT` and hides the cause.
    if (response.sent) {
      this.logger.error({ err: exception, requestId }, 'Request failed after its response was already sent');
      return;
    }

    let statusCode: number;
    let errorResponse: HttpErrorResponse;

    // The model gateway already speaks a typed envelope its clients parse
    // (`{ type: 'error', error: { type, message } }`). Flattening it here into the
    // shared shape deleted the refusal reason — the browser agent host could only
    // report the HTTP status back to the user.
    if (exception instanceof LlmGatewayError) {
      const gatewayStatus = exception.getStatus();
      const gatewayResponse = exception.getResponse();
      this.logger.warn(`Model gateway refusal: ${JSON.stringify(gatewayResponse)}`);
      if (requestId) {
        void response.header(httpHeader.requestId, requestId);
      }
      const { type } = (gatewayResponse as { error?: { type?: unknown } }).error ?? {};
      const retryAfter = typeof type === 'string' ? fundedRetryAfterSeconds.get(type) : undefined;
      if (retryAfter !== undefined) {
        void response.header('retry-after', String(retryAfter));
      }
      void response.status(gatewayStatus).send(gatewayResponse);
      return;
    }

    if (exception instanceof ZodValidationException || exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError();
      if (zodError instanceof ZodError) {
        const message = zodError.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
        const nodeEnv = process.env.NODE_ENV;

        if (nodeEnv === 'development') {
          // Log validation errors in development
          this.logger.error({ message, body: request.body }, `Validation failed`);
        }

        statusCode = HttpStatus.BAD_REQUEST;
        errorResponse = {
          error: 'Validation failed',
          code: 'VALIDATION_ERROR',
          statusCode,
          message,
          path: request.url,
          requestId,
        };
      } else {
        throw new TypeError(
          'ZodSerializationException is not a ZodError. Something was probably misconfigured in the exception filter.',
        );
      }
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      errorResponse = this.fromHttpException(exception, request.url, requestId);
    } else if (exception instanceof Error) {
      // Handle unknown errors
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        statusCode,
        path: request.url,
        requestId,
      };
    } else {
      // Handle completely unknown error types
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorResponse = {
        error: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        statusCode,
        path: request.url,
        requestId,
      };
    }

    // Log error details
    if (statusCode >= 500) {
      this.logger.error(exception, `Unhandled exception: ${errorResponse.error}`);

      const span = trace.getSpan(otelContext.active());
      if (span) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: errorResponse.error,
        });
        if (exception instanceof Error) {
          span.recordException(exception);
        }
      }
    } else if (statusCode >= 400) {
      this.logger.warn(`Client error: ${errorResponse.error}`);
    }

    // Set request ID in response header (matching middleware behavior)
    if (requestId) {
      void response.header(httpHeader.requestId, requestId);
    }

    void response.status(statusCode).send(errorResponse);
  }

  private fromHttpException(
    exception: HttpException,
    path: string,
    requestId: string | undefined,
  ): HttpErrorResponse & { action?: WirePaymentAction } {
    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return {
        error: exceptionResponse,
        statusCode,
        code: this.getErrorCode(exception),
        path,
        requestId,
      };
    }
    if (typeof exceptionResponse !== 'object') {
      return {
        error: exception.message || 'An error occurred',
        statusCode,
        code: this.getErrorCode(exception),
        path,
        requestId,
      };
    }
    // Handle structured error responses (e.g., { code: 'UNAUTHORIZED', message: '...' })
    const { message, code, action } = exceptionResponse as Record<string, unknown>;
    const baseResponse: HttpErrorResponse & { action?: WirePaymentAction } = {
      error: typeof message === 'string' ? message : exception.message || 'An error occurred',
      code: typeof code === 'string' ? code : this.getErrorCode(exception),
      statusCode,
      path,
      requestId,
    };
    if (exception instanceof ConflictException) {
      const paymentAction = wirePaymentActionSchema.safeParse(action);
      if (paymentAction.success) {
        baseResponse.action = paymentAction.data;
      }
    }
    if (Array.isArray(message)) {
      baseResponse.message = message;
    }
    return baseResponse;
  }

  private getErrorCode(exception: HttpException): string {
    const status = exception.getStatus();
    const statusText = exception.name.replace('Exception', '').toUpperCase();

    // Map common HTTP status codes to error codes
    const statusCodeMap: Record<number, string> = {
      [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
      [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
      [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
      [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
      [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
      [HttpStatus.CONFLICT]: 'CONFLICT',
      [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
      [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
      [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
      [HttpStatus.NOT_IMPLEMENTED]: 'NOT_IMPLEMENTED',
      [HttpStatus.BAD_GATEWAY]: 'BAD_GATEWAY',
      [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
      [HttpStatus.GATEWAY_TIMEOUT]: 'GATEWAY_TIMEOUT',
    };

    return statusCodeMap[status] ?? (statusText || 'HTTP_EXCEPTION');
  }
}
