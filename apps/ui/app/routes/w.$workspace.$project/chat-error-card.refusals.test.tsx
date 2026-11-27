/**
 * The refusal gate (HA5, AR3-3): every code in the host's registry either has a card in the page's code-to-card map,
 * whose action matches its retry class, or is named in {@link notPersonFacing} with the reason the chat gives it none.
 * A code added to the registry without either fails here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createActor } from 'xstate';
import { errorCategory } from '@taucad/types/constants';
import type { ChatError as ChatErrorPayload, ErrorCategory } from '@taucad/types';
import { refusalOf, refusals } from '@taucad/agent-host/wire';
import type { RefusalCode, RetryClass } from '@taucad/agent-host/wire';
import { cardOf } from '@taucad/chat-ui/utils/chat-error-card';
import type { CombinedChatState } from '#hooks/use-chat.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { ChatError } from '#routes/w.$workspace.$project/chat-error.js';
import { chatProjectionLogic } from '#machines/chat-projection.logic.js';
import { lifecycleRow, logRow } from '#machines/chat-projection.fixture.js';
import { refusalOfGesture } from '#utils/run-auto-resume-plan.js';

vi.mock('#cloud/use-deployment-mode.js', async () => {
  const fixture = await import('#cloud/funded-cloud.fixture.js');
  return fixture.fundedModeModule();
});
vi.mock('#cloud/cloud-entries.js', async () => {
  const fixture = await import('#cloud/funded-cloud.fixture.js');
  return fixture.loadedCloudEntries();
});
vi.mock('#flags/use-feature.js', () => ({ useFeature: () => false }));
vi.mock('#hooks/use-chat.js', () => ({
  useChatActions: () => ({ continueChat: vi.fn(), regenerate: vi.fn() }),
  useChatContext: () => ({ activeChatId: 'chat_gate' }),
  useChatSelector: vi.fn(),
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useOptionalChatSessionStore: () => undefined }));
vi.mock('#hooks/use-settings-dialog.js', () => ({ useSettingsDialog: () => ({ open: vi.fn() }) }));
vi.mock('#hooks/use-cad-agent-config.js', () => ({
  useAgentHostPlacements: () => ({ targets: [], loading: false, refresh: vi.fn() }),
}));
vi.mock('#components/chat/chat-model-selector.js', () => ({
  ChatModelSelector: ({ children }: { readonly children: (props: unknown) => React.ReactNode }) => (
    <div>{children({})}</div>
  ),
}));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({ resolveModel: (id: string) => ({ id, name: id }) }),
}));
vi.mock('@taucad/editor-ui/components/code/code-viewer', () => ({
  CodeViewer: ({ text }: { readonly text: string }) => <pre>{text}</pre>,
}));
vi.mock('#hooks/active-chat-provider.js', () => ({
  useChatComposer: () => ({
    execution: { execution: { kind: 'tau', model: 'openai-gpt-6-astra' }, setActiveExecution: vi.fn() },
  }),
  useChatAutoResume: () => undefined,
}));
vi.mock('#routes/w.$workspace.$project/use-open-new-chat.js', () => ({
  useOpenNewChat: () => ({ openNewChat: vi.fn(), isReady: true }),
}));

/** Whether the page's one code-to-card map names the code (the sentinel is a category no map entry has). */
const sentinel = 'not-in-the-card-map' as ErrorCategory;
const hasCard = (code: string): boolean => cardOf(code, sentinel).category !== sentinel;

/**
 * Codes the chat gives no card of its own, each named, with why. Everything else in the registry must have one in the
 * page's code-to-card map, and its action must match its class. No owner is excluded wholesale: a new code of any owner
 * fails until it gets a card or a line here.
 */
