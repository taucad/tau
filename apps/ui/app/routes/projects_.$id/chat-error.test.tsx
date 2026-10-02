/**
 * R7: Hide the chat error banner while the persistence machine is between
 * transparent auto-retry attempts (`retryAttempt > 0`).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen } from '@testing-library/react';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload } from '@taucad/types';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { ChatError as ChatErrorBanner } from '#routes/projects_.$id/chat-error.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

let mockRetryAttempt = 0;

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
  useChatRetrySnapshot: () => ({ retryAttempt: mockRetryAttempt, retryMaxAttempts: 5 }),
  useChatSelector: vi.fn(),
}));

describe('ChatError', () => {
  beforeEach(() => {
    mockRetryAttempt = 0;
    vi.clearAllMocks();
  });

  it('T23: renders null when retryAttempt > 0 even with a persisted resumable error', () => {
    const networkError: ChatErrorPayload = {
      category: errorCategory.network,
      title: 'Connection Error',
      message: 'Unable to connect',
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: networkError,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 2;

    const { container } = render(<ChatErrorBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('T23: renders null for generic category when retrying', () => {
    const genericError: ChatErrorPayload = {
      category: errorCategory.generic,
      title: 'Error',
      message: 'network error',
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: genericError,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 1;

    const { container } = render(<ChatErrorBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the network banner when retryAttempt is 0', () => {
    const networkError: ChatErrorPayload = {
      category: errorCategory.network,
      title: 'Connection Error',
      message: 'Unable to connect',
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: networkError,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 0;

    render(<ChatErrorBanner />);
    expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();
  });

  /**
   * Generic-banner button label must mirror the action: a resumable category
   * (network/server/overloaded) calls `continueChat` and therefore reads
   * "Resume"; everything else calls `regenerate` and reads "Retry". The
   * server-category render falls through to the generic banner today (only
   * `network` and `overloaded` have specialised components), so it is the
   * sole code path that exercises the "Resume" branch in `chat-error.tsx`.
   */
  it('renders a "Resume" button for the server category (resumable -> continueChat)', () => {
    const serverError: ChatErrorPayload = {
      category: errorCategory.server,
      title: 'Server Error',
      message: 'Upstream failure',
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: serverError,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 0;

    render(<ChatErrorBanner />);
    expect(screen.getByRole('button', { name: /resume/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('renders a "Retry" button for the generic category (non-resumable -> regenerate)', () => {
    const genericError: ChatErrorPayload = {
      category: errorCategory.generic,
      title: 'Error',
      message: 'Something went wrong',
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: genericError,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 0;

    render(<ChatErrorBanner />);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
  });

  describe('hook-order stability across retryAttempt transitions', () => {
    /**
     * Regression for React error #300 ("Rendered fewer hooks than expected").
     *
     * Earlier versions of this component placed the `if (retryAttempt > 0) return null;`
     * gate ABOVE the `useChatSelector` / `useChatActions` calls, so a transient
     * 0 -> N -> 0 retry burst on the SAME fiber changed the hook count between
     * renders and the surrounding `<FloatingPanel>` boundary surfaced the
     * "Chat Unavailable" screen. This test re-renders the same fiber across
     * the transition and asserts React stays silent on hook diffs.
     */
    let consoleErrorSpy: MockInstance<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {
        return undefined;
      });
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('survives retryAttempt 0 -> 2 -> 0 on the same fiber without a hook-order warning', () => {
      const networkError: ChatErrorPayload = {
        category: errorCategory.network,
        title: 'Connection Error',
        message: 'Unable to connect',
      };
      vi.mocked(useChatSelector).mockImplementation((selector) =>
        selector({
          error: undefined,
          persistedError: networkError,
        } as unknown as CombinedChatState),
      );

      mockRetryAttempt = 0;
      const { rerender, container } = render(<ChatErrorBanner key='same-fiber' />);
      expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();

      mockRetryAttempt = 2;
      rerender(<ChatErrorBanner key='same-fiber' className='force-rerender' />);
      expect(container.firstChild).toBeNull();

      mockRetryAttempt = 0;
      rerender(<ChatErrorBanner key='same-fiber' />);
      expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();

      const calls = consoleErrorSpy.mock.calls as ReadonlyArray<readonly unknown[]>;
      const hookErrors = calls.filter((call) =>
        call.some(
          (argument) =>
            typeof argument === 'string' &&
            (argument.includes('Rendered fewer hooks than expected') ||
              argument.includes('Rendered more hooks than expected') ||
              argument.includes('change in the order of Hooks') ||
              argument.includes('Minified React error #300') ||
              argument.includes('Minified React error #310')),
        ),
      );
      expect(hookErrors).toEqual([]);
    });
  });
});
