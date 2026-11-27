import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageAnnotations } from '@taucad/chat/annotations';
import { MessageCommentList } from '#components/comments/comment-list.js';
import { ShownCommentsProvider, useShownComments } from '#components/comments/shown-comments.js';

vi.mock('#hooks/use-chat.js', () => ({ useDraftActions: vi.fn(), useDraftSelector: vi.fn() }));

const pinned: MessageAnnotations = {
  version: 1,
  comments: [
    {
      number: 1,
      text: 'Taller',
      image: 'img-1',
      model: { point: [0, 0, 0], part: { componentId: 'hub', label: 'Hub' } },
    },
  ],
  images: [],
};

const onPicture: MessageAnnotations = {
  version: 1,
  comments: [{ number: 1, text: 'This corner', image: 'img-1', at: [0.5, 0.5] }],
  images: [],
};

function Shown(): React.JSX.Element {
  return <output>{useShownComments()?.shown?.messageId ?? 'none'}</output>;
}

describe('MessageCommentList', () => {
  it("should show a sent message's pins in the viewer from its last row, and hide them again", async () => {
    const user = userEvent.setup();
    render(
      <ShownCommentsProvider chatId='chat-1'>
        <MessageCommentList messageId='msg-1' annotations={pinned} />
        <Shown />
      </ShownCommentsProvider>,
    );

    expect(screen.getByText('Hub:')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show in viewer' }));
    expect(screen.getByRole('status')).toHaveTextContent('msg-1');

    await user.click(screen.getByRole('button', { name: 'Hide from viewer' }));
    expect(screen.getByRole('status')).toHaveTextContent('none');
  });

  it('should offer no viewer row for comments pinned only on pictures, or outside a chat', () => {
    const { rerender } = render(
      <ShownCommentsProvider chatId='chat-1'>
        <MessageCommentList messageId='msg-1' annotations={onPicture} />
      </ShownCommentsProvider>,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<MessageCommentList messageId='msg-1' annotations={pinned} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it("should not show one chat's sent comments once another chat is open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ShownCommentsProvider chatId='chat-1'>
        <MessageCommentList messageId='msg-1' annotations={pinned} />
        <Shown />
      </ShownCommentsProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Show in viewer' }));

    rerender(
      <ShownCommentsProvider chatId='chat-2'>
        <Shown />
      </ShownCommentsProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('none');
  });
});
