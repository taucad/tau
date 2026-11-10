import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorRateLimit } from '#routes/w.$workspace.$project/chat-error-rate-limit.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

const useChatActions = vi.fn((): { continueChat: () => void; regenerate: () => void } => ({
  continueChat,
  regenerate,
}));

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => useChatActions(),
}));

describe('ChatErrorRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatActions.mockReturnValue({ continueChat, regenerate });
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
    expect(container.firstElementChild).not.toHaveClass('border-warning/20', 'bg-warning/10');

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

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
  });

  // ── Automatic resume (the chat's session machine waits it out, audit R5) ─────────────

  it('should count down beside Resume to the moment the chat resumes, without resuming itself', () => {
    vi.useFakeTimers();
    try {
      render(<ChatErrorRateLimit resumable retryAfterSeconds={3} countdown={{ resumeAt: Date.now() + 3000 }} />);

      const timer = screen.getByRole('timer');
      expect(timer).toHaveTextContent('Resuming in 3 seconds');
      expect(timer.nextElementSibling).toBe(screen.getByRole('button', { name: 'Resume' }));
      expect(screen.queryByText('Resume in 3 seconds.')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole('timer')).toHaveTextContent('Resuming in 1 second');

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      // The resume is the machine's: the label never sends it.
      expect(continueChat).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should keep the countdown on the machine’s clock across a remount', () => {
    vi.useFakeTimers();
    try {
      const countdown = { resumeAt: Date.now() + 5000 };
      const { unmount } = render(<ChatErrorRateLimit resumable retryAfterSeconds={5} countdown={countdown} />);
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      unmount();

      render(<ChatErrorRateLimit resumable retryAfterSeconds={5} countdown={countdown} />);

      // A remount reads the same moment: it neither restarts the wait nor cancels it.
      expect(screen.getByRole('timer')).toHaveTextContent('Resuming in 2 seconds');
      expect(continueChat).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should resume once when the person clicks Resume during the countdown', () => {
    render(<ChatErrorRateLimit resumable retryAfterSeconds={5} countdown={{ resumeAt: Date.now() + 5000 }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('should say how long to wait, and not count down, when the chat waits on nothing', () => {
    render(<ChatErrorRateLimit resumable retryAfterSeconds={1} />);

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    expect(screen.getByText('Resume in 1 second.')).toBeInTheDocument();
  });
});
