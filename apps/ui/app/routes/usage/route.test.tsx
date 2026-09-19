import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireUsageSnapshotSchema } from '@taucad/billing';
import UsagePage from '#routes/usage/route.js';

const useUsageSnapshot = vi.hoisted(() => vi.fn());
const useCredits = vi.hoisted(() => vi.fn());
const useOpenHolds = vi.hoisted(() => vi.fn());
const useSavedUsage = vi.hoisted(() => vi.fn());
const useBillingRevisionMinimum = vi.hoisted(() => vi.fn());
const usePersistSavedUsage = vi.hoisted(() => vi.fn());
const useCloudProjects = vi.hoisted(() => vi.fn());
const useChatName = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-cloud-projects.js', () => ({ useCloudProjects }));
vi.mock('#routes/usage/use-chat-name.js', () => ({ useChatName }));
vi.mock('@taucad/billing/hooks/use-usage-snapshot', () => ({ useUsageSnapshot }));
vi.mock('@taucad/billing/hooks/use-credits', () => ({ useCredits }));
vi.mock('@taucad/billing/hooks/use-open-holds', () => ({ useOpenHolds }));
vi.mock('#db/billing-snapshot-store.js', () => ({
  canonicalUsageQueryKey: () => 'key',
  useBillingRevisionMinimum,
  useSavedUsage,
  usePersistSavedUsage,
}));

const timestamp = '2026-09-12T00:00:00.000Z';
const groupTotals = { accountDeltaCreditAtoms: '-12345', netUsedCreditAtoms: '12345', eventCount: '1' };
const rawSnapshot = {
  schemaVersion: 1,
  environment: 'development',
  ownerId: 'user',
  subjectId: 'account',
  snapshotRevision: '7',
  asOf: timestamp,
  query: {
    preset: 'custom',
    fromDate: '2026-09-01',
    toDate: '2026-09-13',
    timeZone: 'UTC',
    models: [],
    activities: [],
    projects: [],
  },
  coverage: {
    historyStart: null,
    legacyBefore: null,
    complete: true,
    detailComplete: true,
    excludedUnknownTimeCount: '0',
  },
  availability: { state: 'available', reason: null },
  totals: groupTotals,
  rows: {
    items: [
      {
        schemaVersion: 1,
        environment: 'development',
        ownerId: 'user',
        subjectId: 'account',
        operationId: 'op_1',
        baseTransactionId: 'txn_1',
        terminalRevision: '7',
        policyVersion: 'policy_1',
        activationId: 'activation_1',
        meterContractId: 'meter_1',
        category: 'llm',
        model: { id: 'openai-gpt-5.6-luna', displayName: 'Luna', providerId: 'openai' },
        activity: { kind: 'agent', projectHint: 'project-a', chatHint: 'chat-a', parentAttemptKey: null },
        historyVersion: 1,
        admittedAt: timestamp,
        dispatchIntentAt: timestamp,
        usageOccurredAt: timestamp,
        evidenceOccurredAt: timestamp,
        timingStatus: 'dispatch_intent',
        kind: 'base',
        resolvedAt: timestamp,
        executionStatus: 'succeeded',
        customerState: 'settled',
        authorizedMaxCreditAtoms: '20000',
        chargedCreditAtoms: '12345',
        accountDeltaCreditAtoms: '-12345',
        meteringStatus: 'complete',
        meterItems: [],
        tokens: {
          status: 'complete',
          uncachedInput: '1000',
          cacheRead: '0',
          cacheWrite: '0',
          inputTotal: '1000',
          output: '50',
          reasoning: '10',
        },
      },
    ],
    nextCursor: null,
    complete: true,
  },
  days: { items: [{ day: '2026-09-12', ...groupTotals }], nextCursor: null, complete: true },
  models: {
    items: [{ modelId: 'openai-gpt-5.6-luna', modelDisplayName: 'Luna', ...groupTotals }],
    nextCursor: null,
    complete: true,
  },
  activities: { items: [{ activity: 'agent', ...groupTotals }], nextCursor: null, complete: true },
};
const snapshot = wireUsageSnapshotSchema.parse(rawSnapshot);

