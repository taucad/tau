// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import type { TodoItem, ToolInvocation } from '@taucad/chat';
import type { toolName } from '@taucad/chat/constants';
import { ChatMessageToolUpdateTodos } from '#routes/w.$workspace.$project/chat-message-tool-update-todos.js';

vi.mock('#components/chat/chat-tool-error.js', () => ({
  ChatToolError: ({ errorText, noun }: { readonly errorText: string; readonly noun: string }) => (
    <div role='alert'>
      {noun}: {errorText}
    </div>
  ),
}));

type UpdateTodosInvocation = ToolInvocation<typeof toolName.updateTodos>;

const items: TodoItem[] = [
  { id: 'model-pyramid', title: 'Model the pyramid', status: 'done' },
  { id: 'slice-pyramid', title: 'Slice the pyramid', status: 'in_progress' },
  { id: 'request-print', title: 'Request the print', status: 'pending' },
];

afterEach(cleanup);

describe('ChatMessageToolUpdateTodos', () => {
  it('should start folded on its summary line and disclose the written list by keyboard', async () => {
    const part: UpdateTodosInvocation = {
      toolCallId: 'todos-1',
      state: 'output-available',
      input: { chatId: 'chat_01', items },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
      output: { path: '.tau/chats/chat_01/todo.yaml', counts: { pending: 1, in_progress: 1, done: 1 } },
    };
    render(<ChatMessageToolUpdateTodos part={part} />);

    const toggle = screen.getByRole('button', { name: 'Tasks · 1 of 3 done · Slice the pyramid' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Model the pyramid')).not.toBeInTheDocument();

    toggle.focus();
    await userEvent.keyboard('{Enter}');

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Model the pyramid').parentElement).toHaveTextContent('done: Model the pyramid');
    expect(screen.getByText('Slice the pyramid').parentElement).toHaveTextContent('in progress: Slice the pyramid');
    expect(screen.getByText('Request the print').parentElement).toHaveTextContent('pending: Request the print');
  });

  it('should name the next pending task when nothing is in progress', () => {
    render(
      <ChatMessageToolUpdateTodos
        part={{
          toolCallId: 'todos-1',
          state: 'output-available',
          input: { chatId: 'chat_01', items: [items[0]!, { ...items[2]!, status: 'pending' }] },
          // eslint-disable-next-line @typescript-eslint/naming-convention -- keys are the status wire values
          output: { path: '.tau/chats/chat_01/todo.yaml', counts: { pending: 1, in_progress: 0, done: 1 } },
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Tasks · 1 of 2 done · Request the print' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('should show the active verb while the list is being written', () => {
    render(
      <ChatMessageToolUpdateTodos
        part={{ toolCallId: 'todos-1', state: 'input-available', input: { chatId: 'chat_01', items } }}
      />,
    );
    expect(screen.getByText('Updating')).toBeVisible();
    expect(screen.getByText('tasks…')).toBeVisible();
  });

  it('should hand a failure to the shared tool error with its noun', () => {
    render(
      <ChatMessageToolUpdateTodos
        part={{
          toolCallId: 'todos-1',
          state: 'output-error',
          input: { chatId: 'chat_01', items },
          errorText: 'Every item id must be unique.',
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('task list: Every item id must be unique.');
  });
});
