import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PlanCards } from '#components/billing/plan-cards.js';

const createSubscriptionAction = vi.hoisted(() => vi.fn());
const followPaymentRedirect = vi.hoisted(() => vi.fn(() => true));
const PaymentConflict = vi.hoisted(
  () =>
    class extends Error {
      public readonly action: unknown;
      public get code(): string {
        return 'subscription_already_exists';
      }
      public constructor(action: unknown) {
        super('subscription_already_exists');
        this.action = action;
      }
    },
);
const CollectionUnavailable = vi.hoisted(() => class extends Error {});
const entitlements = vi.hoisted(() => ({ current: { isResolved: true, paymentCollectionAvailable: true } }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => entitlements.current }));
vi.mock('#lib/billing-payment-client.js', () => ({
  BillingPaymentConflict: PaymentConflict,
  BillingCollectionUnavailable: CollectionUnavailable,
  purchasesUnavailableMessage: 'Purchases are not available yet.',
  createPaymentRequestId: () => 'request_1',
  createSubscriptionAction,
  followPaymentRedirect,
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => ({
    apiBaseUrl: 'https://api.tau.new',
    environment: 'development',
    userId: 'user-a',
  }),
}));

describe('PlanCards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    entitlements.current = { isResolved: true, paymentCollectionAvailable: true };
  });
  it.each([
    [{ isResolved: true, paymentCollectionAvailable: false }, true],
    [{ isResolved: false, paymentCollectionAvailable: false }, false],
  ])('keeps Subscribe disabled until collection is available (%o)', (state, showsNote) => {
    entitlements.current = state;
    render(
      <MemoryRouter>
        <PlanCards />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Subscribe Now' })).toBeDisabled();
    expect(screen.queryByText('Purchases are not available yet.') !== null).toBe(showsNote);
  });
  it('shows the availability copy instead of a retry when the API refuses collection', async () => {
    createSubscriptionAction.mockRejectedValue(new CollectionUnavailable());
    render(
      <MemoryRouter>
        <PlanCards />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }));
    expect(await screen.findByText('Purchases are not available yet.')).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).toBeNull();
  });
  it('starts the first-party Pro subscription action', async () => {
    createSubscriptionAction.mockResolvedValue({
      state: 'redirect_required',
      ownerId: 'user-a',
      redirectUrl: 'https://checkout.example',
    });
    render(
      <MemoryRouter>
        <PlanCards />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }));
    expect(createSubscriptionAction).toHaveBeenCalledWith(
      expect.objectContaining({
        environment: 'development',
        ownerId: 'user-a',
      }),
      expect.objectContaining({ requestId: 'request_1' }),
    );
    expect(followPaymentRedirect).toHaveBeenCalled();
  });
  it('advertises paid credit terms without a complimentary grant (D1/D2)', () => {
    render(
      <MemoryRouter>
        <PlanCards />
      </MemoryRouter>,
    );
    expect(screen.getByText('2,000 credits every month')).toBeInTheDocument();
    expect(screen.getByText('Buy credits any time — 100 credits per US$1')).toBeInTheDocument();
    expect(screen.queryByText(/of usage credits per month/)).not.toBeInTheDocument();
    expect(screen.queryByText(/free credits|welcome credits|refill/i)).not.toBeInTheDocument();
  });
  it('pins the current tier', () => {
    render(
      <MemoryRouter>
        <PlanCards currentTier='pro' />
      </MemoryRouter>,
    );
    expect(screen.getByRole('button', { name: 'Current plan' })).toBeDisabled();
  });
  it('makes bounded feature lists keyboard-scrollable', () => {
    render(
      <MemoryRouter>
        <PlanCards isFeatureListScrollable />
      </MemoryRouter>,
    );
    const featureList = screen.getByRole('list', { name: 'Pro Plan features' });

    expect(featureList).toHaveAttribute('tabindex', '0');
    expect(featureList).toHaveClass('max-h-80', 'scroll-shadows-y');
  });
  it('resumes the owned pending subscription returned by a conflict', async () => {
    const action = {
      state: 'redirect_required',
      ownerId: 'user-a',
      subjectId: 'account-a',
      environment: 'development',
      redirectUrl: 'https://checkout.example/resume',
    };
    createSubscriptionAction.mockRejectedValue(new PaymentConflict(action));
    render(
      <MemoryRouter>
        <PlanCards />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Subscribe Now' }));
    expect(followPaymentRedirect).toHaveBeenCalledWith(action);
  });
});
