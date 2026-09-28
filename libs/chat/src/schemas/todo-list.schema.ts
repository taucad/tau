import { dump, load } from 'js-yaml';
import { z } from 'zod';

/** The states a task moves through, in the order the list shows them. @public */
export const todoItemStatuses = ['pending', 'in_progress', 'done'] as const;

/** @public */
export type TodoItemStatus = (typeof todoItemStatuses)[number];

/** One task on a chat's list. @public */
export const todoItemSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'Use a lowercase slug such as "slice-pyramid".')
    .describe('Stable lowercase slug that survives reorders, e.g. "slice-pyramid".'),
  title: z.string().min(1).max(200).describe('Short, outcome-shaped title, e.g. "Slice the pyramid".'),
  status: z.enum(todoItemStatuses).describe('pending, in_progress (one at a time) or done.'),
  note: z.string().max(500).optional().describe('One line the person may want beside the title.'),
});

const uniqueIds = (items: ReadonlyArray<{ readonly id: string }>): boolean =>
  new Set(items.map((item) => item.id)).size === items.length;

/** Every item, in the order shown; ids are unique and the list stays short. @public */
export const todoItemsSchema = z.array(todoItemSchema).max(50).refine(uniqueIds, 'Every item id must be unique.');

/** The whole file at {@link todoListPath}: the only durable shape of a chat's task list (D8). @public */
export const todoListSchema = z.object({
  version: z.literal(1),
  items: todoItemsSchema,
});

/** @public */
export type TodoItem = z.infer<typeof todoItemSchema>;
/** @public */
export type TodoList = z.infer<typeof todoListSchema>;

/**
 * Where a chat keeps its task list, beside its event log.
 *
 * @param chatId - The owning chat.
 * @returns `.tau/chats/<chatId>/todo.yaml`, relative to the project root.
 * @public
 *
 * @example <caption>Reading the active chat's list</caption>
 * ```typescript
 * import { todoListPath } from '@taucad/chat';
 *
 * const path = todoListPath('chat_01');
 * ```
 */
export const todoListPath = (chatId: string): string => `.tau/chats/${chatId}/todo.yaml`;

/**
 * The bytes a list is stored as: fixed key order and no line folding, so two
 * equal lists are byte-identical and a diff reads as a change of tasks.
 *
 * @param list - A validated list.
 * @returns YAML text ending in one newline.
 * @public
 */
export const serializeTodoList = (list: TodoList): string =>
  dump(
    {
      version: list.version,
      items: list.items.map(({ id, title, status, note }) => ({
        id,
        title,
        status,
        ...(note === undefined ? {} : { note }),
      })),
    },
    { lineWidth: -1 },
  );

/** What {@link parseTodoList} answers: the list, or why the text is not one. @public */
export type ParsedTodoList =
  | { readonly success: true; readonly list: TodoList }
  | { readonly success: false; readonly message: string };

/**
 * Read a stored list back, refusing anything that is not exactly {@link todoListSchema}.
 *
 * @param text - The file's text.
 * @returns The list, or a message naming the first problem.
 * @public
 */
export const parseTodoList = (text: string): ParsedTodoList => {
  let document: unknown;
  try {
    document = load(text);
  } catch (error) {
    return {
      success: false,
      message: `todo.yaml is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const parsed = todoListSchema.safeParse(document);
  return parsed.success
    ? { success: true, list: parsed.data }
    : { success: false, message: z.prettifyError(parsed.error) };
};

/**
 * How many items sit in each status.
 *
 * @param items - The list's items.
 * @returns One count per status, zero included.
 * @public
 */
export const todoListCounts = (items: readonly TodoItem[]): Record<TodoItemStatus, number> => {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
  const counts: Record<TodoItemStatus, number> = { pending: 0, in_progress: 0, done: 0 };
  for (const item of items) {
    counts[item.status] += 1;
  }
  return counts;
};
