// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';

let activeChatId = 'chat_alpha';
let fileContent: FileContentResult = { kind: 'loading' };
const requestedPaths: string[] = [];
const savedFolds = new Map<string, string>();

vi.mock('#hooks/use-chat.js', () => ({
  useChatContext: () => ({ activeChatId }),
}));
vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: (path: string) => {
    requestedPaths.push(path);
    return fileContent;
  },
}));

const { ChatTodoList } = await import('#components/chat/chat-todo-list.js');

const encoder = new TextEncoder();
const yamlOf = (lines: readonly string[]): FileContentResult => ({
  kind: 'text',
  content: new Uint8Array(encoder.encode(`${lines.join('\n')}\n`)),
});
const pyramid = yamlOf([
  'version: 1',
  'items:',
  '  - id: model-pyramid',
  '    title: Model the pyramid',
  '    status: done',
  '  - id: slice-pyramid',
  '    title: Slice the pyramid',
  '    status: in_progress',
  '    note: 0.2 mm layers',
  '  - id: request-print',
  '    title: Request the print',
  '    status: pending',
]);

beforeEach(() => {
  activeChatId = 'chat_alpha';
  fileContent = { kind: 'loading' };
  requestedPaths.length = 0;
  savedFolds.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => savedFolds.get(key) ?? null,
    setItem: (key: string, value: string) => savedFolds.set(key, value),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ChatTodoList', () => {
  it('should read the active chat list path and render the summary with the in-progress task', () => {
    fileContent = pyramid;
    render(<ChatTodoList />);

    expect(requestedPaths[0]).toBe('.tau/chats/chat_alpha/todo.yaml');
    const trigger = screen.getByRole('button', { name: 'Tasks: 1 of 3 done · Slice the pyramid' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument();
  });

  it('reveals every task and its note on request', async () => {
    const user = userEvent.setup();
    fileContent = pyramid;
    render(<ChatTodoList />);
    await user.click(screen.getByRole('button', { name: /1 of 3 done/u }));
    const list = screen.getByRole('list', { name: 'Tasks' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'done: Model the pyramid',
      'in progress: Slice the pyramid0.2 mm layers',
      'pending: Request the print',
    ]);
  });

  it('should collapse and expand by keyboard and remember the fold for this chat only', async () => {
    const user = userEvent.setup();
    fileContent = pyramid;
    render(<ChatTodoList />);
    const trigger = screen.getByRole('button', { name: /1 of 3 done/u });

    trigger.focus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('list', { name: 'Tasks' })).toBeVisible();
    expect(globalThis.localStorage.getItem('tau:chat-todo-collapsed:chat_alpha')).toBe('false');

    await user.keyboard(' ');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument();
    expect(globalThis.localStorage.getItem('tau:chat-todo-collapsed:chat_alpha')).toBe('true');
  });

  it('should remember an open chat without opening another chat by default', () => {
    globalThis.localStorage.setItem('tau:chat-todo-collapsed:chat_alpha', 'false');
    fileContent = pyramid;
    const { unmount } = render(<ChatTodoList />);
    expect(screen.getByRole('button', { name: /1 of 3 done/u })).toHaveAttribute('aria-expanded', 'true');
    unmount();

    activeChatId = 'chat_beta';
    render(<ChatTodoList />);
    expect(screen.getByRole('button', { name: /1 of 3 done/u })).toHaveAttribute('aria-expanded', 'false');
  });

  it('should update the summary and rows when the file content changes', () => {
    fileContent = pyramid;
    const { rerender } = render(<ChatTodoList />);
    expect(screen.getByRole('button', { name: 'Tasks: 1 of 3 done · Slice the pyramid' })).toBeVisible();

    fileContent = yamlOf([
      'version: 1',
      'items:',
      '  - id: model-pyramid',
      '    title: Model the pyramid',
      '    status: done',
      '  - id: slice-pyramid',
      '    title: Slice the pyramid',
      '    status: done',
      '  - id: request-print',
      '    title: Request the print',
      '    status: in_progress',
    ]);
    rerender(<ChatTodoList />);

    expect(screen.getByRole('button', { name: 'Tasks: 2 of 3 done · Request the print' })).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Tasks' })).not.toBeInTheDocument();
  });

  it('should render a summary without a current task when nothing is in progress', () => {
    fileContent = yamlOf(['version: 1', 'items:', '  - id: a', '    title: Ship it', '    status: done']);
    render(<ChatTodoList />);
    expect(screen.getByRole('button', { name: 'Tasks: 1 of 1 done' })).toBeVisible();
  });

  it.each([
    ['no file yet', { kind: 'orphaned' } as const],
    ['a file that is still loading', { kind: 'loading' } as const],
    ['an empty list', yamlOf(['version: 1', 'items: []'])],
    ['a list that does not parse', yamlOf(['version: 1', 'items:', '  - id: a', '    status: pending'])],
  ])('should render nothing for %s', (_label, content) => {
    fileContent = content;
    render(<ChatTodoList />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