const notPersonFacing: ReadonlyMap<string, string> = new Map<string, string>([
  ...(
    [
      'RUN_ID_TAKEN',
      'NO_RUN_ADMITTED',
      'HISTORY_PREFIX_INVALID',
      'SETTLEMENT_CONFLICT',
      'SETTLEMENT_WITHOUT_RUN',
      'STEER_NOT_DELIVERED',
      'RUN_NOT_LIVE',
      'COMMAND_UNREADABLE',
      'COMMAND_UNSUPPORTED',
      'LEADER_WORKSPACE_MISMATCH',
      'SESSION_NOT_INITIALIZED',
      'PROMPT_BLOCKS_REQUIRED',
      'COMPUTE_AUTHORITY_UNAVAILABLE',
    ] as const
  ).map(
    (code) => [code, 'an answer to a command the page builds itself: a defect if seen, reported, not worded'] as const,
  ),
  ...(['INTERRUPT_NOT_PENDING', 'INTERRUPT_ALREADY_RESOLVED', 'INTERRUPT_PENDING', 'RUN_TAKEN_OVER'] as const).map(
    (code) => [code, 'an approval or an answer refused: the approval banner words it'] as const,
  ),
  ['PARAMETER_RESOLUTION_FAILED', 'a tool’s own failure: its tool card words it'],
  ['HOST_MODEL_UNAVAILABLE', 'refused before admission: the model picker words a model the host lacks'],
  ...(
    [
      'BRANCH_NEEDS_REVISION',
      'BRANCH_NAME_RESERVED',
      'BRANCH_RENAME_LINKED',
      'BRANCH_RENAME_PUSHED',
      'CHECKOUT_CONFLICT',
      'ENGINE_FAILED',
      'ENGINE_UNAVAILABLE',
      'INVALID_REPOSITORY',
      'INVALID_TRANSPORT',
      'FETCH_LIMIT_EXCEEDED',
      'LFS_REMOTE_UNSUPPORTED',
      'MISSING_LARGE_OBJECT',
      'REMOTE_DAMAGED',
      'REMOTE_FORBIDDEN',
      'REMOTE_NOT_ENTITLED',
      'REMOTE_NOT_FOUND',
      'REMOTE_MOVED',
      'REMOTE_QUOTA_EXCEEDED',
      'REMOTE_REAUTHORIZATION_REQUIRED',
      'REMOTE_REF_CONFLICT',
      'REMOTE_REJECTED',
      'REMOTE_SAFE_MODE',
      'REMOTE_UNAUTHORIZED',
      'REMOTE_UNAVAILABLE',
      'UNKNOWN_REVISION',
      'UNSUPPORTED_OPERATION',
      'BASE_CUT_FAILED',
      'LEASE_UNAVAILABLE',
      'CHECKOUT_UNKNOWN',
      'MERGE_UP_TO_DATE',
      'MERGE_UNDONE',
      'PLACEMENT_REFUSED',
      'TURN_UNKNOWN',
      'PROJECT_MISMATCH',
      'SESSION_FENCED',
      'TOOL_PORT_REVOKED',
      'TURN_RELEASED',
    ] as const
  ).map((code) => [code, 'a revision refusal: the history surface words it (revisions policy)'] as const),
  ...(['EXTERNAL_AGENT_LIMIT_REACHED', 'EXTERNAL_AGENT_FAILED'] as const).map(
    (code) => [code, 'an external agent’s stop: its stop card words it from the stop’s details'] as const,
  ),
  ...(
    [
      'FUNDED_HELPER_LIMIT',
      'MODEL_NOT_IN_CATALOG',
      'ORIGIN_NOT_ALLOWED',
      'ATTEMPT_VOIDED',
      'BILLING_ACCOUNT_CLOSED',
      'MODEL_PROVIDER_UNSUPPORTED',
      'UNKNOWN_GATEWAY_ERROR',
      'EXTERNAL_AGENT_AUTH_REQUIRED',
      'EXTERNAL_AGENT_UNAVAILABLE',
      'EXTERNAL_AGENT_CONTENT_UNSUPPORTED',
      'EXTERNAL_AGENT_UNSUPPORTED',
      'EXTERNAL_AGENT_CONFIG_UNAVAILABLE',
      'EXTERNAL_AGENT_INVALID_SESSION',
      'EXTERNAL_AGENT_CANCELLED',
      'CLI_TOO_OLD',
      'CLI_NOT_FOUND',
      'ADAPTER_NOT_INSTALLED',
      'ADAPTER_NO_BIN',
      'MCP_RUN_INACTIVE',
      'TOOL_NOT_ALLOWED',
    ] as const
  ).map(
    (code) => [code, 'an agent, gateway or transport sentence written for people: the generic card shows it'] as const,
  ),
]);

const rawMessageOf = (code: string): string => `raw ${code} sentence`;

