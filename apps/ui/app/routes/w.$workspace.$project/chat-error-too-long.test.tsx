import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorTooLong } from '#routes/w.$workspace.$project/chat-error-too-long.js';

const openNewChat = vi.fn(async () => undefined);
const continueChat = vi.fn();
const regenerate = vi.fn();
const execution = { kind: 'tau', model: 'openai-gpt-6-astra' } as const;

vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ execution: { execution } }),
}));
vi.mock('#routes/w.$workspace.$project/use-open-new-chat.js', () => ({
  useOpenNewChat: () => ({ openNewChat, isReady: true }),
}));
vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
}));

describe('ChatErrorTooLong', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should offer Resume before Try again and New chat when the host kept the turn', async () => {
    const user = userEvent.setup();
    const { container } = render(<ChatErrorTooLong resumable />);

    expect(screen.getByText('This chat is too long to continue')).toBeInTheDocument();
    expect(screen.getByText('Tau could not make room for the next step.')).toBeInTheDocument();
    expect(screen.getByText('Resume to continue without losing your work.')).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Resume',
      'Try again',
      'New chat',
    ]);
    expect(container.firstElementChild).not.toHaveClass('bg-destructive/10');

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(continueChat).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerate).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(openNewChat).toHaveBeenCalledWith({ activeExecution: execution });
  });
});
