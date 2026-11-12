import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactQuery from '@tanstack/react-query';
import { BillingSettings } from '#components/settings/billing-settings.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const createPortalAction = vi.hoisted(() => vi.fn());
const followPaymentRedirect = vi.hoisted(() => vi.fn());
const useCredits = vi.hoisted(() => vi.fn());
const useEntitlements = vi.hoisted(() => vi.fn());
const query = vi.hoisted(() => ({ fetching: 0, invalidateQueries: vi.fn() }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useIsFetching: () => query.fetching,
  useQueryClient: () => ({ invalidateQueries: query.invalidateQueries }),
}));
vi.mock('#lib/billing-payment-client.js', () => ({
  purchasesUnavailableMessage: 'You can’t buy credits yet. We’re still setting up payments.',
  createPaymentRequestId: () => 'request_1',
  createPortalAction,
  followPaymentRedirect,
}));
vi.mock('@taucad/billing/hooks/use-credits', () => ({ useCredits }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements }));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => ({
    apiBaseUrl: 'https://api.tau.new',
    environment: 'development',
    userId: 'user-a',
  }),
}));
vi.mock('#components/billing/topup-modal.js', () => ({
  TopupModal: () => <div>Top-up modal</div>,
}));
vi.mock('#components/billing/auto-reload-settings.js', () => ({
  AutoReloadSettings: () => <div>Automatic reload controls</div>,
}));
vi.mock('#components/billing/cancel-plan-settings.js', () => ({
  CancelPlanSettings: () => <div>Cancel plan controls</div>,
}));

const balance = {
  subjectId: 'account-a',
  availability: { state: 'available', reason: null },
  balance: {
    eligibleAvailableCreditAtoms: '120000',
    promoGrantCreditAtoms: '0',
    promoHeldCreditAtoms: '0',
    debtCreditAtoms: '0',
    netBalanceCreditAtoms: '150000',
    pendingIssuanceCreditAtoms: '0',
    planGrantCreditAtoms: '100000',
    purchasedCreditAtoms: '50000',
    planHeldCreditAtoms: '20000',
    purchasedHeldCreditAtoms: '10000',
  },
};
const entitlement = (tier: 'free' | 'pro' | 'enterprise') => ({
  isResolved: true,
  paymentCollectionAvailable: true,
  tier,
  status: 'active',
  cancelAtPeriodEnd: false,
  apiCadGatewayMonthlyLimit: 0,
  conversionApiMonthlyLimit: 0,
  geospecValidationMonthlyLimit: 0,
  canCreateGeoSpecEvidenceReports: false,
  geospecEvidenceRetentionDays: 0,
});
const renderSettings = () =>
  render(
    <MemoryRouter>
      <TooltipProvider>
        <BillingSettings />
      </TooltipProvider>
    </MemoryRouter>,
  );

