// @vitest-environment jsdom

// oxlint-disable-next-line import/no-unassigned-import -- extends Vitest matchers for DOM assertions.
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier } from '@taucad/billing';
import type { Entitlements } from '@taucad/billing';
import { BillingSettings } from '#components/settings/billing-settings.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const renderSettings = (): ReturnType<typeof render> =>
  render(
    <TooltipProvider>
      <BillingSettings />
    </TooltipProvider>,
  );

const useEntitlementsMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: useEntitlementsMock,
}));

const useCreditsMock = vi.hoisted(() => vi.fn());
vi.mock('@taucad/billing/hooks/use-credits', () => ({
  useCredits: useCreditsMock,
}));

const toastMock = vi.hoisted(() => {
  const base = vi.fn() as ReturnType<typeof vi.fn> & { warning: ReturnType<typeof vi.fn> };
  base.warning = vi.fn();
  return base;
});
vi.mock('#components/ui/sonner.js', () => ({
  toast: toastMock,
}));

const creditAccount = (overrides: Partial<ReturnType<typeof baseCredits>> = {}) => ({
  ...baseCredits(),
  ...overrides,
});

const baseCredits = () => ({
  balanceMicro: 18_420_000n,
  grantBalanceMicro: 15_000_000n,
  topupBalanceMicro: 3_420_000n,
  reservedMicro: 0n,
  monthlyGrantMicro: 20_000_000n,
  rolloverCeilingMicro: 40_000_000n,
  notifications: [] as Array<'grant-80' | 'grant-95'>,
  transactions: [],
});

const billingPortalMock = vi.hoisted(() => vi.fn());
const upgradeMock = vi.hoisted(() => vi.fn());
vi.mock('#lib/auth-client.js', () => ({
  authClient: {
    subscription: {
      billingPortal: billingPortalMock,
      upgrade: upgradeMock,
    },
  },
}));

// Stub the top-up modal — it's exercised in its own suite.
vi.mock('#components/billing/topup-modal.js', () => ({
  TopupModal: ({ isOpen }: { readonly isOpen: boolean }) => <div data-testid='topup-modal' data-open={isOpen} />,
}));

// The plan grid needs a router (Link CTAs) and owns its behavior in
// plan-cards.test.tsx — here we only assert it mounts for the free state.
vi.mock('#components/billing/plan-cards.js', () => ({
  PlanCards: ({ currentTier }: { readonly currentTier?: string }) => (
    <div data-testid='plan-cards' data-current-tier={currentTier} />
  ),
}));

const proEntitlements = (overrides: Partial<Entitlements> = {}): Entitlements => ({
  ...entitlementsFromTier('pro'),
  currentPeriodEnd: new Date('2026-08-17T00:00:00Z'),
  ...overrides,
});

