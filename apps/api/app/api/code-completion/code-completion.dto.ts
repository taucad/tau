import { z } from 'zod';

export const codeCompletionRequestSchema = z
  .object({
    admission: z.object({ version: z.literal(1), idempotencyKey: z.string().min(16).max(128) }).strict(),
    completionMetadata: z
      .object({
        textBeforeCursor: z.string().max(200_000),
        textAfterCursor: z.string().max(200_000),
        filename: z.string().max(1024).optional(),
        language: z.string().max(128).optional(),
        technologies: z.array(z.string().max(128)).max(64).optional(),
      })
      .strict(),
  })
  .strict();

export type CodeCompletionRequest = z.infer<typeof codeCompletionRequestSchema>;