describe('BillingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    query.fetching = 0;
    useCredits.mockReturnValue(balance);
    useEntitlements.mockReturnValue(entitlement('pro'));
  });

  it('renders source balances and holds from the C03 explanation', () => {
    renderSettings();
    expect(screen.getByTestId('credit-balance')).toHaveTextContent(/^4 credits$/u);
    expect(screen.getByText('<1% left')).toBeInTheDocument();
    expect(
      screen.getByText('1 more are on hold for work in progress. Purchased credits never expire.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Monthly credits' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Purchased credits' })).toBeInTheDocument();
    expect(screen.queryByText('Balance details')).not.toBeInTheDocument();
    expect(screen.queryByText('Total available')).not.toBeInTheDocument();
  });

  it('opens the first-party billing portal action', async () => {
    createPortalAction.mockResolvedValue({
      state: 'redirect_required',
      ownerId: 'user-a',
    });
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: /manage subscription/i }));
    expect(createPortalAction).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'development',
        ownerId: 'user-a',
        subjectId: 'account-a',
      }),
      expect.objectContaining({ requestId: 'request_1' }),
    );
    expect(followPaymentRedirect).toHaveBeenCalled();
  });

  it('shows no stale balance when authority is unavailable but keeps Add credits and a retry', async () => {
    useCredits.mockReturnValue({
      availability: { state: 'unavailable' },
      balance: null,
    });
    renderSettings();
    expect(screen.queryByTestId('credit-balance')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t load your balanceYour credits are safe. This is a display problem.',
    );
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(query.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['billing', 'credits'] });
  });

  it('keeps Add credits while the balance is loading', () => {
    useCredits.mockReturnValue(undefined);
    query.fetching = 1;
    renderSettings();
    const loading = screen.getByText('Loading balance…').closest('[role=status]');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    // The skeleton has the shape of the balance it stands in for: a heading line and a caption line.
    expect(loading?.querySelectorAll('[data-slot=skeleton]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Add credits' })).toBeEnabled();
  });

  it('names no plan until entitlements resolve', () => {
    useEntitlements.mockReturnValue({ ...entitlement('free'), isResolved: false });
    renderSettings();
    const loading = screen.getByText('Loading plan…').closest('[role=status]');
    expect(loading?.querySelectorAll('[data-slot=skeleton]')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
    expect(screen.queryByText('Free')).toBeNull();
  });

  it('shows the renewal date from the paid-through deadline, and the access end once cancelled', () => {
    const paidThrough = new Date('2026-10-23T04:21:27Z');
    const date = paidThrough.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    useEntitlements.mockReturnValue({ ...entitlement('pro'), paidThrough });
    const { unmount } = renderSettings();
    expect(screen.getByText(`$20/month · Renews ${date}`)).toBeInTheDocument();
    unmount();
    useEntitlements.mockReturnValue({ ...entitlement('pro'), paidThrough, cancelAtPeriodEnd: true });
    renderSettings();
    expect(screen.getByText(`$20/month · Ends ${date}`)).toBeInTheDocument();
    expect(screen.getByText('Canceled')).toBeInTheDocument();
    expect(
      screen.getByText(`Your Pro plan ends on ${date}. You can resume it any time before then.`),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume plan' })).toBeEnabled();
    expect(screen.queryByText(/Renews/u)).toBeNull();
  });

  it('renders lifecycle controls in authenticated billing settings', () => {
    renderSettings();
    expect(screen.queryByText('Automatic reload controls')).not.toBeInTheDocument();
    expect(screen.queryByText('API CAD Gateway')).not.toBeInTheDocument();
    expect(screen.getByText('$20/month')).toBeInTheDocument();
    expect(screen.getByText('Cancel plan controls')).toBeInTheDocument();
  });

  it('offers no Cancel plan once the plan already ends at the period end', () => {
    useEntitlements.mockReturnValue({ ...entitlement('pro'), cancelAtPeriodEnd: true });
    renderSettings();
    expect(screen.queryByText('Cancel plan controls')).not.toBeInTheDocument();
  });

  it('says a failed payment in plain words and offers the portal from the notice', async () => {
    createPortalAction.mockResolvedValue({ state: 'redirect_required', ownerId: 'user-a' });
    useEntitlements.mockReturnValue({ ...entitlement('pro'), status: 'past_due' });
    renderSettings();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We couldn’t charge your card. Update your payment method within 7 days to keep Pro. Your credits aren’t affected.',
    );
    expect(screen.getByText('Payment failed')).toHaveAttribute('data-tone', 'warning');
    expect(screen.getByText('$20/month · Payment due')).toBeInTheDocument();
    expect(screen.queryByText('Past due')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Update payment method' }));
    expect(createPortalAction).toHaveBeenCalledOnce();
  });

  it('shows the saved card through the shared payment method component', () => {
    useEntitlements.mockReturnValue({ ...entitlement('pro'), paymentMethod: { brand: 'visa', last4: '8252' } });
    renderSettings();
    expect(screen.getByText('Payment method')).toBeInTheDocument();
    expect(screen.getByText('Visa •••• 8252')).toBeInTheDocument();
  });

  it('gives every way the subscription page can fail one message with what to do', async () => {
    createPortalAction.mockRejectedValue(new Error('offline'));
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: 'Manage subscription' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t open the subscription page. Try again.');
  });

  it('tells an Enterprise customer how to change the plan in one line with the address', () => {
    useEntitlements.mockReturnValue(entitlement('enterprise'));
    renderSettings();
    expect(screen.getByRole('link', { name: 'enterprise@tau.new' })).toHaveAttribute(
      'href',
      'mailto:enterprise@tau.new',
    );
    expect(screen.queryByRole('link', { name: 'Contact your Tau team' })).toBeNull();
  });
});