/** The same range, spent in two projects this device can name neither of. */
const unnamedProjectsSnapshot = ((): typeof snapshot => {
  const [first] = rawSnapshot.rows.items;
  const variant = (operationId: string, projectHint: string): unknown => ({
    ...first,
    operationId,
    baseTransactionId: `txn_${operationId}`,
    activity: { ...first!.activity, projectHint },
  });
  return wireUsageSnapshotSchema.parse({
    ...rawSnapshot,
    rows: { ...rawSnapshot.rows, items: [variant('op_x', 'project-x'), variant('op_y', 'project-y')] },
  });
})();

const balance = {
  balance: {
    eligibleAvailableCreditAtoms: '250000',
    planGrantCreditAtoms: '200000',
    purchasedCreditAtoms: '50000',
    promoGrantCreditAtoms: '0',
    pendingIssuanceCreditAtoms: '10000',
    debtCreditAtoms: '0',
    planHeldCreditAtoms: '30000',
    purchasedHeldCreditAtoms: '10000',
    promoHeldCreditAtoms: '0',
  },
};

/** Two open holds: the first still running, the second past its release grace. */
const openHolds = (): unknown => {
  const now = Date.now();
  const hold = (offsetMinutes: number) => new Date(now + offsetMinutes * 60_000).toISOString();
  return {
    environment: 'development',
    ownerId: 'user',
    holds: [
      {
        operationId: 'operation-running',
        model: { id: 'gpt-6-astra', displayName: 'Astra', providerId: 'openai' },
        heldCreditAtoms: '3084332',
        admittedAt: hold(-2),
        dueAt: hold(8),
        releaseAfter: hold(13),
        dispatchState: 'accepted',
        customerState: 'pending',
      },
      {
        operationId: 'operation-expired',
        model: { id: 'gpt-5.6-luna', displayName: null, providerId: null },
        heldCreditAtoms: '65947',
        admittedAt: hold(-30),
        dueAt: hold(-20),
        releaseAfter: hold(-15),
        dispatchState: 'recovery_required',
        customerState: 'pending',
      },
    ],
  };
};

const renderPage = (): void => {
  render(
    <MemoryRouter>
      <UsagePage />
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  useCredits.mockReturnValue(balance);
  useOpenHolds.mockReturnValue({ environment: 'development', ownerId: 'user', holds: [] });
  useUsageSnapshot.mockReturnValue({ status: 'ready', snapshot, retry: vi.fn() });
  useBillingRevisionMinimum.mockReturnValue(undefined);
  useSavedUsage.mockReturnValue(undefined);
  usePersistSavedUsage.mockReturnValue('saved');
  useCloudProjects.mockReturnValue({
    projects: [{ id: 'project-a', name: 'Gearbox', role: 'owner' }],
    isSettled: true,
  });
  useChatName.mockReturnValue('Bracket redesign');
});

afterEach(() => {
  cleanup();
});

