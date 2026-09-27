import { describe, expect, it } from 'vitest';
import {
  parseTodoList,
  serializeTodoList,
  todoItemsSchema,
  todoListCounts,
  todoListPath,
  todoListSchema,
} from '#schemas/todo-list.schema.js';
import type { TodoItem, TodoList } from '#schemas/todo-list.schema.js';

const pyramid: TodoList = {
  version: 1,
  items: [
    { id: 'model-pyramid', title: 'Model the pyramid', status: 'done' },
    { id: 'slice-pyramid', title: 'Slice the pyramid', status: 'in_progress', note: '0.2 mm layers' },
    { id: 'request-print', title: 'Request the print', status: 'pending' },
  ],
};

const pyramidYaml = `version: 1
items:
  - id: model-pyramid
    title: Model the pyramid
    status: done
  - id: slice-pyramid
    title: Slice the pyramid
    status: in_progress
    note: 0.2 mm layers
  - id: request-print
    title: Request the print
    status: pending
`;

describe('todoListPath', () => {
  it('should place the list beside the chat log', () => {
    expect(todoListPath('chat_01')).toBe('.tau/chats/chat_01/todo.yaml');
  });
});

describe('serializeTodoList', () => {
  it('should write the exact YAML bytes in schema key order with one trailing newline', () => {
    expect(serializeTodoList(pyramid)).toBe(pyramidYaml);
  });

  it('should be stable: the same list serializes to the same bytes regardless of key order', () => {
    const reordered: TodoList = {
      items: pyramid.items.map(({ note, status, title, id }) =>
        note === undefined ? { status, title, id } : { note, status, title, id },
      ),
      version: 1,
    };
    expect(serializeTodoList(reordered)).toBe(serializeTodoList(pyramid));
  });

  it('should not fold a long title across lines', () => {
    const title = 'x'.repeat(200);
    const yaml = serializeTodoList({ version: 1, items: [{ id: 'long', title, status: 'pending' }] });
    expect(yaml).toContain(`title: ${title}\n`);
  });
});

describe('parseTodoList', () => {
  it('should round-trip a serialized list', () => {
    expect(parseTodoList(serializeTodoList(pyramid))).toEqual({ success: true, list: pyramid });
  });

  it('should round-trip quoted titles that would otherwise read as YAML values', () => {
    const tricky: TodoList = { version: 1, items: [{ id: 'yes', title: 'yes: 1', status: 'pending' }] };
    expect(parseTodoList(serializeTodoList(tricky))).toEqual({ success: true, list: tricky });
  });

  it.each([
    ['malformed YAML', 'items: [', 'not valid YAML'],
    ['an empty file', '', 'expected object'],
    ['a wrong version', 'version: 2\nitems: []\n', 'version'],
    ['a missing title', 'version: 1\nitems:\n  - id: a\n    status: pending\n', 'title'],
    ['an unknown status', 'version: 1\nitems:\n  - id: a\n    title: A\n    status: doing\n', 'status'],
    ['an id that is not a slug', 'version: 1\nitems:\n  - id: Not A Slug\n    title: A\n    status: pending\n', 'slug'],
    [
      'duplicate ids',
      'version: 1\nitems:\n  - id: a\n    title: A\n    status: pending\n  - id: a\n    title: B\n    status: pending\n',
      'unique',
    ],
  ])('should refuse %s with a message', (_label, text, expectedMessage) => {
    const parsed = parseTodoList(text);
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }
    expect(parsed.message).toContain(expectedMessage);
  });
});

describe('todoListSchema', () => {
  it('should refuse more than fifty items', () => {
    const items = Array.from(
      { length: 51 },
      (_, index): TodoItem => ({
        id: `item-${String(index)}`,
        title: `Item ${String(index)}`,
        status: 'pending',
      }),
    );
    const result = todoItemsSchema.safeParse(items);
    expect(result.success).toBe(false);
    expect(todoListSchema.safeParse({ version: 1, items: items.slice(0, 50) }).success).toBe(true);
  });

  it('should refuse a note over five hundred characters', () => {
    const result = todoListSchema.safeParse({
      version: 1,
      items: [{ id: 'a', title: 'A', status: 'pending', note: 'n'.repeat(501) }],
    });
    expect(result.success).toBe(false);
  });
});

describe('todoListCounts', () => {
  it('should count every status, zero included', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
    expect(todoListCounts(pyramid.items)).toEqual({ pending: 1, in_progress: 1, done: 1 });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
    expect(todoListCounts([])).toEqual({ pending: 0, in_progress: 0, done: 0 });
  });
});
