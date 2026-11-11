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

const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
  useChatSelector: vi.fn(),
}));
/* The chat's session machine waits on nothing in these rows (audit R5). */
vi.mock('#hooks/active-chat-provider.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useChatAutoResume: () => undefined,
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

  // ── Automatic resume of a transient provider outage (R6; the chat's machine waits it out, audit R5) ──

  it('should count down beside Resume while the chat waits out the outage, and never resume itself', () => {
    vi.useFakeTimers();
    try {
      render(<ChatErrorServiceUnavailable resumable countdown={{ resumeAt: Date.now() + 2000 }} />);

      expect(screen.getByRole('timer')).toHaveTextContent('Resuming in 2 seconds');
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(continueChat).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not count down when the chat waits on nothing', () => {
    render(<ChatErrorServiceUnavailable resumable />);

    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
  });
});