describe('UsagePage', () => {
  it('renders the server snapshot without any local chat or project source', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Tau usage' })).toBeInTheDocument();
    expect(screen.getByText(/Usage through the Tau LLM provider/)).toBeInTheDocument();
    expect(screen.getByTestId('credits-used')).toHaveTextContent('1.23 credits');
    expect(screen.getByText(/Exactly 1\.2345 credits across 1 action/)).toBeInTheDocument();
    expect(screen.getByTestId('available-balance')).toHaveTextContent('25 credits');
    expect(screen.getByText('Paid plan: 20')).toBeInTheDocument();
    expect(screen.getByText('Purchased: 5')).toBeInTheDocument();
    expect(screen.getByText('Promotional: 0')).toBeInTheDocument();
    expect(screen.getByText('Pending issuance: 1')).toBeInTheDocument();
    expect(screen.getByText('Debt: 0')).toBeInTheDocument();
    expect(screen.getByTestId('reserved-credits')).toHaveTextContent('4 credits');
    expect(screen.getByText(/Held for work in flight/)).toBeInTheDocument();
    expect(screen.getByText('2026-09-01 to 2026-09-12 (UTC)')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Showing all 1 actions in this range.')).toBeInTheDocument();
    expect(screen.getByTestId('usage-freshness')).toHaveTextContent('Updated');
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('opens the per-action credit explanation with exact credits, tokens and rates', async () => {
    renderPage();

    expect(screen.queryByTestId('usage-event-detail')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('agent'));

    const detail = screen.getByTestId('usage-event-detail');
    expect(detail).toHaveTextContent('1.2345 credits');
    expect(detail).toHaveTextContent('Authorized maximum');
    expect(detail).toHaveTextContent('Cache read');
    expect(detail).toHaveTextContent('Reasoning (of output)');
  });

  // ── Names, never ids (Q9) ────────────────────────────────────────────────
  it('names the project a receipt belongs to instead of showing its id', async () => {
    renderPage();
    await userEvent.click(screen.getByText('agent'));

    const detail = screen.getByTestId('usage-event-detail');
    expect(detail).toHaveTextContent('Gearbox');
    expect(detail).not.toHaveTextContent('project-a');
  });

  it('labels a project it cannot resolve rather than falling back to the id', async () => {
    useCloudProjects.mockReturnValue({ projects: [], isSettled: true });
    renderPage();
    await userEvent.click(screen.getByText('agent'));

    const detail = screen.getByTestId('usage-event-detail');
    expect(detail).toHaveTextContent('Project not available');
    expect(detail).not.toHaveTextContent('project-a');
  });

  it('names the chat the spend happened in, and never its id', async () => {
    renderPage();
    await userEvent.click(screen.getByText('agent'));

    const detail = screen.getByTestId('usage-event-detail');
    expect(detail).toHaveTextContent('Bracket redesign');
    expect(detail).not.toHaveTextContent('chat-a');
    expect(useChatName).toHaveBeenCalledWith('project-a', 'chat-a');
  });

  it('reads no local storage until a row is opened', () => {
    renderPage();

    expect(useChatName).not.toHaveBeenCalled();
  });

  /* A live region from the moment the row opens, so the name replacing the
     loading label is announced rather than landing silently. */
  it.each([
    { label: 'still reading', value: undefined, text: 'Finding the chat…', busy: 'true' },
    { label: 'not on this device', value: null, text: 'Chat not on this device', busy: 'false' },
    { label: 'named', value: 'Bracket redesign', text: 'Bracket redesign', busy: 'false' },
  ])('announces the chat row politely while it is $label', async ({ value, text, busy }) => {
    useChatName.mockReturnValue(value);
    renderPage();
    await userEvent.click(screen.getByText('agent'));

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(text);
    expect(status).toHaveAttribute('aria-busy', busy);
  });

  it('collapses every project it cannot name into one filter option covering all of them', async () => {
    useCloudProjects.mockReturnValue({ projects: [], isSettled: true });
    useUsageSnapshot.mockReturnValue({ status: 'ready', snapshot: unnamedProjectsSnapshot, retry: vi.fn() });
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Projects/u }));

    const options = await screen.findAllByRole('menuitemcheckbox');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveTextContent('Project not available');

    await userEvent.click(options[0]!);
    expect(useUsageSnapshot).toHaveBeenLastCalledWith(
      expect.objectContaining({ projects: ['project-x', 'project-y'] }),
      expect.any(Object),
    );
  });

  it('offers the project filter by name', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /Projects/u }));

    expect(await screen.findByRole('menuitemcheckbox', { name: 'Gearbox' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitemcheckbox', { name: 'project-a' })).not.toBeInTheDocument();
  });

  it('asks for no project listing while the page is offline on a saved snapshot', () => {
    useSavedUsage.mockReturnValue({ snapshot, label: 'a@example.test' });
    useUsageSnapshot.mockReturnValue({ status: 'saved', snapshot, retry: vi.fn() });
    renderPage();

    expect(useCloudProjects).toHaveBeenCalledWith({ enabled: false });
  });

  it.each([
    { state: { status: 'loading' }, label: 'Loading your Tau usage…' },
    { state: { status: 'refreshing', snapshot }, label: 'Refreshing…' },
    { state: { status: 'unable-to-refresh', snapshot }, label: 'Showing saved usage; unable to refresh' },
    { state: { status: 'unavailable' }, label: 'No saved usage for this view' },
    { state: { status: 'signed-out' }, label: 'Sign in to see your Tau usage.' },
  ])('labels the $state.status page state', ({ state, label }) => {
    useUsageSnapshot.mockReturnValue({ ...state, retry: vi.fn() });
    renderPage();

    expect(screen.getByTestId('usage-freshness')).toHaveTextContent(label);
  });

  it('keeps the last good snapshot and offers a retry when a refresh fails', async () => {
    const retry = vi.fn();
    useUsageSnapshot.mockReturnValue({ status: 'unable-to-refresh', snapshot, retry });
    renderPage();

    expect(screen.getByTestId('credits-used')).toHaveTextContent('1.23 credits');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });

  it('never renders a zero total for a failed read', () => {
    useUsageSnapshot.mockReturnValue({ status: 'unavailable', retry: vi.fn() });
    renderPage();

    expect(screen.queryByTestId('credits-used')).not.toBeInTheDocument();
    expect(screen.getByText('No saved usage for this view')).toBeInTheDocument();
  });

  it('uses the durable receipt revision and distinguishes an uncached offline profile from sign-out', () => {
    const minimum = { environment: 'development', ownerId: 'user', subjectId: 'account', revision: '8' };
    useBillingRevisionMinimum.mockReturnValue(minimum);
    useUsageSnapshot.mockReturnValue({ status: 'signed-out', retry: vi.fn() });

    renderPage();

    expect(useUsageSnapshot).toHaveBeenCalledWith(expect.any(Object), { minimum, saved: undefined });
    expect(useCredits).toHaveBeenCalledWith(minimum);
    expect(screen.getByText('No saved usage for this view')).toBeInTheDocument();
    expect(screen.queryByText('Sign in to see your Tau usage.')).not.toBeInTheDocument();
  });

  // ── Saved snapshots (C10-U4) ─────────────────────────────────────────────
  it('renders the saved snapshot on a cold offline start, dated and without filters', () => {
    useSavedUsage.mockReturnValue({ snapshot, label: 'a@example.test' });
    useUsageSnapshot.mockReturnValue({ status: 'saved', snapshot, retry: vi.fn() });
    renderPage();

    expect(screen.getByTestId('usage-freshness')).toHaveTextContent(
      /Offline — saved usage for a@example.test, last updated .+\. Reconnect for the latest usage\./u,
    );
    expect(screen.getByTestId('credits-used')).toHaveTextContent('1.23 credits');
    expect(screen.queryByRole('button', { name: /Models/u })).not.toBeInTheDocument();
  });

  it.each([
    { outcome: 'quota-exceeded', label: 'Not enough storage to keep this usage for offline viewing.' },
    { outcome: 'unavailable', label: 'Saving usage for offline viewing is unavailable on this device.' },
  ])('reports offline saving as $outcome rather than dropping it silently', ({ outcome, label }) => {
    usePersistSavedUsage.mockReturnValue(outcome);
    renderPage();

    expect(screen.getByTestId('usage-offline-saving')).toHaveTextContent(label);
  });

  it('keeps the balance card unavailable rather than zero when the balance read fails', () => {
    useCredits.mockReturnValue(undefined);
    renderPage();

    expect(screen.queryByTestId('available-balance')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reserved-credits')).not.toBeInTheDocument();
    expect(screen.getAllByText('Balance unavailable')).toHaveLength(2);
  });

  it('lists each open hold with its age, and says a hold past its time to live is being released', () => {
    useOpenHolds.mockReturnValue(openHolds());
    renderPage();

    const rows = screen.getAllByRole('row').filter((row) => row.closest('[data-testid="reserved-table"]') !== null);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Astra');
    expect(rows[1]).toHaveTextContent('308.43');
    expect(rows[1]).toHaveTextContent('2 minutes ago');
    expect(rows[1]).toHaveTextContent('Running');
    /* Past `releaseAfter`, the reserve is coming back whatever the dispatch state says. */
    expect(rows[2]).toHaveTextContent('gpt-5.6-luna');
    expect(rows[2]).toHaveTextContent('6.59');
    expect(rows[2]).toHaveTextContent('Being released');
  });

  it.each([
    { label: 'no hold is open', value: { environment: 'development', ownerId: 'user', holds: [] } },
    { label: 'the holds read fails', value: undefined },
  ])('renders no reserved table when $label', ({ value }) => {
    useOpenHolds.mockReturnValue(value);
    renderPage();

    expect(screen.queryByTestId('reserved-table')).not.toBeInTheDocument();
  });

  it('reports nothing reserved rather than hiding the card when no hold is open', () => {
    useCredits.mockReturnValue({
      balance: { ...balance.balance, planHeldCreditAtoms: '0', purchasedHeldCreditAtoms: '0' },
    });
    renderPage();

    expect(screen.getByTestId('reserved-credits')).toHaveTextContent('0 credits');
    expect(screen.getByText('Nothing held for work in flight')).toBeInTheDocument();
  });
});
