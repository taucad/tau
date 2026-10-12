import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload } from '@taucad/types';
import type * as AgentHostModule from '@taucad/agent-host';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { chatTurnNotStartedCode } from '#utils/error.utils.js';
import { ChatError as ChatErrorBanner } from '#routes/w.$workspace.$project/chat-error.js';
import { chatProjectionLogic, selectCurrentRun, selectRunFailure } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { createActor } from 'xstate';
import { ChatErrorTooLong } from '#routes/w.$workspace.$project/chat-error-too-long.js';

const continueChat = vi.fn();
const regenerate = vi.fn();
const resumableFailureOverrides = vi.hoisted(() => new Set<string>());
const debug = vi.hoisted(() => ({ enabled: false }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => debug.enabled }));

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
  useChatSelector: vi.fn(),
}));

vi.mock('@taucad/agent-host', async (importOriginal) => {
  const actual = await importOriginal<typeof AgentHostModule>();
  return {
    ...actual,
    isResumableRunFailure: (failure: ChatErrorPayload) =>
      resumableFailureOverrides.has(failure.code ?? '') || actual.isResumableRunFailure(failure),
  };
});

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

/* The "too long" notice creates its next chat through the project route's own
 * owners; this suite renders the banner alone. */
const openNewChat = vi.fn(async () => undefined);
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({ execution: { execution: { kind: 'tau', model: 'openai-gpt-6-astra' } } }),
}));
vi.mock('#routes/w.$workspace.$project/use-open-new-chat.js', () => ({
  useOpenNewChat: () => ({ openNewChat, isReady: true }),
}));

const persisted = (error: ChatErrorPayload): void => {
  vi.mocked(useChatSelector).mockImplementation((selector) =>
    selector({ error: undefined, persistedError: error } as unknown as CombinedChatState),
  );
};

const projectedFailure = (error: ChatErrorPayload): CombinedChatState => {
  const projection = createActor(chatProjectionLogic).start();
  projection.send({
    type: 'batch',
    answer: {
      status: 'batch',
      cursor: 0,
      nextCursor: 3,
      endCursor: 3,
      events: [
        lifecycleRow(0, 'admitted'),
        lifecycleRow(1, 'running'),
        logRow(2, {
          type: 'run.lifecycle',
          state: 'failed',
          attempt: 1,
          detail: {
            code: error.code,
            message: error.message,
            ...(error.httpStatus === undefined ? {} : { status: error.httpStatus }),
            ...(error.details === undefined ? {} : { details: error.details }),
          },
        }),
      ],
    },
  });
  const state = {
    error: undefined,
    persistedError: error,
    projection: projection.getSnapshot().context,
    attachmentStatus: 'attached',
  };
  projection.stop();
  return state as CombinedChatState;
};

/* A card promises Resume only for the caught-up log's current run, as the turn host admits it. */
const projected = (error: ChatErrorPayload): void => {
  const state = projectedFailure(error);
  vi.mocked(useChatSelector).mockImplementation((selector) => selector(state));
};