describe('BillingSettings', () => {
  beforeEach(() => {
    billingPortalMock.mockResolvedValue(undefined);
    upgradeMock.mockResolvedValue(undefined);
    useCreditsMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('should show the free state as the plan grid pinned to Free, with no portal button (T7/U2)', () => {
    useEntitlementsMock.mockReturnValue(entitlementsFromTier('free'));

    renderSettings();

    expect(screen.getByTestId('plan-cards')).toHaveAttribute('data-current-tier', 'free');
    expect(screen.queryByRole('button', { name: /manage subscription/i })).not.toBeInTheDocument();
  });

  it('should list paid-tier quotas with Coming Soon badges (T10/T14)', () => {
    useEntitlementsMock.mockReturnValue(proEntitlements());

    renderSettings();

    expect(screen.getByText('API CAD Gateway')).toBeInTheDocument();
    expect(screen.getByText('30,000/mo')).toBeInTheDocument();
    expect(screen.getByText('3D Conversion API')).toBeInTheDocument();
    expect(screen.getByText('50,000/mo')).toBeInTheDocument();
    expect(screen.getByText('Hosted GeoSpec validation')).toBeInTheDocument();
    expect(screen.getAllByText('Coming Soon').length).toBeGreaterThanOrEqual(3);
    expect(screen.queryByTestId('plan-cards')).not.toBeInTheDocument();
  });

  it('should show the enterprise state with the custom allotment and contact CTA (B7/E7)', () => {
    useEntitlementsMock.mockReturnValue({ ...entitlementsFromTier('enterprise'), currentPeriodEnd: undefined });
    useCreditsMock.mockReturnValue(creditAccount({ monthlyGrantMicro: 250_000_000n }));

    renderSettings();

    expect(screen.getByText(/monthly credit allotment: \$250\.00/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /contact your tau team/i })).toHaveAttribute(
      'href',
      'mailto:enterprise@tau.new',
    );
  });

  it('should show the pro plan with renewal date and a portal button', async () => {
    useEntitlementsMock.mockReturnValue(proEntitlements());
    const user = userEvent.setup();

    renderSettings();

    expect(screen.getByText(/renews on/i)).toHaveTextContent('August 17, 2026');
    expect(screen.getByText('$20.00 per month')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /manage subscription/i }));
    expect(billingPortalMock).toHaveBeenCalledWith(expect.objectContaining({ returnUrl: globalThis.location.href }));
  });

  it('should surface the past-due banner without dropping the manage button', () => {
    useEntitlementsMock.mockReturnValue(proEntitlements({ tier: 'free', status: 'past_due' }));

    renderSettings();

    expect(screen.getByText(/payment failed/i)).toBeInTheDocument();
    expect(screen.getByText(/your credits are safe/i)).toBeInTheDocument();
  });

  it('should show the cancellation banner instead of a renewal line when cancelling at period end', () => {
    useEntitlementsMock.mockReturnValue(proEntitlements({ cancelAtPeriodEnd: true }));

    renderSettings();

    expect(screen.getByText(/pro until august 17, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/renews on/i)).not.toBeInTheDocument();
  });

  it('should render the balance card with split-balance and grant-ceiling copy (never "expires")', () => {
    useEntitlementsMock.mockReturnValue(proEntitlements());
    useCreditsMock.mockReturnValue(creditAccount());

    renderSettings();

    expect(screen.getByTestId('credit-balance')).toHaveTextContent('$18.42');
    expect(screen.getByText(/\$15\.00 from your monthly grant \+ \$3\.42 from credit packs/i)).toBeInTheDocument();
    expect(screen.getByText(/next \$20\.00 grant tops the balance up/i)).toBeInTheDocument();
    expect(screen.queryByText(/grant expires|resets in/i)).not.toBeInTheDocument();
  });

  it('should surface reserved-in-flight holds and negative balances (Q37)', () => {
    useEntitlementsMock.mockReturnValue(proEntitlements());
    useCreditsMock.mockReturnValue(
      creditAccount({
        balanceMicro: -1_500_000n,
        grantBalanceMicro: -1_500_000n,
        topupBalanceMicro: 0n,
        reservedMicro: 500_000n,
      }),
    );

    renderSettings();

    expect(screen.getByTestId('credit-balance')).toHaveTextContent('$-1.50');
    expect(screen.getByText(/your balance is negative/i)).toBeInTheDocument();
    expect(screen.getByText(/\$0\.50 reserved by an active chat/i)).toBeInTheDocument();
  });

  it('should fire the threshold toasts the server claimed for this read (Q26)', () => {
    useEntitlementsMock.mockReturnValue(proEntitlements());
    useCreditsMock.mockReturnValue(creditAccount({ notifications: ['grant-95'] }));

    renderSettings();

    expect(toastMock.warning).toHaveBeenCalledWith(expect.stringMatching(/almost out of credits/i));
  });

  it('should open the top-up modal from the balance card (U4)', async () => {
    useEntitlementsMock.mockReturnValue(proEntitlements());
    useCreditsMock.mockReturnValue(creditAccount());
    const user = userEvent.setup();

    renderSettings();
    expect(screen.getByTestId('topup-modal')).toHaveAttribute('data-open', 'false');

    await user.click(screen.getByRole('button', { name: /add credits/i }));

    expect(screen.getByTestId('topup-modal')).toHaveAttribute('data-open', 'true');
  });

  it('should toast a renewal when a NEW monthly_grant line appears on refetch — never for history (U11)', () => {
    useEntitlementsMock.mockReturnValue(proEntitlements());
    const grantLine = (id: string) => ({ id, reason: 'monthly_grant' });
    useCreditsMock.mockReturnValue(creditAccount({ transactions: [grantLine('ctx_history')] as never }));

    const view = renderSettings();
    expect(toastMock).not.toHaveBeenCalledWith(expect.stringMatching(/grant just landed/i));

    useCreditsMock.mockReturnValue(
      creditAccount({ transactions: [grantLine('ctx_new'), grantLine('ctx_history')] as never }),
    );
    view.rerender(
      <TooltipProvider>
        <BillingSettings />
      </TooltipProvider>,
    );

    expect(toastMock).toHaveBeenCalledWith(expect.stringMatching(/grant just landed/i));
  });
});
