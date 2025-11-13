import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { kernelProviders } from '@taucad/types/constants';
import { uiMessageSchema } from '#api/chat/message.dto.js';

const codeErrorSchema = z.object({
  message: z.string(),
  startLineNumber: z.number(),
  endLineNumber: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
});

const kernelErrorSchema = z.object({
  message: z.string(),
  startLineNumber: z.number(),
  endLineNumber: z.number(),
  startColumn: z.number(),
  endColumn: z.number(),
  stack: z.string(),
  stackFrames: z.array(
    z.object({
      fileName: z.string(),
      functionName: z.string(),
      lineNumber: z.number(),
      columnNumber: z.number(),
      source: z.string(),
    }),
  ),
});

export const createChatSchema = z.object({
  id: z.string(),
  messages: z.array(uiMessageSchema),
  code: z.string(),
  kernel: z.enum(kernelProviders).optional(),
  codeErrors: z.array(codeErrorSchema),
  kernelError: kernelErrorSchema.optional(),
  garbage: z.string(),
});

export class CreateChatDto extends createZodDto(createChatSchema) {}
