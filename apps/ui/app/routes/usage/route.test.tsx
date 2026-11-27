import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wireUsageSnapshotSchema } from '@taucad/billing';
import { TooltipProvider } from '@taucad/ui/components/tooltip';
import UsagePage from '#routes/usage/route.js';

/* A funded deployment with the Cloud chunk loaded (adaptive app deployment mode W12). */
vi.mock('#cloud/use-deployment-mode.js', async () => {
  const fixture = await import('#cloud/funded-cloud.fixture.js');
  return fixture.fundedModeModule();
});

const useUsageSnapshot = vi.hoisted(() => vi.fn());
const useCredits = vi.hoisted(() => vi.fn());
const useSavedUsage = vi.hoisted(() => vi.fn());
const useBillingRevisionMinimum = vi.hoisted(() => vi.fn());
const usePersistSavedUsage = vi.hoisted(() => vi.fn());
const useCloudProjects = vi.hoisted(() => vi.fn());
const useChatName = vi.hoisted(() => vi.fn());
const getChatRecordsForResource = vi.hoisted(() => vi.fn());
vi.mock('#hooks/use-cloud-projects.js', () => ({ useCloudProjects }));
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => ({ getChatRecordsForResource }) }));
vi.mock('@taucad/billing-ui/components/usage/use-chat-name', () => ({ useChatName }));
vi.mock('@taucad/billing/hooks/use-usage-snapshot', () => ({ useUsageSnapshot }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: () => ({ tier: 'pro', isResolved: true }),
}));
vi.mock('@taucad/billing/hooks/use-credits', () => ({ useCredits }));
vi.mock('@taucad/billing-ui/db/billing-snapshot-store', () => ({
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

/** One labelled row of the open credit explanation, by the term that names it. */
const detailRow = (label: string): HTMLElement => {
  const term = screen.getByText(label, { selector: 'dt' });
  if (!(term.parentElement instanceof HTMLElement)) {
    throw new Error(`The ${label} detail row has no container.`);
  }
  return term.parentElement;
};

const renderPage = (): void => {
  render(
    <MemoryRouter>
      <TooltipProvider>
        <UsagePage />
      </TooltipProvider>
    </MemoryRouter>,
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  useCredits.mockReturnValue(balance);
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
    expect(screen.getByTestId('credits-used')).toHaveTextContent('1 credit used');
    expect(screen.getByText('Across 1 action in the selected range')).toBeInTheDocument();
    expect(screen.getByTestId('purchased-balance')).toHaveTextContent('5 credits available');
    expect(screen.getByText('1% left')).toBeInTheDocument();
    expect(screen.getByText('Pending issuance: 1 credit')).toBeInTheDocument();
    expect(screen.queryByText('Available balance')).not.toBeInTheDocument();
    /* Holds are the ledger's own: the page shows credits left, never what is reserved for work still running. */
    expect(screen.queryByText(/held|hold|reserved/iu)).not.toBeInTheDocument();
    expect(screen.getByText('2026-09-01 to 2026-09-12 (UTC)')).toBeInTheDocument();
    expect(screen.getByText('Luna')).toBeInTheDocument();
    expect(screen.getByText('Showing all 1 actions in this range.')).toBeInTheDocument();
    expect(screen.getByTestId('usage-freshness')).toHaveTextContent('Updated');
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it('shows positive sub-credit usage without decimals or a false zero', () => {
    useUsageSnapshot.mockReturnValue({
      status: 'ready',
      snapshot: { ...snapshot, totals: { ...snapshot.totals, netUsedCreditAtoms: '4000' } },
      retry: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('credits-used')).toHaveTextContent('<1 credit used');
    expect(screen.getByTestId('purchased-balance')).toHaveTextContent('5 credits available');
  });

  it('opens the per-action credit explanation with whole credits, tokens and rates', async () => {
    renderPage();

    expect(screen.queryByTestId('usage-event-detail')).not.toBeInTheDocument();
    await userEvent.click(screen.getByText('agent'));

    const detail = screen.getByTestId('usage-event-detail');
    expect(detail).toHaveTextContent('1 credit');
    expect(detail).toHaveTextContent('Succeeded · charged');
    expect(detail).not.toHaveTextContent('Authorized maximum');
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
    expect(useChatName).toHaveBeenCalledWith('project-a', 'chat-a', getChatRecordsForResource);
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

    // Scoped to its own row: the Project row is a live region on the same terms.
    const status = within(detailRow('Chat')).getByRole('status');
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

  /*
   * The listing only starts once the snapshot is ready, so the filters and the
   * table are already on screen while it is in flight. Treating that as a
   * settled "not available" offered one checkbox covering every project.
   */
  it('neither names nor offers to filter projects while the listing is in flight', async () => {
    useCloudProjects.mockReturnValue({ projects: [], isSettled: false });
    renderPage();

    expect(screen.queryByRole('button', { name: /Projects/u })).not.toBeInTheDocument();

    await userEvent.click(screen.getByText('agent'));
    const project = within(detailRow('Project')).getByRole('status');
    expect(project).toHaveTextContent('Finding the project…');
    expect(project).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('usage-event-detail')).not.toHaveTextContent('project-a');
  });

  it('stops looking once the page has given up refreshing, rather than waiting forever', async () => {
    useCloudProjects.mockReturnValue({ projects: [], isSettled: false });
    useUsageSnapshot.mockReturnValue({ status: 'unable-to-refresh', snapshot, retry: vi.fn() });
    renderPage();

    expect(useCloudProjects).toHaveBeenCalledWith({ enabled: false });
    await userEvent.click(screen.getByText('agent'));
    const detail = screen.getByTestId('usage-event-detail');
    expect(detail).toHaveTextContent('Project not available');
    expect(detail).not.toHaveTextContent('Finding the project…');
  });

  it('stops looking once the listing has failed, rather than waiting forever', async () => {
    useCloudProjects.mockReturnValue({ projects: [], isSettled: false, isFailed: true });
    renderPage();

    await userEvent.click(screen.getByText('agent'));
    const detail = screen.getByTestId('usage-event-detail');
    expect(detail).toHaveTextContent('Project not available');
    expect(detail).not.toHaveTextContent('Finding the project…');
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

    expect(screen.getByTestId('credits-used')).toHaveTextContent('1 credit used');
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
      /Offline — saved usage for a@example.test, last updated .+\. Go online for the latest usage\./u,
    );
    expect(screen.getByTestId('credits-used')).toHaveTextContent('1 credit used');
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

    expect(screen.queryByTestId('purchased-balance')).not.toBeInTheDocument();
    expect(screen.getAllByText('Balance unavailable')).toHaveLength(1);
  });
});
