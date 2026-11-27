import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as AskDeadline from '#lib/ask-deadline.js';
import type { UsageData } from '@taucad/chat';
import { BillingSessionProvider } from '@taucad/billing/hooks/billing-session';
import { ChatMessageDataUsage } from '#routes/w.$workspace.$project/chat-message-data-usage.js';
import { receiptDeadlines } from '#routes/w.$workspace.$project/chat-receipt-credits.js';

/* A funded deployment with the Cloud chunk loaded (adaptive app deployment mode W12). */
vi.mock('#cloud/use-deployment-mode.js', async () => {
  const fixture = await import('#cloud/funded-cloud.fixture.js');
  return fixture.fundedModeModule();
});
vi.mock('#cloud/cloud-entries.js', async () => {
  const fixture = await import('#cloud/funded-cloud.fixture.js');
  return fixture.loadedCloudEntries();
});

const recordBillingRevisionMinimum = vi.hoisted(() => vi.fn(async () => undefined));

/* One ask deadline is 5 s in the app; these rows run it at 50 ms. */
vi.mock('#lib/ask-deadline.js', async (importOriginal) => {
  const actual: typeof AskDeadline = await importOriginal();
  return {
    ...actual,
    createAskDeadlines: (timer?: AskDeadline.AskDeadlineTimer) => actual.createAskDeadlines(timer, 50),
  };
});

vi.mock('@taucad/ui-kit/icons/svg-icon', () => ({
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
vi.mock('@taucad/billing-ui/db/billing-snapshot-store', () => ({ recordBillingRevisionMinimum }));
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

/**
 * Answers receipt reads from a fixed table: the batch route (`/v1/billing/operations?operationIds=…`) with the
 * receipts it holds, and, for an API without the batch route (`batch: false`), each `/v1/billing/operations/:id`.
 */
const stubReceipts = (byOperationId: Readonly<Record<string, unknown>>, { batch = true } = {}): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname === '/v1/billing/operations') {
        if (!batch) {
          return { ok: false, status: 404 };
        }
        const receipts = url.searchParams
          .getAll('operationIds')
          .flatMap((operationId) => (byOperationId[operationId] === undefined ? [] : [byOperationId[operationId]]));
        return { ok: true, json: async () => ({ receipts }) };
      }
      const operationId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
      const body = byOperationId[operationId];
      return body === undefined ? { ok: false, status: 404 } : { ok: true, json: async () => body };
    }),
  );
};

function renderUsage(
  usageParts: UsageData[],
  userId: string | undefined = 'user',
  { apiBaseUrl = 'https://api.example' } = {},
): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BillingSessionProvider value={{ apiBaseUrl, userId, environment: 'development' }}>
        {children}
      </BillingSessionProvider>
    </QueryClientProvider>
  );
  render(<ChatMessageDataUsage usageParts={usageParts} />, { wrapper });
}

afterEach(() => {
  cleanup();
  receiptDeadlines.cancel();
  recordBillingRevisionMinimum.mockClear();
  vi.unstubAllGlobals();
});

