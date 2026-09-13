import { createZodDto } from 'nestjs-zod';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';

/**
 * NestJS Zod DTO bound to the shared `chatTurnRequestSchema` (which lives in
 * `@taucad/chat/schemas` so the UI chat-clients can also validate against it).
 * Validation, JSON-Schema generation and OpenAPI all flow through the shared
 * schema — there is no per-controller shape.
 *
 * The DTO class keeps the HTTP-layer name `CreateChatDto` because it is the
 * `@Body()`-bound type for `POST /v1/chat`; the underlying schema is named
 * after the domain concept (a single chat turn) so consumers outside the
 * HTTP layer don't have to import "body" vocabulary.
 *
 * @public
 */
export class CreateChatDto extends createZodDto(chatTurnRequestSchema) {}
