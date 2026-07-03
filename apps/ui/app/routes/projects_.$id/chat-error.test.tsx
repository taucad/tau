/**
 * R7: Hide the chat error banner while the persistence machine is between
 * transparent auto-retry attempts (`retryAttempt > 0`).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload } from '@taucad/types';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { ChatError as ChatErrorBanner } from '#routes/projects_.$id/chat-error.js';

const continueChat = vi.fn();
const regenerate = vi.fn();

let mockRetryAttempt = 0;

const googleInvalidArgumentBody = [
  {
    error: {
      code: 400,
      message: 'Request contains an invalid argument.',
      status: 'INVALID_ARGUMENT',
    },
  },
];

const googleInvalidArgumentByteList = [...new TextEncoder().encode(JSON.stringify(googleInvalidArgumentBody))].join(
  ',',
);

vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat, regenerate }),
  useChatRetrySnapshot: () => ({ retryAttempt: mockRetryAttempt, retryMaxAttempts: 5 }),
  useChatSelector: vi.fn(),
}));

vi.mock('#components/code/code-viewer.js', () => ({
  CodeViewer: ({ text }: { readonly text: string }) => <pre data-testid='code-viewer'>{text}</pre>,
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

  it('should continue the server-category fallback when Try again is clicked', async () => {
    const user = userEvent.setup();
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
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('should continue the generic fallback when Try again is clicked', async () => {
    const user = userEvent.setup();
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

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('should continue unknown fallback categories instead of regenerating', async () => {
    const user = userEvent.setup();
    const unknownError = {
      category: 'unknown',
      title: 'Unknown Error',
      message: 'Something unusual happened',
    } as unknown as ChatErrorPayload;
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: unknownError,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 0;

    render(<ChatErrorBanner />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('should render a credit error as warning Resume UI outside the tool-error fallback', async () => {
    const user = userEvent.setup();
    const creditMessage =
      'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.';
    const creditError: ChatErrorPayload = {
      category: errorCategory.credits,
      title: 'Credit Limit Reached',
      message: creditMessage,
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: creditError,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 0;

    render(<ChatErrorBanner />);

    expect(screen.getByText('Credit Limit Reached')).toBeInTheDocument();
    expect(screen.getByText(creditMessage)).toBeInTheDocument();
    expect(screen.queryByText('Processing Error')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /resume/i }));

    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('renders decoded Google provider errors instead of opaque byte lists', () => {
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: new Error(`Google request failed with status code 400: ${googleInvalidArgumentByteList}`),
        persistedError: undefined,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 0;

    render(<ChatErrorBanner />);

    expect(screen.getByText('Request contains an invalid argument.')).toBeInTheDocument();
    expect(screen.queryByText(/91,123,10/)).not.toBeInTheDocument();
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
