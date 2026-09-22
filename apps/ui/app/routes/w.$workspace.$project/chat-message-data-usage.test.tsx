import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UsageData } from '@taucad/chat';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';
import { ChatMessageDataUsage } from '#routes/w.$workspace.$project/chat-message-data-usage.js';

const recordBillingRevisionMinimum = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('#components/icons/svg-icon.js', () => ({
  unknownIconId: 'unknown',
  SvgIcon: ({ id }: { readonly id: string }) => <span data-testid={`model-icon-${id}`} />,
}));

vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    // The catalog knows the Tau model; an external agent's model resolves to no family.
    resolveModel: (id: string) =>
      id === 'openai-gpt-5.5'
        ? { id, name: id, family: 'openai', provider: { name: 'OpenAI' }, isResolved: true }
        : { id, name: id, family: 'unknown', provider: { id: 'unknown', name: 'Unknown' }, isResolved: false },
  }),
}));

vi.mock('#hooks/use-cookie.js', () => ({ useCookie: (_name: string, fallback: boolean) => [fallback, vi.fn()] }));
vi.mock('#db/billing-snapshot-store.js', () => ({ recordBillingRevisionMinimum }));
vi.mock('#lib/agent-host-placement.js', () => ({ externalAgentDisplayName: (id: string) => id }));

const identity = { schemaVersion: 1, environment: 'development', ownerId: 'user', subjectId: 'account' };
const activity = { kind: 'agent', projectHint: null, chatHint: null, parentAttemptKey: null };
const tokens = {
  status: 'complete',
  uncachedInput: '10',
  cacheRead: '0',
  cacheWrite: '0',
  inputTotal: '10',
  output: '4',
  reasoning: '3',
};

const terminalReceipt = (operationId: string, chargedCreditAtoms: string) => ({
  ...identity,
  state: 'terminal',
  snapshotRevision: '9',
  asOf: '2026-09-12T00:00:00.000Z',
  operationId,
  receipt: {
    ...identity,
    kind: 'base',
    operationId,
    baseTransactionId: `txn-${operationId}`,
    terminalRevision: '9',
    policyVersion: 'policy-1',
    activationId: 'activation-1',
    meterContractId: 'meter-1',
    category: 'llm',
    model: { id: 'openai-gpt-5.5', displayName: null, providerId: null },
    activity,
    historyVersion: 1,
    admittedAt: '2026-09-12T00:00:00.000Z',
    dispatchIntentAt: '2026-09-12T00:00:01.000Z',
    usageOccurredAt: '2026-09-12T00:00:01.000Z',
    evidenceOccurredAt: '2026-09-12T00:00:02.000Z',
    timingStatus: 'dispatch_intent',
    resolvedAt: '2026-09-12T00:00:03.000Z',
    executionStatus: 'succeeded',
    customerState: 'settled',
    authorizedMaxCreditAtoms: '99999',
    chargedCreditAtoms,
    accountDeltaCreditAtoms: `-${chargedCreditAtoms}`,
    meteringStatus: 'complete',
    meterItems: [],
    tokens,
  },
  correctionTotalCreditAtoms: '0',
  corrections: { items: [], nextCursor: null, complete: true },
});

const pendingReceipt = (operationId: string) => ({
  ...identity,
  state: 'pending',
  snapshotRevision: '9',
  asOf: '2026-09-12T00:00:00.000Z',
  operationId,
  admittedAt: '2026-09-12T00:00:00.000Z',
  dispatchState: 'accepted',
  authorizedMaxCreditAtoms: '50000',
});

const usagePart = (overrides: Partial<UsageData> = {}): UsageData => ({
  type: 'usage',
  id: 'dat_usage',
  model: 'openai-gpt-5.5',
  inputTokens: 10,
  outputTokens: 4,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ...overrides,
});

/** Answers each `/v1/billing/operations/:id` read from a fixed table. */
const stubReceipts = (byOperationId: Readonly<Record<string, unknown>>): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const operationId = decodeURIComponent(input.split('/').at(-1) ?? '');
      const body = byOperationId[operationId];
      return body === undefined ? { ok: false, status: 404 } : { ok: true, json: async () => body };
    }),
  );
};

