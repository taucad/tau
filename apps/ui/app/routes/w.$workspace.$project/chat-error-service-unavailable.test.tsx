/**
 * ChatErrorServiceUnavailable resumes only a run the host can continue.
 * Try again explicitly replays an unrecoverable turn.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorCategory } from '@taucad/types/constants';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { ChatError as ChatErrorBanner } from '#routes/w.$workspace.$project/chat-error.js';
import { ChatErrorServiceUnavailable } from '#routes/w.$workspace.$project/chat-error-service-unavailable.js';
import { parseErrorForPersistence } from '@taucad/chat-ui/utils/error.utils';
import { resetAutoResumes } from '#utils/run-auto-resume.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
  useChatSelector: vi.fn(),
}));
vi.mock('#routes/w.$workspace.$project/use-open-new-chat.js', () => ({
  useOpenNewChat: () => ({ openNewChat: vi.fn(), isReady: true }),
}));

describe('ChatErrorServiceUnavailable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('T24: TypeError("network error") classifies as network and ChatError renders this banner', () => {
    expect(parseErrorForPersistence(new TypeError('network error')).category).toBe(errorCategory.network);

    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: new TypeError('network error'),
        persistedError: undefined,
      } as unknown as CombinedChatState),
    );
    render(<ChatErrorBanner />);
    expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();
  });

  it('should resume the paused turn and say that it is saved', async () => {
    const user = userEvent.setup();
    render(<ChatErrorServiceUnavailable resumable />);

    expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();
    expect(screen.getByText('Everything up to here is saved.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  /* F5: this card is category-routed, so it also serves 503 codes the host
     rules unrecoverable (`BILLING_RECOVERY_UNAVAILABLE`). */
  it('should promise nothing and keep Try again for an outage the host will not resume', async () => {
    const user = userEvent.setup();
    render(<ChatErrorServiceUnavailable resumable={false} />);

    expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();
    expect(screen.queryByText('Everything up to here is saved.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/iu })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
  });

  // ── Automatic resume of a transient provider outage (R6) ──────────────

  it('should resume a PROVIDER_UNAVAILABLE pause once on its own after a short wait', () => {
    resetAutoResumes();
    vi.useFakeTimers();
    try {
      const { rerender } = render(
        <ChatErrorServiceUnavailable resumable autoResume={{ runId: 'run-1', attempt: 1 }} />,
      );

      expect(screen.getByRole('timer')).toHaveTextContent('Resuming in 2 seconds');
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(continueChat).toHaveBeenCalledTimes(1);

      rerender(<ChatErrorServiceUnavailable resumable autoResume={{ runId: 'run-1', attempt: 2 }} />);
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(continueChat).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not resume on its own without an auto-resume target or when the run is not resumable', () => {
    resetAutoResumes();
    vi.useFakeTimers();
    try {
      render(<ChatErrorServiceUnavailable resumable={false} autoResume={{ runId: 'run-1', attempt: 1 }} />);
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.queryByRole('timer')).not.toBeInTheDocument();
      expect(continueChat).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
