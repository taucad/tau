import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatMessageQueueView } from '#components/chat/chat-message-queue-view.js';
import type { ChatMessageQueueProps } from '#components/chat/chat-message-queue-view.js';

const fixture = (overrides: Partial<ChatMessageQueueProps> = {}): ChatMessageQueueProps => ({
  items: [
    {
      id: 'one',
      requestId: 'req_one',
      message: { id: 'one', role: 'user', parts: [{ type: 'text', text: 'Keep the scope large' }] },
    },
  ],
  onEdit: vi.fn(async () => undefined),
  onSteer: vi.fn(async () => undefined),
  onMove: vi.fn(async () => undefined),
  onRetry: vi.fn(),
  ...overrides,
});
describe('queued message adornment', () => {
  it('should ignore keyboard reordering when delivery locks a focused handle', async () => {
    const user = userEvent.setup();
    const props = fixture();
    const items: ChatMessageQueueProps['items'] = [
      ...props.items,
      {
        id: 'two',
        requestId: 'req_two',
        message: { id: 'two', role: 'user', parts: [{ type: 'text', text: 'Second' }] },
      },
    ];
    const { rerender } = render(<ChatMessageQueueView {...props} items={items} />);
    const handle = screen.getByRole('button', { name: 'Reorder queued message 2' });
    handle.focus();
    rerender(<ChatMessageQueueView {...props} items={items} sendingId='one' />);
    await user.keyboard('{ArrowUp}');
    expect(props.onMove).not.toHaveBeenCalled();
  });

  it('should reorder from the handle with the keyboard and remove Move to front', async () => {
    const user = userEvent.setup();
    const props = fixture();
    const second: ChatMessageQueueProps['items'][number] = {
      id: 'two',
      requestId: 'req_two',
      message: { id: 'two', role: 'user', parts: [{ type: 'text', text: 'Second' }] },
    };
    render(<ChatMessageQueueView {...props} items={[...props.items, second]} />);
    const handle = screen.getByRole('button', { name: 'Reorder queued message 2' });
    handle.focus();
    await user.keyboard('{ArrowUp}');
    expect(props.onMove).toHaveBeenCalledWith('two', 'one');
    await user.click(screen.getByRole('button', { name: 'Options for queued message 2' }));
    expect(screen.queryByRole('menuitem', { name: 'Move to front' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeVisible();
  });
  it('should discard an action retry when another tab removes its item', async () => {
    const user = userEvent.setup();
    const props = fixture({
      onEdit: vi.fn(async () => {
        throw new Error('Storage unavailable');
      }),
    });
    const { rerender } = render(<ChatMessageQueueView {...props} />);
    await user.click(screen.getByRole('button', { name: 'Delete queued message 1' }));
    expect(await screen.findByRole('alert')).toMatchTextContent('Storage unavailable');
    rerender(<ChatMessageQueueView {...props} items={[]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Queued messages' })).not.toBeInTheDocument();
  });
  it('should label a failed durable Send now and retry its existing command', async () => {
    const user = userEvent.setup();
    const props = fixture({ error: 'Connection lost. Retry to confirm the interruption.' });
    const items = props.items.map<ChatMessageQueueProps['items'][number]>((item) => ({
      ...item,
      steer: { type: 'cancel', commandId: 'same_cancel', payload: { chatId: 'chat', runId: 'original' } },
    }));
    render(<ChatMessageQueueView {...props} items={items} />);
    expect(screen.getByRole('status')).toMatchTextContent('Send failed');
    expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
    expect(props.onSteer).not.toHaveBeenCalled();
  });
  it('should retain text and show a spinner while Send now is pending, then report a failed save', async () => {
    const user = userEvent.setup();
    const operation = Promise.withResolvers<void>();
    const props = fixture({ onSteer: async () => operation.promise });
    render(<ChatMessageQueueView {...props} />);
    await user.click(screen.getByRole('button', { name: 'Send now' }));
    expect(screen.getByText('Keep the scope large')).toBeVisible();
    expect(screen.getByRole('status')).toMatchTextContent('Sending');
    expect(screen.getByRole('button', { name: 'Delete queued message 1' })).toBeDisabled();
    operation.reject(new Error('Disk full. Message is still saved.'));
    expect(await screen.findByRole('alert')).toMatchTextContent('Disk full');
    expect(screen.getByText('Keep the scope large')).toBeVisible();
  });
  it('should edit inline without replacing the composer or dropping the queued item', async () => {
    const user = userEvent.setup();
    const props = fixture();
    render(<ChatMessageQueueView {...props} />);
    await user.click(screen.getByRole('button', { name: 'Options for queued message 1' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit message' }));
    const editor = screen.getByRole('textbox', { name: 'Edit queued message' });
    await user.clear(editor);
    await user.type(editor, 'Make the gear stronger');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(props.onEdit).toHaveBeenCalledWith('one', 'Make the gear stronger');
    });
  });
  it('should make uncertain deliveries immutable and expose a retry action', async () => {
    const user = userEvent.setup();
    const props = fixture({ sendingId: 'one', error: 'Waiting for acknowledgement' });
    render(<ChatMessageQueueView {...props} />);
    expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete queued message 1' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetry).toHaveBeenCalledOnce();
  });
  it.each(['delete', 'edit'] as const)(
    'should retry the failed %s action without sending the message',
    async (action) => {
      const user = userEvent.setup();
      const retried = Promise.withResolvers<void>();
      const onEdit = vi
        .fn<ChatMessageQueueProps['onEdit']>()
        .mockRejectedValueOnce(new Error('Storage unavailable'))
        .mockImplementationOnce(async () => retried.promise);
      const props = fixture({ onEdit });
      render(<ChatMessageQueueView {...props} />);
      if (action === 'edit') {
        await user.click(screen.getByRole('button', { name: 'Options for queued message 1' }));
        await user.click(screen.getByRole('menuitem', { name: 'Edit message' }));
        const editor = screen.getByRole('textbox', { name: 'Edit queued message' });
        await user.clear(editor);
        await user.type(editor, 'Keep this exact edit');
        await user.click(screen.getByRole('button', { name: 'Save' }));
      } else {
        await user.click(screen.getByRole('button', { name: 'Delete queued message 1' }));
      }
      expect(await screen.findByRole('alert')).toMatchTextContent('Storage unavailable');
      try {
        await user.click(screen.getByRole('button', { name: 'Retry' }));
        expect(onEdit.mock.calls).toEqual([
          ['one', action === 'edit' ? 'Keep this exact edit' : undefined],
          ['one', action === 'edit' ? 'Keep this exact edit' : undefined],
        ]);
        expect(props.onRetry).not.toHaveBeenCalled();
        expect(screen.getByRole('status')).toMatchTextContent(action === 'edit' ? 'Saving' : 'Removing');
        expect(screen.getByRole('button', { name: 'Send now' })).toBeDisabled();
      } finally {
        retried.resolve();
      }
      await waitFor(() => {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
      });
    },
  );
});
