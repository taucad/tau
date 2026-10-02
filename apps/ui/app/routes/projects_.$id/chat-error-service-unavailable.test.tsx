/**
 * R1: ChatErrorServiceUnavailable banner Retry button rewires.
 *
 * The banner used to call `regenerate()` -- the destructive code path that
 * slices the trailing assistant tail and re-issues the user message --
 * which destroyed any partial assistant content the user had already seen
 * before the network drop. The rewire to `continueChat()` resumes the
 * stream WITHOUT touching `chat.messages`. This test pins the wiring so
 * a future refactor cannot silently re-introduce the regression.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorCategory } from '@taucad/types/constants';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { ChatError as ChatErrorBanner } from '#routes/projects_.$id/chat-error.js';
import { ChatErrorServiceUnavailable } from '#routes/projects_.$id/chat-error-service-unavailable.js';
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

  it('Resume button calls continueChat (NOT regenerate) so partial assistant parts survive', async () => {
    const user = userEvent.setup();
    render(<ChatErrorServiceUnavailable />);

    const resume = screen.getByRole('button', { name: /resume/i });
    await user.click(resume);

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });
});
