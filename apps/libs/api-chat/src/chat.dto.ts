import { createZodDto } from 'nestjs-zod';
import { BadRequestException } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { chatTurnRequestSchema, parseChatTurnRequest } from '@taucad/chat/schemas';
import type { ChatTurnRequest } from '@taucad/chat/schemas';

/**
 * NestJS Zod DTO for synchronous schema generation from the shared
 * `chatTurnRequestSchema`. The controller's async pipe performs the actual
 * trust-boundary validation through `parseChatTurnRequest`.
 *
 * The DTO keeps its existing HTTP-layer name for schema consumers; its
 * `messages` property is deliberately `unknown[]` until async validation.
 *
 * @public
 */
export class CreateChatDto extends createZodDto(chatTurnRequestSchema) {}

/** Full async envelope and UI-message validation at the HTTP boundary. */
export class ChatMessagesValidationPipe implements PipeTransform<unknown, Promise<ChatTurnRequest>> {
  public async transform(value: unknown): Promise<ChatTurnRequest> {
    try {
      return await parseChatTurnRequest(value);
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        throw error;
      }
      const path = String(error.issues[0]?.path[0] ?? 'request').slice(0, 64);
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `Validation failed: ${path}: Invalid input.`,
      });
    }
  }
}
