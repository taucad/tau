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
    eligibleAvailableCreditAtoms: '12000000000',
    netBalanceCreditAtoms: '12000000000',
    planGrantCreditAtoms: '10000000000',
    purchasedCreditAtoms: '5000000000',
    planHeldCreditAtoms: '2000000000',
    purchasedHeldCreditAtoms: '1000000000',
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
    expect(screen.getByTestId('credit-balance')).toHaveTextContent('12');
    expect(screen.getByText(/10.*from your plan.*5.*purchased/i)).toBeInTheDocument();
    expect(screen.getByText(/3.*held for active work/i)).toBeInTheDocument();
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
    expect(screen.getByRole('alert')).toHaveTextContent('Balance unavailable.');
    expect(screen.getByRole('button', { name: /add credits/i })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(query.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['billing', 'credits'] });
  });

  it('keeps Add credits while the balance is loading', () => {
    useCredits.mockReturnValue(undefined);
    query.fetching = 1;
    renderSettings();
    expect(screen.getByRole('status')).toHaveTextContent('Loading balance…');
    expect(screen.getByRole('button', { name: /add credits/i })).toBeEnabled();
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
    expect(screen.getByText('Automatic reload controls')).toBeInTheDocument();
    expect(screen.getByText('Account closure controls')).toBeInTheDocument();
  });
});
