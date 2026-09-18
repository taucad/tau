// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';

// Chat-history-status must render the model badge from the chat-scoped
// `Chat.activeExecution` (via `useChatSelector(state => state.activeExecution)`) —
// never by reverse-scanning message metadata.
// These tests pin that contract and guard against the regression where
// a fresh chat (no messages yet) silently dropped the model badge.

const chatSelectorState: {
  activeExecution: { kind: 'tau'; model: string } | { kind: 'acp'; hostId: string; agentId: string } | undefined;
  messages: unknown[];
} = {
  activeExecution: { kind: 'tau', model: 'manifold-model' },
  messages: [],
};

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: <T,>(selector: (state: typeof chatSelectorState) => T): T => selector(chatSelectorState),
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => [true, vi.fn()],
}));

vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    resolveModel: (id: string) => ({
      id,
      name: id.toUpperCase(),
      family: 'gpt',
      provider: { id: 'openai', name: 'OpenAI' },
      isResolved: true,
    }),
  }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({ editorRef: {}, projectRef: {}, projectId: 'project_test' }),
}));

vi.mock('@xstate/react', () => ({
  useSelector: () => 'chat_test',
}));

vi.mock('#hooks/use-chats.js', () => ({
  useChats: () => ({
    chats: [
      {
        id: 'chat_test',
        resourceId: 'project_test',
        name: 'Bracket design',
        messages: [],
        createdAt: 1,
        updatedAt: 999,
        recencyAt: 1,
      },
    ],
    applyGeneratedChatName: vi.fn(),
    isLoading: false,
  }),
}));

vi.mock('#routes/w.$workspace.$project/use-active-chat-naming.js', () => ({
  useActiveChatNaming: () => false,
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

const { ChatHistoryStatus } = await import('#routes/w.$workspace.$project/chat-history-status.js');

const usagePart = (operationId: string) => ({
  type: 'data-usage',
  data: {
    type: 'usage',
    id: operationId,
    model: 'm',
    inputTokens: 1,
    outputTokens: 1,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    operationId,
  },
});

function renderStatus(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId: 'user', environment: 'development' }}>
        {children}
      </BillingSessionProvider>
    </QueryClientProvider>
  );
  render(<ChatHistoryStatus />, { wrapper });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ChatHistoryStatus — chat-scoped model badge', () => {
  beforeEach(() => {
    chatSelectorState.activeExecution = { kind: 'tau', model: 'manifold-model' };
    chatSelectorState.messages = [];
  });

  it('renders the active chat name ahead of the relative-time badge', () => {
    renderStatus();
    expect(screen.getByText('Bracket design')).toBeTruthy();
  });

  it('renders the model badge from a Tau execution even when there are no messages yet', () => {
    chatSelectorState.activeExecution = { kind: 'tau', model: 'pinned-model' };
    chatSelectorState.messages = [];

    renderStatus();
    expect(screen.getByText('PINNED-MODEL')).toBeTruthy();
  });

  it('omits the Tau model badge for an external execution', () => {
    chatSelectorState.activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'claude' };
    chatSelectorState.messages = [
      // Even with stamped messages present, the deleted message-scan loop
      // must not be reintroduced — the badge is driven exclusively by the
      // chat-scoped execution target.
      { metadata: { model: 'should-not-be-displayed' }, parts: [] },
    ];

    renderStatus();
    expect(screen.queryByText('SHOULD-NOT-BE-DISPLAYED')).toBeNull();
  });
});

/* B4 R2/R3: the footer total is the sum of the chat's resolved receipts with an
 * explicit pending note — never a locally multiplied figure. */
describe('ChatHistoryStatus — receipt credit footer', () => {
  const receipt = {
    schemaVersion: 1,
    environment: 'development',
    ownerId: 'user',
    subjectId: 'account',
    snapshotRevision: '9',
    asOf: '2026-09-12T00:00:00.000Z',
  };

  beforeEach(() => {
    chatSelectorState.activeExecution = { kind: 'tau', model: 'manifold-model' };
    chatSelectorState.messages = [{ metadata: {}, parts: [usagePart('op_1'), usagePart('op_2')] }];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string) =>
        Promise.resolve(
          input.endsWith('op_1')
            ? {
                ok: true,
                json: async () => ({
                  ...receipt,
                  state: 'terminal',
                  operationId: 'op_1',
                  receipt: {
                    schemaVersion: 1,
                    environment: 'development',
                    ownerId: 'user',
                    subjectId: 'account',
                    kind: 'base',
                    operationId: 'op_1',
                    baseTransactionId: 'txn-1',
                    terminalRevision: '9',
                    policyVersion: 'policy-1',
                    activationId: 'activation-1',
                    meterContractId: 'meter-1',
                    category: 'llm',
                    model: { id: 'm', displayName: null, providerId: null },
                    activity: { kind: 'agent', projectHint: null, chatHint: null, parentAttemptKey: null },
                    historyVersion: 1,
                    admittedAt: receipt.asOf,
                    dispatchIntentAt: receipt.asOf,
                    usageOccurredAt: receipt.asOf,
                    evidenceOccurredAt: receipt.asOf,
                    timingStatus: 'dispatch_intent',
                    resolvedAt: receipt.asOf,
                    executionStatus: 'succeeded',
                    customerState: 'settled',
                    authorizedMaxCreditAtoms: '99999',
                    chargedCreditAtoms: '12345',
                    accountDeltaCreditAtoms: '-12345',
                    meteringStatus: 'complete',
                    meterItems: [],
                    tokens: {
                      status: 'complete',
                      uncachedInput: '1',
                      cacheRead: '0',
                      cacheWrite: '0',
                      inputTotal: '1',
                      output: '1',
                      reasoning: '0',
                    },
                  },
                  correctionTotalCreditAtoms: '0',
                  corrections: { items: [], nextCursor: null, complete: true },
                }),
              }
            : { ok: false, status: 503 },
        ),
      ),
    );
  });

  it('sums settled receipts and names the unresolved ones', async () => {
    renderStatus();

    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: 1.23 · 1 pending')).toBeInTheDocument();
    });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
