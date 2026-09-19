// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';

/* The meta block renders the model from the chat-scoped `Chat.activeExecution`
 * (via `useChatSelector(state => state.activeExecution)`) — never by reverse-
 * scanning message metadata. These tests moved here from the status row the
 * block replaced, and still guard the regression where a fresh chat (no
 * messages yet) silently dropped the model. */

const chatSelectorState: {
  activeExecution: { kind: 'tau'; model: string } | { kind: 'acp'; hostId: string; agentId: string } | undefined;
  messages: unknown[];
} = {
  activeExecution: { kind: 'tau', model: 'manifold-model' },
  messages: [],
};
const cookie = vi.hoisted(() => ({ showCredits: true }));
const cloud = vi.hoisted(() => ({ enabled: true }));

vi.mock('#hooks/use-chat.js', () => ({
  useChatSelector: <T,>(selector: (state: typeof chatSelectorState) => T): T => selector(chatSelectorState),
}));

vi.mock('#hooks/use-cookie.js', () => ({
  useCookie: () => [cookie.showCredits, vi.fn()],
}));

vi.mock('#cloud/cloud-enabled.js', () => ({
  get tauCloudEnabled() {
    return cloud.enabled;
  },
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
        recencyAt: Date.now() - 5 * 60_000,
      },
    ],
    isLoading: false,
  }),
}));

vi.mock('#components/icons/svg-icon.js', () => ({
  SvgIcon: ({ id }: { readonly id?: string }) => <span data-testid='svg-icon'>{id}</span>,
}));

vi.mock('@taucad/ui/components/dropdown-menu', () => ({
  DropdownMenuLabel: ({ children }: { readonly children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
}));

const { ChatOptionsMeta } = await import('#routes/w.$workspace.$project/chat-options-meta.js');

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

function renderMeta(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId: 'user', environment: 'development' }}>
        {children}
      </BillingSessionProvider>
    </QueryClientProvider>
  );
  render(<ChatOptionsMeta />, { wrapper });
}

/** The value cell beside a row's term. */
const valueOf = (term: string): Element | undefined => screen.getByText(term).nextElementSibling ?? undefined;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ChatOptionsMeta — rows', () => {
  beforeEach(() => {
    chatSelectorState.activeExecution = { kind: 'tau', model: 'manifold-model' };
    chatSelectorState.messages = [];
    cookie.showCredits = true;
    cloud.enabled = true;
  });

  it('should list activity, model and credits as read-only rows, never as menu items', () => {
    renderMeta();

    expect(valueOf('Activity')).toHaveTextContent('5 minutes ago');
    expect(valueOf('Runs on')).toHaveTextContent('MANIFOLD-MODEL');
    expect(valueOf('Credits')).toHaveTextContent('—');
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('should render the model from a Tau execution even when there are no messages yet', () => {
    chatSelectorState.activeExecution = { kind: 'tau', model: 'pinned-model' };
    chatSelectorState.messages = [];

    renderMeta();
    expect(screen.getByText('PINNED-MODEL')).toBeInTheDocument();
  });

  it('should show no model for an external execution', () => {
    chatSelectorState.activeExecution = { kind: 'acp', hostId: 'origin', agentId: 'claude' };
    chatSelectorState.messages = [
      // Even with stamped messages present, the deleted message-scan loop must
      // not return — the model is driven only by the chat-scoped execution target.
      { metadata: { model: 'should-not-be-displayed' }, parts: [] },
    ];

    renderMeta();
    expect(screen.queryByText('SHOULD-NOT-BE-DISPLAYED')).toBeNull();
    expect(valueOf('Runs on')).toHaveTextContent('—');
  });
});

/* B4 R2/R3: the total is the sum of the chat's resolved receipts with an
 * explicit pending note — never a locally multiplied figure. */
describe('ChatOptionsMeta — receipt credits', () => {
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
    cookie.showCredits = true;
    cloud.enabled = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) =>
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
    );
  });

  it('sums settled receipts and names the unresolved ones', async () => {
    renderMeta();

    await waitFor(() => {
      expect(screen.getByLabelText('Tau credits: 1.23 · 1 pending')).toBeInTheDocument();
    });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('should show no credits when the cookie hides them or Tau Cloud is off', () => {
    cookie.showCredits = false;
    renderMeta();
    expect(valueOf('Credits')).toHaveTextContent('—');
    cleanup();

    cookie.showCredits = true;
    cloud.enabled = false;
    renderMeta();
    expect(valueOf('Credits')).toHaveTextContent('—');
  });
});
