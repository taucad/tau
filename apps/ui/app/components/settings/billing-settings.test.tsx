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
  purchasesUnavailableMessage: 'Purchases are not available yet.',
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
vi.mock('#components/billing/account-closure-settings.js', () => ({
  AccountClosureSettings: () => <div>Account closure controls</div>,
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
    expect(screen.getByTestId('credit-balance')).toMatchTextContent('4 credits available');
    expect(screen.getByText('Purchased credits · Never expire')).toBeInTheDocument();
    expect(screen.getByText('<1% left')).toBeInTheDocument();
    expect(screen.getByText('1 credit reserved for active work.')).toBeInTheDocument();
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
    expect(screen.getByRole('alert')).toMatchTextContent('Balance unavailable.');
    expect(screen.getByRole('button', { name: /add more/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(query.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['billing', 'credits'] });
  });

  it('keeps Add credits while the balance is loading', () => {
    useCredits.mockReturnValue(undefined);
    query.fetching = 1;
    renderSettings();
    expect(screen.getByRole('status')).toMatchTextContent('Loading balance…');
    expect(screen.getByRole('button', { name: /add more/i })).toBeEnabled();
  });

  it('names no plan until entitlements resolve', () => {
    useEntitlements.mockReturnValue({ ...entitlement('free'), isResolved: false });
    renderSettings();
    expect(screen.getByText('Loading plan…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /subscribe/i })).toBeNull();
    expect(screen.queryByText('Free')).toBeNull();
  });

  it('shows the renewal date from the paid-through deadline, and the access end once cancelled', () => {
    const paidThrough = new Date('2026-10-23T04:21:27Z');
    const date = paidThrough.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    useEntitlements.mockReturnValue({ ...entitlement('pro'), paidThrough });
    const { unmount } = renderSettings();
    expect(screen.getByText(`Renews on ${date}`)).toBeInTheDocument();
    unmount();
    useEntitlements.mockReturnValue({ ...entitlement('pro'), paidThrough, cancelAtPeriodEnd: true });
    renderSettings();
    expect(screen.getByText(new RegExp(`Pro until ${date}`, 'u'))).toBeInTheDocument();
    expect(screen.queryByText(/Renews on/u)).toBeNull();
  });

  it('renders lifecycle controls in authenticated billing settings', () => {
    renderSettings();
    expect(screen.queryByText('Automatic reload controls')).not.toBeInTheDocument();
    expect(screen.queryByText('API CAD Gateway')).not.toBeInTheDocument();
    expect(screen.getByText('$20 per month USD')).toBeInTheDocument();
    expect(screen.getByText('Account closure controls')).toBeInTheDocument();
  });
});
