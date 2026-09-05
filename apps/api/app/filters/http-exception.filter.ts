import process from 'node:process';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { trace, SpanStatusCode, context as otelContext } from '@opentelemetry/api';
import type { HttpErrorResponse } from '@taucad/types';
import { httpHeader } from '#constants/http-header.constant.js';
import { LlmGatewayError } from '#api/llm/llm-gateway.error.js';

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

    let statusCode: number;
    let errorResponse: HttpErrorResponse;

    // The model gateway already speaks a typed envelope its clients parse
    // (`{ type: 'error', error: { type, message } }`). Flattening it here into the
    // shared shape deleted the refusal reason — the browser agent host could only
    // report the HTTP status back to the user.
    if (exception instanceof LlmGatewayError) {
      const gatewayStatus = exception.getStatus();
      this.logger.warn(`Model gateway refusal: ${JSON.stringify(exception.getResponse())}`);
      if (requestId) {
        void response.header(httpHeader.requestId, requestId);
      }
      void response.status(gatewayStatus).send(exception.getResponse());
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
      errorResponse = this.fromHttpException(exception, statusCode, request.url, requestId);
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
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorResponse.error });
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
    statusCode: number,
    path: string,
    requestId: string | undefined,
  ): HttpErrorResponse {
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return { error: exceptionResponse, statusCode, code: this.getErrorCode(exception), path, requestId };
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
    const { message, code } = exceptionResponse as Record<string, unknown>;
    const baseResponse: HttpErrorResponse = {
      error: typeof message === 'string' ? message : exception.message || 'An error occurred',
      code: typeof code === 'string' ? code : this.getErrorCode(exception),
      statusCode,
      path,
      requestId,
    };
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