describe('ChatMessageDataUsage', () => {
  it('shows the credits the receipt says were charged, not a local price', async () => {
    stubReceipts({ op1: terminalReceipt('op1', '12345') });
    renderUsage([usagePart({ operationId: 'op1', attemptId: 'att_1', billingStatus: 'terminal' })]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: 1$/)).toBeInTheDocument();
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
      expect(screen.getByLabelText(/Tau credits: 1 · 1 pending/)).toBeInTheDocument();
    });
  });

  /* Chat performance WP-13 step 6: a turn's operations are read in one request, not one per operation. */
  it('should read every operation of a turn in one batch request', async () => {
    stubReceipts({ op1: terminalReceipt('op1', '12345'), op2: pendingReceipt('op2') });
    renderUsage([usagePart({ operationId: 'op2' }), usagePart({ id: 'dat_2', operationId: 'op1' })]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: 1 · 1 pending/)).toBeInTheDocument();
    });
    expect(vi.mocked(fetch).mock.calls.map(([input]) => input)).toEqual([
      'https://api.example/v1/billing/operations?operationIds=op1&operationIds=op2',
    ]);
    expect(recordBillingRevisionMinimum).toHaveBeenCalledTimes(1);
  });

  it('should read one operation at a time from an API without the batch route', async () => {
    stubReceipts({ op1: terminalReceipt('op1', '12345'), op2: pendingReceipt('op2') }, { batch: false });
    renderUsage([usagePart({ operationId: 'op1' }), usagePart({ id: 'dat_2', operationId: 'op2' })], 'user', {
      apiBaseUrl: 'https://legacy.example',
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: 1 · 1 pending/)).toBeInTheDocument();
    });
    expect(vi.mocked(fetch).mock.calls.map(([input]) => input)).toEqual([
      'https://legacy.example/v1/billing/operations?operationIds=op1&operationIds=op2',
      'https://legacy.example/v1/billing/operations/op1',
      'https://legacy.example/v1/billing/operations/op2',
    ]);
  });

  /* B4 R4/R5: a receipt answering for another account, another environment or
   * another operation is refused outright, so the turn has no answer (checking,
   * then "can't check", I15) rather than rendering somebody else's charge. */
  it.each([
    ['another owner', { ownerId: 'other' }],
    ['another environment', { environment: 'staging' }],
    ['another operation', { operationId: 'op_other' }],
  ])('refuses a receipt belonging to %s', async (_label, override) => {
    stubReceipts({ op1: { ...terminalReceipt('op1', '12345'), ...override } });
    renderUsage([usagePart({ operationId: 'op1' })]);

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: Can’t check/u)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/Tau credits: 1/)).not.toBeInTheDocument();
  });

  /* W9 D2 (R4, I15): a receipt with no answer is "Can't check" after one ask deadline, with a Retry that rereads it. */
  it('says it cannot check after the deadline, and its Retry rereads the receipt', async () => {
    stubReceipts({});
    renderUsage([usagePart({ operationId: 'op1' })]);
    const trigger = await screen.findByRole('button', { name: /Tau credits: Can’t check/u });

    act(() => {
      trigger.focus();
    });
    const retry = await screen.findByRole('button', { name: 'Retry' });
    stubReceipts({ op1: terminalReceipt('op1', '12345') });
    act(() => {
      retry.click();
    });

    await waitFor(() => {
      expect(screen.getByLabelText(/Tau credits: 1$/u)).toBeInTheDocument();
    });
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
    expect(trigger.className).toContain('size-6');
    expect(trigger.querySelector('[data-testid="model-icon-openai"]')).not.toBeNull();
  });

  it('renders nothing without usage parts', () => {
    stubReceipts({});
    renderUsage([]);

    expect(screen.queryByText('Not billed')).not.toBeInTheDocument();
  });
});

it.each([
  [{ costUsdTicks: 2_000_000_000, costIsPartial: false, usageIsIncomplete: false }, '$0.20'],
  [{ costUsdTicks: 1, costIsPartial: false, usageIsIncomplete: false }, '$0.0000000001'],
  [{ costUsdTicks: 0, costIsPartial: false, usageIsIncomplete: false }, '$0.00'],
  [{ costIsPartial: true, usageIsIncomplete: true }, 'Unavailable or partial'],
])('shows vendor cost separately from Tau receipts: %j', async (vendorReport, expected) => {
  stubReceipts({});
  renderUsage([usagePart({ agent: 'grok', model: 'Actual Grok', vendorReport })]);
  act(() => {
    screen.getByRole('button', { name: /Usage: grok/ }).focus();
  });
  expect(await screen.findByText('Grok-reported cost')).toBeInTheDocument();
  expect(screen.getByText(expected)).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