/** A run that failed with the code, read to the end of its log, as the chat shows it. */
const showFailedRun = (code: string): void => {
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
          detail: { code, message: rawMessageOf(code) },
        }),
      ],
    },
  });
  const error: ChatErrorPayload = {
    code,
    title: 'Something went wrong',
    message: rawMessageOf(code),
    category: errorCategory.generic,
  };
  const state = { persistedError: error, projection: projection.getSnapshot().context, attachmentStatus: 'attached' };
  projection.stop();
  vi.mocked(useChatSelector).mockImplementation((selector) => selector(state as unknown as CombinedChatState));
};

/** A gesture (a send, a Resume) the host refused with the code, on a caught-up chat with no run of its own. */
const showRefusedGesture = (code: string): void => {
  const projection = createActor(chatProjectionLogic).start();
  projection.send({ type: 'batch', answer: { status: 'batch', cursor: 0, nextCursor: 0, endCursor: 0, events: [] } });
  const { context } = projection.getSnapshot();
  projection.stop();
  const error = refusalOfGesture(
    {
      code,
      title: 'Something went wrong',
      message: rawMessageOf(code),
      category: errorCategory.generic,
      requestId: `req_${code}`,
    },
    { kind: 'send', projection: context, createId: () => code },
  );
  const state = { persistedError: error, projection: context, attachmentStatus: 'attached' };
  vi.mocked(useChatSelector).mockImplementation((selector) => selector(state as unknown as CombinedChatState));
};

/** Buttons that end or resume a send; anything else (Reload, New chat, Pair, Switch model, a link) recovers otherwise. */
const resending: ReadonlySet<string> = new Set(['Try again', 'Resume']);

/**
 * Whether the rendered actions are the retry class's (AR3-3). A refused gesture has no run of its own, so a `resume`
 * code there offers no Resume: what it can offer is everything but one.
 */
const actionMatches = (retry: RetryClass, actions: readonly string[], gesture: boolean): boolean => {
  switch (gesture && retry === 'resume' ? 'never' : retry) {
    case 'wait': {
      /* Queued: the send goes by itself, so the chat offers nothing that would send it again. */
      return actions.every((action) => !resending.has(action));
    }
    case 'never': {
      return !actions.includes('Resume');
    }
    case 'resume': {
      return actions.includes('Resume');
    }
    case 'reauth': {
      return actions.some((action) => action === 'Sign in' || action === 'Pair');
    }
  }
};

describe('the refusal gate (HA5, AR3-3)', () => {
  afterEach(() => {
    cleanup();
  });

  const codes = Object.keys(refusals) as RefusalCode[];

  it.each(codes)('should give %s a card or a reason it has none', (code) => {
    expect({ code, card: hasCard(code), excluded: notPersonFacing.has(code) }).toMatchObject({
      card: !notPersonFacing.has(code),
    });
  });

  /* No owner is waved through: a code the registry gains later has neither a card nor a line until someone writes one. */
  it('should fail a new code of any owner until it has a card or a reason', () => {
    expect({ card: hasCard('ZZ_NEW_TRANSPORT'), excluded: notPersonFacing.has('ZZ_NEW_TRANSPORT') }).toEqual({
      card: false,
      excluded: false,
    });
  });

  it.each(
    codes.flatMap((code) =>
      notPersonFacing.has(code)
        ? []
        : [
            { code, as: 'a failed run', show: showFailedRun, gesture: false },
            { code, as: 'a refused gesture', show: showRefusedGesture, gesture: true },
          ],
    ),
  )('should offer for $code as $as the action its retry class names', ({ code, show, gesture }) => {
    show(code);
    const { container } = render(
      <MemoryRouter>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ChatError />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const actions = [...screen.queryAllByRole('button'), ...screen.queryAllByRole('link')].map((element) =>
      element.textContent.trim(),
    );
    const { retry } = refusalOf(code);
    expect({ code, retry, actions, matches: actionMatches(retry, actions, gesture) }).toMatchObject({ matches: true });
    /* A send that ends is told why, except one a Stop superseded, which ends quietly. */
    const quiet = cardOf(code, errorCategory.generic).category === 'quiet';
    expect(container.querySelector('[data-slot="chat-error-card"]') === null).toBe(quiet);
  });
});
