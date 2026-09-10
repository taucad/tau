import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingSettings } from '#components/settings/billing-settings.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const createPortalAction = vi.hoisted(() => vi.fn());
const followPaymentRedirect = vi.hoisted(() => vi.fn());
const useCredits = vi.hoisted(() => vi.fn());
const useEntitlements = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
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
  tier,
  status: 'active',
  cancelAtPeriodEnd: false,
  currentPeriodEnd: new Date('2026-10-01T00:00:00Z'),
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

  it('shows no stale balance when authority is unavailable', () => {
    useCredits.mockReturnValue({
      availability: { state: 'unavailable' },
      balance: null,
    });
    renderSettings();
    expect(screen.queryByTestId('credit-balance')).toBeNull();
  });

  it('renders lifecycle controls in authenticated billing settings', () => {
    renderSettings();
    expect(screen.getByText('Automatic reload controls')).toBeInTheDocument();
    expect(screen.getByText('Account closure controls')).toBeInTheDocument();
  });
});
