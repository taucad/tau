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
vi.mock('#lib/billing-payment-client.js', () => ({
  BillingPaymentConflict: PaymentConflict,
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
  beforeEach(() => vi.clearAllMocks());
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
