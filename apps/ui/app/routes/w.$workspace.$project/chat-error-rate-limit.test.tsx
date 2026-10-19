import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatErrorRateLimit } from '#routes/w.$workspace.$project/chat-error-rate-limit.js';
import { maximumRateLimitAutoResumes, resetRateLimitAutoResumes } from '#utils/rate-limit-auto-resume.js';

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
    resetRateLimitAutoResumes();
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

  // ── Automatic resume ────────────────────────────────────────────────

  it('should count down beside Resume and resume on its own when the wait ends', () => {
    vi.useFakeTimers();
    try {
      render(<ChatErrorRateLimit resumable retryAfterSeconds={3} autoResume={{ runId: 'run-1', attempt: 1 }} />);

      const timer = screen.getByRole('timer');
      expect(timer).toHaveTextContent('Resuming in 3 seconds');
      expect(timer.nextElementSibling).toBe(screen.getByRole('button', { name: 'Resume' }));
      expect(screen.queryByText('Resume in 3 seconds.')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.getByRole('timer')).toHaveTextContent('Resuming in 1 second');
      expect(continueChat).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(continueChat).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should back off from 200 ms when the gateway sent no Retry-After, ignoring the sentence', () => {
    vi.useFakeTimers();
    try {
      render(
        <ChatErrorRateLimit
          resumable
          description='Please try again in 7s.'
          autoResume={{ runId: 'run-1', attempt: 1 }}
        />,
      );

      // The gateway owns the provider's advice; the card reads only its estimate.
      expect(screen.getByRole('timer')).toHaveTextContent('Resuming in 1 second');
      act(() => {
        vi.advanceTimersByTime(220);
      });
      expect(continueChat).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should resume once when the person clicks Resume during the countdown', () => {
    vi.useFakeTimers();
    try {
      render(<ChatErrorRateLimit resumable retryAfterSeconds={5} autoResume={{ runId: 'run-1', attempt: 1 }} />);

      fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(continueChat).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should stop counting down once the run has spent its automatic resumes', () => {
    vi.useFakeTimers();
    try {
      for (let attempt = 1; attempt <= maximumRateLimitAutoResumes; attempt += 1) {
        const { unmount } = render(
          <ChatErrorRateLimit resumable retryAfterSeconds={1} autoResume={{ runId: 'run-1', attempt }} />,
        );
        act(() => {
          vi.advanceTimersByTime(1000);
        });
        unmount();
      }
      expect(continueChat).toHaveBeenCalledTimes(maximumRateLimitAutoResumes);

      render(
        <ChatErrorRateLimit
          resumable
          retryAfterSeconds={1}
          autoResume={{
            runId: 'run-1',
            attempt: maximumRateLimitAutoResumes + 1,
          }}
        />,
      );

      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      expect(screen.getByText('Resume in 1 second.')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not count down for a wait the host will not resume', () => {
    render(<ChatErrorRateLimit resumable={false} retryAfterSeconds={1} autoResume={{ runId: 'run-1', attempt: 1 }} />);

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });

  it('should not resume the same attempt again when the countdown re-arms after firing', () => {
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <ChatErrorRateLimit resumable retryAfterSeconds={1} autoResume={{ runId: 'run-1', attempt: 1 }} />,
      );
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(continueChat).toHaveBeenCalledTimes(1);

      // A new action identity re-runs the countdown's effect with no time left.
      useChatActions.mockReturnValue({
        continueChat: () => {
          continueChat();
        },
        regenerate,
      });
      rerender(<ChatErrorRateLimit resumable retryAfterSeconds={1} autoResume={{ runId: 'run-1', attempt: 1 }} />);
      console.log('DBG timer', screen.queryByRole('timer')?.textContent);
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(continueChat).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should cancel the pending resume when the card unmounts', () => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(
        <ChatErrorRateLimit resumable retryAfterSeconds={2} autoResume={{ runId: 'run-1', attempt: 1 }} />,
      );

      unmount();
      act(() => {
        vi.advanceTimersByTime(5000);
      });

      expect(continueChat).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
