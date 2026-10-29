import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CancelPlanSettings } from '#components/billing/cancel-plan-settings.js';

const createPortalAction = vi.hoisted(() => vi.fn());
const followPaymentRedirect = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  createPaymentRequestId: () => 'request-a',
  createPortalAction,
  followPaymentRedirect,
}));

const binding = { apiBaseUrl: 'https://api.tau.new', environment: 'development', ownerId: 'user-a' } as const;

describe('CancelPlanSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('says the plan is kept until the end of the billing period', () => {
    render(<CancelPlanSettings binding={binding} />);

    expect(screen.getByRole('group', { name: 'Cancel plan' })).toHaveAccessibleDescription(
      "If you cancel, you'll keep full access to your plan features until the end of your billing period",
    );
  });

  it('opens the billing portal on its cancellation flow', async () => {
    const action = { state: 'redirect_required', redirectUrl: 'https://billing.stripe.com/p/session/1' };
    createPortalAction.mockResolvedValue(action);
    render(<CancelPlanSettings binding={binding} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));

    expect(createPortalAction).toHaveBeenCalledWith(
      binding,
      expect.objectContaining({ requestId: 'request-a', flow: 'subscription_cancel' }),
    );
    expect(followPaymentRedirect).toHaveBeenCalledWith(action);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says so when the cancellation flow cannot open', async () => {
    createPortalAction.mockRejectedValue(new Error('offline'));
    render(<CancelPlanSettings binding={binding} />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel plan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not open cancellation. Try again.');
    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeEnabled();
  });

  it('waits for the billing session before offering cancellation', () => {
    render(<CancelPlanSettings binding={undefined} />);

    expect(screen.getByRole('button', { name: 'Cancel plan' })).toBeDisabled();
  });
});
