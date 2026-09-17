/**
 * R7: Hide the chat error banner while the persistence machine is between
 * transparent auto-retry attempts (`retryAttempt > 0`).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload } from '@taucad/types';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { ChatError as ChatErrorBanner } from '#routes/w.$workspace.$project/chat-error.js';

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

/* The card's "Switch Model" action mounts the composer's own picker, which
 * reads the chat-scoped model resolver; this suite renders the banner alone. */
vi.mock('#components/chat/chat-model-selector.js', () => ({
  ChatModelSelector: ({ children }: { readonly children: (props: unknown) => React.ReactNode }) => (
    <div>{children({})}</div>
  ),
}));

/* The shortfall copy resolves the denied route's display name through the
 * catalogue hook, which reads route loader data this suite does not mount. */
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({ resolveModel: (id: string) => ({ id, name: id }) }),
}));

vi.mock('#routes/w.$workspace.$project/chat-error-agent-stop.js', () => ({
  ChatErrorAgentStop: ({ stop }: { readonly stop: { readonly failure: { readonly title: string } } }) => (
    <section aria-label='External agent stop'>{stop.failure.title}</section>
  ),
}));

vi.mock('#components/code/code-viewer.js', () => ({
  CodeViewer: ({ text }: { readonly text: string }) => <pre data-testid='code-viewer'>{text}</pre>,
}));

describe('ChatError', () => {
  beforeEach(() => {
    mockRetryAttempt = 0;
    vi.clearAllMocks();
  });

  it('tells the customer when a rate-limited request can be retried', () => {
    const rateLimited: ChatErrorPayload = {
      category: errorCategory.rateLimit,
      title: 'Rate Limit Exceeded',
      message: 'The funded-operation failsafe is active.',
      code: 'FUNDED_OPERATION_LIMIT',
      httpStatus: 429,
      details: { retryAfterSeconds: 30 },
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({ error: undefined, persistedError: rateLimited } as unknown as CombinedChatState),
    );

    render(<ChatErrorBanner />);

    expect(screen.getByText('Try again in 30 seconds.')).toBeInTheDocument();
  });

  it("should route an external agent's usage limit to its stop notice instead of the generic block", () => {
    const quota: ChatErrorPayload = {
      category: errorCategory.rateLimit,
      title: 'Rate Limit Exceeded',
      message: "You've hit your usage limit.",
      code: 'EXTERNAL_AGENT_LIMIT_REACHED',
      details: {
        agentId: 'codex',
        failure: { category: 'limit', title: "You've hit your usage limit.", actions: [] },
      },
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({ error: undefined, persistedError: quota } as unknown as CombinedChatState),
    );

    render(<ChatErrorBanner />);

    expect(screen.getByRole('region', { name: 'External agent stop' })).toHaveTextContent(
      "You've hit your usage limit.",
    );
    expect(screen.queryByText('Rate Limit Exceeded')).not.toBeInTheDocument();
  });

  it('should keep the generic fallback for an external failure whose details do not match the stop schema', () => {
    const malformed: ChatErrorPayload = {
      category: errorCategory.generic,
      title: 'Error',
      message: 'codex stopped unexpectedly: Internal error',
      code: 'EXTERNAL_AGENT_FAILED',
      details: { agentId: 'codex' },
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({ error: undefined, persistedError: malformed } as unknown as CombinedChatState),
    );

    render(<ChatErrorBanner />);

    expect(screen.queryByRole('region', { name: 'External agent stop' })).not.toBeInTheDocument();
    expect(screen.getByText('codex stopped unexpectedly: Internal error')).toBeInTheDocument();
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

  /* W2 carries `details` from the 402 all the way to the persisted ChatError;
   * the banner has to hand it to the card or the shortfall is lost again. */
  it('should pass the denial shortfall through to the credits card', () => {
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: {
          category: errorCategory.credits,
          title: 'Credit Limit Reached',
          message: 'Insufficient Tau credit for this model request.',
          details: {
            requiredCreditAtoms: '3084332',
            availableCreditAtoms: '2960000',
            routeId: 'openai-gpt-6-astra',
          },
        } satisfies ChatErrorPayload,
      } as unknown as CombinedChatState),
    );
    mockRetryAttempt = 0;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ChatErrorBanner />, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    expect(
      screen.getByText('Tau paused this turn: 13 more credits needed for openai-gpt-6-astra.'),
    ).toBeInTheDocument();
  });

  /* The useSyncExternalStore contract requires a cached snapshot. Parsing inside the selector
   * returned a fresh object with a nested `details` record on every read, which
   * looped the chat panel into "Maximum update depth exceeded". */
  it('should select stable snapshots for a structured runtime credit error', () => {
    const runtimeError = new Error(
      JSON.stringify({
        category: errorCategory.credits,
        title: 'Credit Limit Reached',
        message: 'Insufficient Tau credit for this model request.',
        code: 'INSUFFICIENT_CREDIT',
        httpStatus: 402,
        details: { requiredCreditAtoms: '3084332', availableCreditAtoms: '2960000', routeId: 'openai-gpt-6-astra' },
      }),
    );
    const state = { error: runtimeError, persistedError: undefined } as unknown as CombinedChatState;
    const snapshots: Array<[unknown, unknown]> = [];
    vi.mocked(useChatSelector).mockImplementation((selector) => {
      const value = selector(state);
      snapshots.push([value, selector(state)]);
      return value;
    });
    mockRetryAttempt = 0;

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ChatErrorBanner />, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    expect(snapshots.length).toBeGreaterThan(0);
    for (const [first, second] of snapshots) {
      expect(Object.is(first, second)).toBe(true);
    }
    expect(screen.getByText('Credit Limit Reached')).toBeInTheDocument();
  });

  /* The funded boundary's own 402 copy is credit-denominated and reaches the
   * banner verbatim — the chat never restates a charge in dollars (B4 R2). */
  it('should render a credit error as warning Resume UI outside the tool-error fallback', async () => {
    const user = userEvent.setup();
    const creditMessage = 'Insufficient Tau credit for this model request.';
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

    /* `ChatErrorCredits` reads live entitlements to choose its top-up route. */
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ChatErrorBanner />, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    expect(screen.getByText('Credit Limit Reached')).toBeInTheDocument();
    expect(screen.getByText(creditMessage)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
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
