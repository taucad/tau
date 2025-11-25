import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { httpHeader } from '#constants/http-header.constant.js';

export type ErrorResponse = {
  error: string;
  code?: string;
  statusCode: number;
  message?: string | string[];
  path?: string;
  requestId?: string;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    // Extract request ID: prefer header if present, otherwise use Fastify's generated ID
    const headerRequestId = request.headers[httpHeader.requestId] as string | undefined;
    const requestId = headerRequestId ?? (request.id as string | undefined);

    let statusCode: number;
    let errorResponse: ErrorResponse;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        errorResponse = {
          error: exceptionResponse,
          statusCode,
          code: this.getErrorCode(exception),
          path: request.url,
          requestId,
        };
      } else if (typeof exceptionResponse === 'object') {
        // Handle structured error responses (e.g., { code: 'UNAUTHORIZED', message: '...' })
        const { message, code } = exceptionResponse as Record<string, unknown>;
        const baseResponse: ErrorResponse = {
          error: typeof message === 'string' ? message : exception.message || 'An error occurred',
          code: typeof code === 'string' ? code : this.getErrorCode(exception),
          statusCode,
          path: request.url,
          requestId,
        };
        if (Array.isArray(message)) {
          baseResponse.message = message;
        }

        errorResponse = baseResponse;
      } else {
        errorResponse = {
          error: exception.message || 'An error occurred',
          statusCode,
          code: this.getErrorCode(exception),
          path: request.url,
          requestId,
        };
      }
    } else if (exception instanceof ZodError) {
      // Handle Zod validation errors
      statusCode = HttpStatus.BAD_REQUEST;
      errorResponse = {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        statusCode,
        message: exception.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
        path: request.url,
        requestId,
      };
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

      // Log the full error for debugging
      this.logger.error(
        `Unhandled exception: ${exception.message}`,
        exception.stack,
        `${request.method} ${request.url}`,
      );
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

      this.logger.error(`Unknown exception type: ${String(exception)}`, undefined, `${request.method} ${request.url}`);
    }

    // Log error details (except for client errors)
    if (statusCode >= 500) {
      this.logger.error(
        `Exception caught: ${errorResponse.error}`,
        exception instanceof Error ? exception.stack : undefined,
        `${request.method} ${request.url}`,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(`Client error: ${errorResponse.error}`, `${request.method} ${request.url}`);
    }

    // Set request ID in response header (matching middleware behavior)
    if (requestId) {
      void response.header(httpHeader.requestId, requestId);
    }

    void response.status(statusCode).send(errorResponse);
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
