import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
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

    if (exception instanceof ZodValidationException || exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError();
      if (zodError instanceof ZodError) {
        const message = zodError.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

        if (import.meta.env.DEV) {
          // Log validation errors in development
          this.logger.error(message, `Validation failed:`);
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
    } else if (statusCode >= 400) {
      this.logger.warn(`Client error: ${errorResponse.error}`);
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
