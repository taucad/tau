import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { uiMessagesSchema } from '@taucad/chat';

export const createChatSchema = z
  .object({
    id: z.string(),
    messages: uiMessagesSchema,
  })
  .meta({ id: 'CreateChat' });

export class CreateChatDto extends createZodDto(createChatSchema) {}
