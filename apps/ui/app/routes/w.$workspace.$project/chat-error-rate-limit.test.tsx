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

  it('should resume the interrupted turn rather than offering to try again', async () => {
    const user = userEvent.setup();

    const { container } = render(<ChatErrorRateLimit resumable retryAfterSeconds={30} />);

    expect(screen.getByText('Rate limit reached')).toBeInTheDocument();
    expect(screen.getByText('The model provider asked Tau to wait.')).toBeInTheDocument();
    expect(screen.getByText('Resume in 30 seconds.')).toBeInTheDocument();
    expect(screen.getByText('Everything up to here is saved.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('border-warning/20', 'bg-warning/10');

    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('shows funded-operation copy without presenting it as ordinary pacing', () => {
    render(
      <ChatErrorRateLimit
        resumable={false}
        title='Funded operation limit reached'
        description='The funded-operation failsafe is active.'
      />,
    );

    expect(screen.getByText('Funded operation limit reached')).toBeInTheDocument();
    expect(screen.getByText('The funded-operation failsafe is active.')).toBeInTheDocument();
  });

  /* F5: this card is category-routed, so it also serves 429 codes the host
     rules unrecoverable. Those must not claim the turn is saved. */
  it('should promise nothing and keep Try again for a wait the host will not resume', async () => {
    const user = userEvent.setup();

    render(<ChatErrorRateLimit resumable={false} retryAfterSeconds={30} />);

    expect(screen.getByText('Rate limit exceeded')).toBeInTheDocument();
    expect(screen.getByText('Try again in 30 seconds.')).toBeInTheDocument();
    expect(screen.queryByText('Everything up to here is saved.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/iu })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });
});
