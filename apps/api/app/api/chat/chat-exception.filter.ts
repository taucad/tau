/**
 * Chat-specific exception filter that returns ChatError format.
 *
 * This filter converts all HTTP exceptions to the structured ChatError format,
 * ensuring consistency between pre-stream errors (e.g., 401 Unauthorized) and
 * stream errors (handled by error-transform.ts).
 */

import process from 'node:process';
import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodSerializationException, ZodValidationException } from 'nestjs-zod';
import { ZodError } from 'zod';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError } from '@taucad/types';
import { httpStatusToCategory, errorCategoryTitles } from '@taucad/chat/utils';
import { httpHeader } from '#constants/http-header.constant.js';
import { normalizeError } from '#api/chat/utils/error-normalizer.js';
import { isCompactionPipelineError } from '#api/chat/utils/compaction-errors.js';

@Catch()
export class ChatExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ChatExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<FastifyReply>();
    const request = context.getRequest<FastifyRequest>();

    // Extract request ID: prefer header if present, otherwise use Fastify's generated ID
    const headerRequestId = request.headers[httpHeader.requestId] as string | undefined;
    const requestId = headerRequestId ?? (request.id as string | undefined);

    let statusCode: number;
    let chatError: ChatError;

    if (exception instanceof ZodValidationException || exception instanceof ZodSerializationException) {
      const zodError = exception.getZodError();
      if (zodError instanceof ZodError) {
        const validationMessages = zodError.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
        const message = validationMessages.join('; ');

        statusCode = HttpStatus.BAD_REQUEST;
        chatError = {
          category: errorCategory.toolError,
          title: errorCategoryTitles[errorCategory.toolError],
          message: `Validation failed: ${message}`,
          code: 'VALIDATION_ERROR',
          httpStatus: statusCode,
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
      const category = httpStatusToCategory(statusCode);

      let message: string;
      let code: string | undefined;

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        code = this.getErrorCode(exception);
      } else if (typeof exceptionResponse === 'object') {
        const responseObject = exceptionResponse as Record<string, unknown>;
        const responseMessage = responseObject['message'];
        if (typeof responseMessage === 'string') {
          message = responseMessage;
        } else if (Array.isArray(responseMessage)) {
          // NestJS ValidationPipe returns message as string[] for validation errors
          message = responseMessage.join('; ');
        } else {
          message = exception.message;
        }

        code = typeof responseObject['code'] === 'string' ? responseObject['code'] : this.getErrorCode(exception);
      } else {
        message = exception.message || 'An error occurred';
        code = this.getErrorCode(exception);
      }

      chatError = {
        category,
        title: errorCategoryTitles[category],
        message,
        code,
        httpStatus: statusCode,
        requestId,
      };
    } else if (isCompactionPipelineError(exception)) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      chatError = {
        ...(JSON.parse(normalizeError(exception)) as ChatError),
        httpStatus: statusCode,
        requestId,
      };
    } else if (exception instanceof Error) {
      // Handle unknown errors. `exception.message` is uncurated driver/library text
      // (e.g. DrizzleQueryError embeds the failed SQL plus bound parameter values), so
      // it is only ever handed to the client outside production.
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      chatError = {
        category: errorCategory.server,
        title: errorCategoryTitles[errorCategory.server],
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        httpStatus: statusCode,
        requestId,
        ...(process.env.NODE_ENV === 'production' ? {} : { raw: exception.message }),
      };
    } else {
      // Handle completely unknown error types
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      chatError = {
        category: errorCategory.server,
        title: errorCategoryTitles[errorCategory.server],
        message: 'Internal server error',
        code: 'INTERNAL_SERVER_ERROR',
        httpStatus: statusCode,
        requestId,
      };
    }

    // Log error details
    if (statusCode >= 500) {
      this.logger.error(exception, `Chat exception: ${chatError.message}`);
    } else if (statusCode >= 400) {
      this.logger.warn(`Chat client error: ${chatError.message}`);
    }

    // Set request ID in response header
    if (requestId) {
      void response.header(httpHeader.requestId, requestId);
    }

    // Return ChatError format as JSON
    void response.status(statusCode).send(chatError);
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
