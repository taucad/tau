import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorRateLimit } from '#routes/w.$workspace.$project/chat-error-rate-limit.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
}));

describe('ChatErrorRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should continue the interrupted chat when Try again is clicked', async () => {
    const user = userEvent.setup();

    const { container } = render(<ChatErrorRateLimit />);

    expect(screen.getByText('Rate Limit Exceeded')).toBeInTheDocument();
    expect(screen.getByText('Too many requests. Please wait a moment before trying again.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('border-warning/20', 'bg-warning/10');

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });
});
