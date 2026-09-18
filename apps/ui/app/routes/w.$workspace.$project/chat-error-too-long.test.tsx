import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorTooLong } from '#routes/w.$workspace.$project/chat-error-too-long.js';

const openNewChat = vi.fn(async () => undefined);
const execution = { kind: 'tau', model: 'openai-gpt-6-astra' } as const;

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ execution: { execution } }),
}));
vi.mock('#routes/w.$workspace.$project/use-open-new-chat.js', () => ({
  useOpenNewChat: () => ({ openNewChat, isReady: true }),
}));

describe('ChatErrorTooLong', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should offer a new chat and nothing that would meet the same refusal', async () => {
    const user = userEvent.setup();
    const { container } = render(<ChatErrorTooLong />);

    expect(screen.getByText('This chat is too long to continue')).toBeInTheDocument();
    expect(
      screen.getByText('Tau could not make room for the next step. Start a new chat; this one stays readable.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/iu })).not.toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass('bg-destructive/10');

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(openNewChat).toHaveBeenCalledWith({ activeExecution: execution });
  });
});
