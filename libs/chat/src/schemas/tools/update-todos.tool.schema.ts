import { z } from 'zod';
import { todoItemStatuses, todoItemsSchema } from '#schemas/todo-list.schema.js';

/** @public */
export const updateTodosInputSchema = z.object({
  chatId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,128}$/u, 'chatId is one path segment: letters, digits, "-" and "_".')
    .describe('Your chat id: the <chatId> segment of your conversation log path.'),
  items: todoItemsSchema.describe('The whole list in order. It replaces the previous list; anything omitted is gone.'),
});

/** @public */
export const updateTodosOutputSchema = z.object({
  path: z.string().describe('Where the list was written, relative to the project root.'),
  counts: z.record(z.enum(todoItemStatuses), z.number().int().nonnegative()).describe('Items per status.'),
});

/** @public */
export type UpdateTodosInput = z.infer<typeof updateTodosInputSchema>;
/** @public */
export type UpdateTodosOutput = z.infer<typeof updateTodosOutputSchema>;
