/**
 * ChatErrorServiceUnavailable uses Try again copy with continuation behavior.
 *
 * `continueChat()` resumes the stream without touching `chat.messages`.
 * A destructive `regenerate()` here would erase partial assistant content
 * the user already saw before the network or service interruption.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorCategory } from '@taucad/types/constants';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { ChatError as ChatErrorBanner } from '#routes/w.$workspace.$project/chat-error.js';
import { ChatErrorServiceUnavailable } from '#routes/w.$workspace.$project/chat-error-service-unavailable.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
  useChatRetrySnapshot: () => ({ retryAttempt: 0, retryMaxAttempts: 5 }),
  useChatSelector: vi.fn(),
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
    render(<ChatErrorServiceUnavailable />);

    expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();
    expect(screen.getByText('Everything up to here is saved.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });
});