function renderUsage(usageParts: UsageData[], userId: string | undefined = 'user'): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId, environment: 'development' }}>
        {children}
      </BillingSessionProvider>
    </QueryClientProvider>
  );
  render(<ChatMessageDataUsage usageParts={usageParts} />, { wrapper });
}

afterEach(() => {
  cleanup();
  recordBillingRevisionMinimum.mockClear();
  vi.unstubAllGlobals();
});

describe('ChatMessageDataUsage', () => {
  it('shows the credits the receipt says were charged, not a local price', async () => {
    stubReceipts({ op1: terminalReceipt('op1', '12345') });
    renderUsage([usagePart({ operationId: 'op1', attemptId: 'att_1', billingStatus: 'terminal' })]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: 1\.23$/)).toBeInTheDocument();
    });
    expect(recordBillingRevisionMinimum).toHaveBeenCalledWith({
      environment: 'development',
      ownerId: 'user',
      subjectId: 'account',
      revision: '9',
    });
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('shows Pending until the operation has a receipt', async () => {
    stubReceipts({ op1: pendingReceipt('op1') });
    renderUsage([usagePart({ operationId: 'op1', billingStatus: 'pending' })]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: Pending/)).toBeInTheDocument();
    });
  });

  it('notes how many charges are still pending beside the settled total', async () => {
    stubReceipts({ op1: terminalReceipt('op1', '12345'), op2: pendingReceipt('op2') });
    renderUsage([usagePart({ operationId: 'op1' }), usagePart({ id: 'dat_2', operationId: 'op2' })]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: 1\.23 · 1 pending/)).toBeInTheDocument();
    });
  });

  /* B4 R4/R5: a receipt answering for another account, another environment or
   * another operation is refused outright, so the turn stays Pending rather
   * than rendering somebody else's charge. */
  it.each([
    ['another owner', { ownerId: 'other' }],
    ['another environment', { environment: 'staging' }],
    ['another operation', { operationId: 'op_other' }],
  ])('refuses a receipt belonging to %s', async (_label, override) => {
    stubReceipts({ op1: { ...terminalReceipt('op1', '12345'), ...override } });
    renderUsage([usagePart({ operationId: 'op1' })]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: Pending/)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/1\.23/)).not.toBeInTheDocument();
  });

  /* V6: the transcript is history. An external agent's turn names that agent
   * and the model its own usage recorded, whatever the composer selects now. */
  it('names the external agent, reads not billed and never calls the receipt API', async () => {
    stubReceipts({});
    renderUsage([usagePart({ agent: 'codex', model: 'gpt-5.3-codex' })]);

    const trigger = screen.getByRole('button', {
      name: 'Usage: codex · gpt-5.3-codex, 14 tokens, Tau credits: Not billed',
    });
    expect(fetch).not.toHaveBeenCalled();

    act(() => {
      trigger.focus();
    });
    expect(await screen.findByText('via codex')).toBeInTheDocument();
    expect(screen.getByText('Not billed')).toBeInTheDocument();
    // No catalog entry → no brand sprite; the button and card still carry a visible glyph.
    expect(screen.queryByTestId(/model-icon-/)).toBeNull();
    expect(trigger.querySelector('svg')).not.toBeNull();
  });

  it('keeps the button glyph monochrome and sizes it like Copy', () => {
    stubReceipts({});
    renderUsage([usagePart()]);

    const trigger = screen.getByRole('button', { name: /^Usage: openai-gpt-5\.5, 14 tokens/ });
    expect(trigger.className).toContain('size-7');
    expect(trigger.querySelector('[data-testid="model-icon-openai"]')).not.toBeNull();
  });

  it('renders nothing without usage parts', () => {
    stubReceipts({});
    renderUsage([]);

    expect(screen.queryByText('Not billed')).not.toBeInTheDocument();
  });
});