describe('ChatError', () => {
  beforeEach(() => {
    debug.enabled = false;
    resumableFailureOverrides.clear();
    vi.clearAllMocks();
  });

  it('offers compact Resume for a committed intentional Stop from the caught-up log', async () => {
    const projection = createActor(chatProjectionLogic).start();
    projection.send({
      type: 'batch',
      answer: {
        status: 'batch',
        cursor: 0,
        nextCursor: 4,
        endCursor: 4,
        events: [
          lifecycleRow(0, 'admitted'),
          lifecycleRow(1, 'running'),
          logRow(2, {
            type: 'turn.history-projection-committed',
            retainedMessageIds: [],
            message: { id: 'user_1', role: 'user', content: 'Work' },
            context: { version: 1, systemPrompt: '', initialMessages: [], postCompactionMessages: [] },
          }),
          logRow(3, {
            type: 'run.lifecycle',
            state: 'cancelled',
            detail: { code: 'USER_STOPPED', message: 'Stopped.' },
          }),
        ],
      },
    });
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({ projection: projection.getSnapshot().context, attachmentStatus: 'attached' } as CombinedChatState),
    );
    render(<ChatErrorBanner />);
    expect(screen.getByText('You stopped this turn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Resume' }));
    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
    projection.stop();
  });

  it('retires an untyped legacy connection card only after the current host log catches up', () => {
    const projection = createActor(chatProjectionLogic).start();
    const legacy: ChatErrorPayload = {
      category: errorCategory.generic,
      title: 'Something went wrong',
      message: 'Channel closed (local)',
    };
    let attachmentStatus: CombinedChatState['attachmentStatus'] = 'lost';
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: legacy,
        projection: projection.getSnapshot().context,
        attachmentStatus,
      } as CombinedChatState),
    );
    const { rerender } = render(<ChatErrorBanner />);
    expect(screen.getByText('Channel closed (local)')).toBeInTheDocument();
    projection.send({
      type: 'batch',
      answer: { status: 'batch', cursor: 0, nextCursor: 0, endCursor: 0, events: [] },
    });
    attachmentStatus = 'attached';
    rerender(<ChatErrorBanner className='recovered' />);
    expect(screen.queryByText('Channel closed (local)')).not.toBeInTheDocument();
    projection.stop();
  });

  it('keeps a current projected run failure visible after a healthy attachment replaces a stale SDK error', () => {
    const projection = createActor(chatProjectionLogic).start();
    projection.send({
      type: 'batch',
      answer: {
        status: 'batch',
        cursor: 0,
        nextCursor: 3,
        endCursor: 3,
        events: [
          lifecycleRow(0, 'admitted'),
          lifecycleRow(1, 'running'),
          logRow(2, {
            type: 'run.lifecycle',
            state: 'failed',
            attempt: 1,
            detail: { message: 'Current provider failure' },
          }),
        ],
      },
    });
    expect(selectCurrentRun(projection.getSnapshot().context)?.lifecycle).toBe('failed');
    expect(selectRunFailure(projection.getSnapshot().context, 'run_1')).toContain('Current provider failure');
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: new Error('Old socket failure'),
        persistedError: undefined,
        projection: projection.getSnapshot().context,
        attachmentStatus: 'attached',
      } as CombinedChatState),
    );
    render(<ChatErrorBanner />);
    expect(screen.getByText(/Current provider failure/u)).toBeInTheDocument();
    expect(screen.queryByText('Old socket failure')).not.toBeInTheDocument();
    projection.stop();
  });

  it('retires a refused Start after another device admits a later healthy run', () => {
    const projection = createActor(chatProjectionLogic).start();
    const oldRefusal: ChatErrorPayload = {
      category: errorCategory.generic,
      title: 'Start refused',
      message: 'Old request was refused',
      requestId: 'req_old',
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: oldRefusal,
        projection: projection.getSnapshot().context,
        attachmentStatus: 'attached',
      } as CombinedChatState),
    );
    const { rerender } = render(<ChatErrorBanner />);
    expect(screen.getByText('Old request was refused')).toBeInTheDocument();

    projection.send({
      type: 'batch',
      answer: { status: 'batch', cursor: 0, nextCursor: 0, endCursor: 0, events: [] },
    });
    rerender(<ChatErrorBanner className='caught-up-empty' />);
    expect(screen.getByText('Old request was refused')).toBeInTheDocument();

    projection.send({
      type: 'batch',
      answer: {
        status: 'batch',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted', 'req_new'), lifecycleRow(1, 'completed', 'req_new')],
      },
    });
    rerender(<ChatErrorBanner className='recovered' />);
    expect(screen.queryByText('Old request was refused')).not.toBeInTheDocument();
    projection.stop();
  });

  it('keeps a refused Resume only while its identified run is paused', () => {
    const projection = createActor(chatProjectionLogic).start();
    projection.send({
      type: 'batch',
      answer: {
        status: 'batch',
        cursor: 0,
        nextCursor: 2,
        endCursor: 2,
        events: [lifecycleRow(0, 'admitted', 'req_paused'), lifecycleRow(1, 'paused', 'req_paused')],
      },
    });
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: undefined,
        persistedError: {
          category: errorCategory.generic,
          title: 'Resume refused',
          message: 'Could not resume this run',
          requestId: 'cmd_resume',
          details: { runId: 'req_paused', commandType: 'resume' },
        },
        projection: projection.getSnapshot().context,
        attachmentStatus: 'attached',
      } as unknown as CombinedChatState),
    );
    render(<ChatErrorBanner />);
    expect(screen.getByText('Could not resume this run')).toBeInTheDocument();
    projection.stop();
  });

  /* F5: the rate-limit and service cards are routed by CATEGORY, so each also
     serves codes the host rules unrecoverable. `isResumableRunFailure` is the
     one decision, taken here and handed to the card, so no card can promise a
     resume the next click will not perform. */
  it('tells the customer when a funded-operation limit can be retried, without promising the turn', () => {
    persisted({
      category: errorCategory.rateLimit,
      title: 'Rate limit exceeded',
      message: 'The funded-operation failsafe is active.',
      code: 'FUNDED_OPERATION_LIMIT',
      httpStatus: 429,
      details: { retryAfterSeconds: 30 },
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Try again in 30 seconds.')).toBeInTheDocument();
    expect(screen.getByText('Funded operation limit reached')).toBeInTheDocument();
    expect(screen.queryByText('Everything up to here is saved.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/iu })).not.toBeInTheDocument();
  });

  it('should promise the turn and say Resume for a rate limit the host does resume', () => {
    projected({
      category: errorCategory.rateLimit,
      title: 'Rate limit exceeded',
      message: 'The model provider asked Tau to wait.',
      code: 'RATE_LIMITED',
      httpStatus: 429,
      details: { retryAfterSeconds: 30 },
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Resume in 30 seconds.')).toBeInTheDocument();
    expect(screen.getByText('Everything up to here is saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('should keep Try again for a service refusal the host rules unrecoverable', () => {
    persisted({
      category: errorCategory.overloaded,
      title: 'Service Temporarily Unavailable',
      message: 'Tau is finalizing earlier work on this chat.',
      code: 'BILLING_RECOVERY_UNAVAILABLE',
      httpStatus: 503,
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Finalizing earlier work')).toBeInTheDocument();
    expect(screen.queryByText('Everything up to here is saved.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  /* The masked in-stream failure arrives on an HTTP 200, so its category reads
   * `generic`; only the code says the turn survived it (S1, S2, S7, S10). */
  it('should keep a lost connection concise and disclose the provider words only in Tau Debug', async () => {
    debug.enabled = true;
    const user = userEvent.setup();
    projected({
      category: errorCategory.generic,
      title: 'Error',
      message: 'server_error: The server had an error while processing your request.',
      code: 'NETWORK_ERROR',
      httpStatus: 200,
      raw: '{"code":"NETWORK_ERROR"}',
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Connection lost')).toBeInTheDocument();
    expect(
      screen.queryByText('server_error: The server had an error while processing your request.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Everything up to here is saved.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/iu })).not.toBeInTheDocument();
    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Debug details' }));
    expect(screen.getByTestId('code-viewer')).toHaveTextContent('server_error: The server had an error');

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('should name a refused request and offer a model switch ahead of Resume', () => {
    projected({
      category: errorCategory.toolError,
      title: 'Processing Error',
      message: 'Vertex does not support xhigh reasoning effort.',
      code: 'INVALID_REQUEST',
      httpStatus: 400,
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('The model refused this request')).toBeInTheDocument();
    expect(screen.queryByText('Processing error')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Switch model', 'Resume']);
  });

  /* W6, IS3: an operator-paused route is worded by the page. Resuming would re-send to the same paused route, so the
   * card neither offers it nor promises the turn; the gateway's sentence and fields reach Tau Debug only. */
  it('should word a paused model route itself and offer a model switch without Resume', async () => {
    debug.enabled = true;
    const user = userEvent.setup();
    const gatewaySentence = "This model route is paused by Tau's operators.";
    projected({
      category: errorCategory.overloaded,
      title: 'Service Temporarily Unavailable',
      message: gatewaySentence,
      code: 'MODEL_ROUTE_PAUSED',
      httpStatus: 503,
      details: { routeId: 'fixture-route' },
    });

    render(<ChatErrorBanner />);

    const card = screen.getByRole('alert');
    expect(card).toHaveTextContent('This model is paused');
    expect(
      screen.getByText("Tau's operators have paused this model. Switch to another model to continue."),
    ).toBeInTheDocument();
    expect(card).not.toHaveTextContent(gatewaySentence);
    expect(card).not.toHaveTextContent('Service Temporarily Unavailable');
    expect(card).not.toHaveTextContent('Everything up to here is saved.');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Switch model',
      'Try again',
      'Debug details',
    ]);

    await user.click(screen.getByRole('button', { name: 'Debug details' }));
    expect(JSON.parse(screen.getByTestId('code-viewer').textContent)).toEqual({
      code: 'MODEL_ROUTE_PAUSED',
      message: gatewaySentence,
      httpStatus: 503,
      details: { routeId: 'fixture-route' },
    });

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
  });

  /* W11a, IC5, OQ15: a restricted account is the account's, not the route's: support is the one recovery, the copy names
   * no case kind, and the gateway's sentence reaches Tau Debug only. */
  it('should point a restricted account to support without Resume or a model switch', async () => {
    debug.enabled = true;
    const user = userEvent.setup();
    const gatewaySentence = 'This Tau billing account is restricted.';
    projected({
      category: errorCategory.generic,
      title: 'Error',
      message: gatewaySentence,
      code: 'BILLING_ACCOUNT_RESTRICTED',
      httpStatus: 403,
    });

    render(<ChatErrorBanner />);

    const card = screen.getByRole('alert');
    expect(card).toHaveTextContent('This account needs attention');
    expect(
      screen.getByText(
        'Tau has paused spending on this account while we look at a billing issue. Contact support to continue.',
      ),
    ).toBeInTheDocument();
    expect(card).not.toHaveTextContent(gatewaySentence);
    expect(card).not.toHaveTextContent('Everything up to here is saved.');
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute('href', 'mailto:support@tau.new');
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Debug details']);

    await user.click(screen.getByRole('button', { name: 'Debug details' }));
    expect(JSON.parse(screen.getByTestId('code-viewer').textContent)).toEqual({
      code: 'BILLING_ACCOUNT_RESTRICTED',
      message: gatewaySentence,
      httpStatus: 403,
    });
    expect(regenerate).not.toHaveBeenCalled();
    expect(continueChat).not.toHaveBeenCalled();
  });

  it.each([
    {
      code: 'SESSION_LOG_INTEGRITY',
      title: 'Tau paused this turn',
      copy: 'This chat hit a problem while Tau was tidying its history.',
      actions: ['Resume', 'Try again'],
    },
    {
      code: 'SUMMARY_REQUIRED',
      title: 'Tau paused this turn',
      copy: 'This chat hit a problem while Tau was tidying its history.',
      actions: ['Resume', 'Try again'],
    },
    {
      code: 'NO_EVICTABLE_HISTORY',
      title: 'This chat is too long to continue',
      copy: 'Tau could not make room for the next step.',
      actions: ['Resume', 'Try again', 'New chat'],
    },
    {
      code: 'CIRCUIT_BREAKER_OPEN',
      title: 'This chat is too long to continue',
      copy: 'Tau could not make room for the next step.',
      actions: ['Resume', 'Try again', 'New chat'],
    },
  ])(
    'should offer Resume before Try again for resumable compaction failure $code',
    async ({ code, title, copy, actions }) => {
      const user = userEvent.setup();
      const rawMessage = `Internal host sentence for ${code}`;
      resumableFailureOverrides.add(code);
      projected({
        category: errorCategory.generic,
        title: 'Error',
        message: rawMessage,
        code,
      });

      render(<ChatErrorBanner />);

      expect(screen.getByText(title)).toBeInTheDocument();
      expect(screen.getByText(copy)).toBeInTheDocument();
      expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
      expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(actions);

      await user.click(screen.getByRole('button', { name: 'Resume' }));
      expect(continueChat).toHaveBeenCalledTimes(1);
      expect(regenerate).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Try again' }));
      expect(regenerate).toHaveBeenCalledTimes(1);
    },
  );

  it('should not offer Try again when a too-long run cannot resume', () => {
    render(<ChatErrorTooLong resumable={false} />);

    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument();
  });

  it('should read a gateway REQUEST_TOO_LARGE as a chat that is too long, offering only New chat', () => {
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'Model request is larger than Tau accepts.',
      code: 'REQUEST_TOO_LARGE',
      httpStatus: 413,
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('This chat is too long to continue')).toBeInTheDocument();
    expect(screen.queryByText('Tau paused this turn')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['New chat']);
  });

  it('should keep the host compaction sentence reachable in Tau Debug', async () => {
    debug.enabled = true;
    const user = userEvent.setup();
    const hostSentence = 'Model invocation attempt-overflow has no durable result; it will not be sent again.';
    resumableFailureOverrides.add('SUMMARY_REQUIRED');
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'This chat hit a problem while Tau was tidying its history.',
      code: 'SUMMARY_REQUIRED',
      raw: hostSentence,
    });

    render(<ChatErrorBanner />);

    await user.click(screen.getByRole('button', { name: 'Debug details' }));
    expect(screen.getByTestId('code-viewer')).toHaveTextContent(hostSentence);
  });

  /* Ruling Q6: taking leadership back is a protocol, not an error action. */
  it('should state that another tab continued the chat and offer nothing', () => {
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'Leadership for chat chat_l1MMqYyEaacEAeqv0VCHE was lost.',
      code: 'LEADERSHIP_LOST',
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('This chat continued in another tab')).toBeInTheDocument();
    expect(screen.getByText('Keep working there. Reload this page to follow along here.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /* The one restart that loses nothing: admission refused before a run existed. */
  it('should keep Try again for a turn that never started', async () => {
    const user = userEvent.setup();
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'This chat is still holding a workspace from an earlier run. Reload the page to release it.',
      code: chatTurnNotStartedCode,
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Tau could not start this turn')).toBeInTheDocument();
    expect(
      screen.getByText('This chat is still holding a workspace from an earlier run. Reload the page to release it.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /resume/iu })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
  });

  /* T2-D11. A resume the host cannot honour is not a failure: the turn is
   * whole and nothing was spent. Left to the generic block it read as one —
   * a red banner with a collapsible stack trace over a message that says
   * there is nothing to continue. */
  it('should say a resume has nothing left to continue rather than report a failure', async () => {
    const user = userEvent.setup();
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'This turn has nothing left to continue. Send it again to start a new one.',
      code: 'RESUME_UNAVAILABLE',
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Nothing left to continue')).toBeInTheDocument();
    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
  });

  /* E1. A run whose document died is recorded abandoned, not failed by
   * anything the person did: the turn is saved and Resume continues it. Left
   * to the category it read as a generic error offering *Try again*. */
  it('should present an abandoned run as a paused turn that resumes', async () => {
    const user = userEvent.setup();
    projected({
      category: errorCategory.generic,
      title: 'Error',
      message: 'The host executing this run is gone. Resume the turn to continue it.',
      code: 'RUN_ABANDONED',
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Chat paused')).toBeInTheDocument();
    expect(screen.getByText('Everything up to here is saved.')).toBeInTheDocument();
    expect(
      screen.queryByText('The host executing this run is gone. Resume the turn to continue it.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /details/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/iu })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  /* Resume everywhere: an external agent left waiting for approval when Tau closed is abandoned resumably; the card
   * names that cause and Resume reattaches the session, where the agent asks again. */
  it('should offer Resume for an approval Tau closed on, saying the agent asks again', async () => {
    const user = userEvent.setup();
    projected({
      category: errorCategory.generic,
      title: 'Error',
      message: 'Tau closed while the agent waited for your approval. Resume the turn and the agent asks again.',
      code: 'RUN_ABANDONED',
      details: { cause: 'awaiting-approval' },
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Tau closed while the agent waited for your approval')).toBeInTheDocument();
    expect(screen.getByText(/Resume and the agent asks for it again\./u)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(continueChat).toHaveBeenCalledTimes(1);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it.each([
    ['LEADER_VERSION_MISMATCH', 'Another version of Tau is running this chat'],
    ['RUN_UNREADABLE', 'This chat was continued in a newer version of Tau'],
    ['HISTORY_INVALID', "Tau can't read this chat's history"],
    ['EXTERNAL_AGENT_RECOVERY_UNKNOWN', "Tau couldn't reopen the agent's session"],
  ] as const)('shows the approved recovery card for %s', (code, title) => {
    persisted({ category: errorCategory.generic, title: 'Error', message: 'A coded refusal', code });

    render(<ChatErrorBanner />);

    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('announces a pending model attempt as named busy status, not a failure alert', () => {
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'The host is checking the last model attempt.',
      code: 'MODEL_ATTEMPT_PENDING',
    });

    render(<ChatErrorBanner />);

    expect(screen.getByRole('status', { name: 'Checking whether the last model call finished' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('offers New chat for unreadable history without offering Resume', async () => {
    const user = userEvent.setup();
    persisted({ category: errorCategory.generic, title: 'Error', message: 'Bad history', code: 'HISTORY_INVALID' });

    render(<ChatErrorBanner />);

    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(openNewChat).toHaveBeenCalledOnce();
  });

  /* A silent peer (a crashed worker, or a daemon past its liveness bound) leaves the command's effect unknown: the
   * start may never have been admitted, so the card claims no run and promises nothing. */
  it('should not claim a turn exists when its host stopped responding', async () => {
    const user = userEvent.setup();
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'No leader of chat chat-1 answered before it went silent; re-send this command.',
      code: 'PEER_UNRESPONSIVE',
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Tau stopped responding')).toBeInTheDocument();
    expect(screen.getByText('Tau cannot tell whether this turn started.')).toBeInTheDocument();
    expect(screen.queryByText('Tau paused this turn')).not.toBeInTheDocument();
    expect(screen.queryByText('Everything up to here is saved.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
  });

  /* A host whose hello names a wire this page cannot speak: nothing here can fix it, the host's Tau must change. */
  it('should ask for an update on a host that speaks another wire version', async () => {
    const user = userEvent.setup();
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'The agent owner speaks another wire version; update Tau on that host.',
      code: 'WIRE_VERSION_UNSUPPORTED',
    });

    render(<ChatErrorBanner />);

    expect(screen.getByText('Update Tau on this host')).toBeInTheDocument();
    expect(
      screen.getByText('This host runs a version of Tau this page cannot talk to. Update Tau there, then try again.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
  });

  it("should route an external agent's usage limit to its stop notice instead of the generic block", () => {
    const quota: ChatErrorPayload = {
      category: errorCategory.rateLimit,
      title: 'Rate limit exceeded',
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
    expect(screen.queryByText('Rate limit exceeded')).not.toBeInTheDocument();
  });

  /* The refusal arrives as `overloaded` (the 503 it mirrors); the code, not the
   * category, picks the provider-account card over the service-unavailable one. */
  it('should route a provider-account refusal to its own card ahead of the category', () => {
    const refusal: ChatErrorPayload = {
      category: errorCategory.overloaded,
      title: 'Service Temporarily Unavailable',
      message: "The model provider's account is unavailable.",
      code: 'PROVIDER_ACCOUNT_EXHAUSTED',
      details: { providerId: 'openai', providerCode: 'credit_balance_exhausted', accountOwner: 'tau' },
    };
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({ error: undefined, persistedError: refusal } as unknown as CombinedChatState),
    );

    render(<ChatErrorBanner />);

    expect(screen.getByRole('status', { name: 'OpenAI models are unavailable right now' })).toBeInTheDocument();
    expect(screen.queryByText('Service Temporarily Unavailable')).not.toBeInTheDocument();
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

  it('should use the shared recovery card for generic failures without exposing a diagnostic action', () => {
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'The model could not finish this turn.',
      raw: '{"internal":"generic-trace"}',
    });

    const { container } = render(<ChatErrorBanner />);

    expect(container.querySelector('[data-slot="chat-error-card"]')).toHaveTextContent(
      'The model could not finish this turn.',
    );
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument();
  });

  it('should disclose generic diagnostics only after Tau Debug is enabled and opened', async () => {
    debug.enabled = true;
    persisted({
      category: errorCategory.generic,
      title: 'Error',
      message: 'The model could not finish this turn.',
      raw: '{"internal":"generic-trace"}',
    });

    render(<ChatErrorBanner />);

    expect(screen.queryByTestId('code-viewer')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Debug details' }));
    expect(screen.getByTestId('code-viewer')).toHaveTextContent('generic-trace');
  });

  it('renders the network banner for a dropped request', () => {
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

    render(<ChatErrorBanner />);
    expect(screen.getByText('Unable to reach Tau')).toBeInTheDocument();
  });

  it('should replay the server-category fallback when Try again is clicked', async () => {
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

    render(<ChatErrorBanner />);
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('should replay the generic fallback when Try again is clicked', async () => {
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

    render(<ChatErrorBanner />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('should replay unknown fallback categories from Try again', async () => {
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

    render(<ChatErrorBanner />);

    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(continueChat).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it('should show the paused shortfall from a projected credit failure', () => {
    const error: ChatErrorPayload = {
      category: errorCategory.credits,
      title: 'Credit Limit Reached',
      message: 'Insufficient Tau credit for this model request.',
      code: 'INSUFFICIENT_CREDIT',
      httpStatus: 402,
      details: {
        requiredCreditAtoms: '3084332',
        availableCreditAtoms: '2960000',
        routeId: 'openai-gpt-6-astra',
      },
    };
    const state = projectedFailure(error);
    vi.mocked(useChatSelector).mockImplementation((selector) => selector(state));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ChatErrorBanner />, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <MemoryRouter>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    });

    expect(
      screen.getByText('Tau paused this turn: 13 more credits needed for openai-gpt-6-astra.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  /* W2 carries `details` from the 402 through the persisted ChatError even
   * before a host projection catches up. */
  it('should show the denial shortfall from a persisted credit error', () => {
    persisted({
      category: errorCategory.credits,
      title: 'Credit Limit Reached',
      message: 'Insufficient Tau credit for this model request.',
      details: {
        requiredCreditAtoms: '3084332',
        availableCreditAtoms: '2960000',
        routeId: 'openai-gpt-6-astra',
      },
    });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ChatErrorBanner />, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <MemoryRouter>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    });

    expect(screen.getByText('13 more credits needed for openai-gpt-6-astra.')).toBeInTheDocument();
    expect(screen.queryByText(/Tau paused this turn/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
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

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ChatErrorBanner />, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <MemoryRouter>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    });

    expect(snapshots.length).toBeGreaterThan(0);
    for (const [first, second] of snapshots) {
      expect(Object.is(first, second)).toBe(true);
    }
    expect(screen.getByText('Credit limit reached')).toBeInTheDocument();
  });

  /* The funded boundary's own 402 copy is credit-denominated and reaches the
   * banner verbatim — the chat never restates a charge in dollars (B4 R2). */
  it('should keep an unretained credit refusal in the funding and send flow', async () => {
    const creditMessage = 'Insufficient Tau credit for this model request.';
    const creditError: ChatErrorPayload = {
      category: errorCategory.credits,
      title: 'Credit Limit Reached',
      message: creditMessage,
    };
    persisted(creditError);

    /* `ChatErrorCredits` reads live entitlements to choose its top-up route. */
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<ChatErrorBanner />, {
      wrapper: ({ children }: { readonly children: ReactNode }) => (
        <MemoryRouter>
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        </MemoryRouter>
      ),
    });

    expect(screen.getByText('Credit limit reached')).toBeInTheDocument();
    expect(screen.getByText(creditMessage)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Processing error')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();

    expect(screen.queryByRole('button', { name: /resume/i })).not.toBeInTheDocument();
    expect(continueChat).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('renders decoded Google provider errors instead of opaque byte lists', () => {
    vi.mocked(useChatSelector).mockImplementation((selector) =>
      selector({
        error: new Error(`Google request failed with status code 400: ${googleInvalidArgumentByteList}`),
        persistedError: undefined,
      } as unknown as CombinedChatState),
    );

    render(<ChatErrorBanner />);

    expect(screen.getByText('Request contains an invalid argument.')).toBeInTheDocument();
    expect(screen.queryByText(/91,123,10/)).not.toBeInTheDocument();
  });
});
