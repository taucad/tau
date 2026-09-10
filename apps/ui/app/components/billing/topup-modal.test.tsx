import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TopupModal } from '#components/billing/topup-modal.js';

const client = vi.hoisted(() => ({
  prepareTopup: vi.fn(),
  confirmPaymentAction: vi.fn(),
  cancelPaymentAction: vi.fn(),
  recoverPaymentAction: vi.fn(),
  createPortalAction: vi.fn(),
  getUnresolvedPaymentActions: vi.fn(),
  followPaymentRedirect: vi.fn(() => false),
}));
type TestSession = {
  apiBaseUrl?: string;
  environment?: 'development' | 'staging';
  userId?: string;
};
const session = vi.hoisted((): { current: TestSession } => ({
  current: {
    apiBaseUrl: 'https://api.tau.new',
    environment: 'development',
    userId: 'user-a',
  },
}));
const PaymentConflict = vi.hoisted(
  () =>
    class extends Error {
      public action: unknown;
      public code = 'action_already_pending';
      public constructor(action: unknown) {
        super('action_already_pending');
        this.action = action;
      }
    },
);
vi.mock('#lib/billing-payment-client.js', () => ({
  ...client,
  BillingPaymentConflict: PaymentConflict,
  createPaymentRequestId: () => 'request_1',
}));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: () => ({ paymentMethod: { brand: 'visa', last4: '4242' } }),
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => session.current,
}));
vi.mock('#components/ui/sonner.js', () => ({
  toast: Object.assign(vi.fn(), { warning: vi.fn() }),
}));

const wireAction = (state: string) => ({
  actionId: 'topup_1',
  ownerId: 'user-a',
  subjectId: 'account-a',
  state,
  purpose: 'manual_topup',
  redirectUrl: null,
  attention: null,
  receipt: null,
  frozen: {
    principalMinor: '2500',
    taxMinor: '250',
    grossMinor: '2750',
    maximumGrossMinor: '2750',
    creditAtoms: '25000000',
    paymentMethod: { brand: 'visa', last4: '4242' },
  },
});
const renderModal = () =>
  render(
    <MemoryRouter>
      <TopupModal isOpen onOpenChange={vi.fn()} />
    </MemoryRouter>,
  );

describe('TopupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getUnresolvedPaymentActions.mockResolvedValue([]);
    session.current = {
      apiBaseUrl: 'https://api.tau.new',
      environment: 'development',
      userId: 'user-a',
    };
  });

  it.each(['success', 'conflict'])('ignores a delayed %s after A to B to A', async (outcome) => {
    let settle!: (value: unknown) => void;
    client.prepareTopup.mockImplementation(
      async () =>
        new Promise((resolve, reject) => {
          settle =
            outcome === 'success'
              ? resolve
              : (value) => {
                  reject(new PaymentConflict(value));
                };
        }),
    );
    const view = renderModal();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /review us\$25/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /review us\$25/i }));
    session.current = { ...session.current, userId: 'user-b' };
    view.rerender(
      <MemoryRouter>
        <TopupModal isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    session.current = { ...session.current, userId: 'user-a' };
    view.rerender(
      <MemoryRouter>
        <TopupModal isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    settle(wireAction('prepared'));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Confirm quote' })).toBeNull();
    });
    expect(client.followPaymentRedirect).not.toHaveBeenCalled();
  });

  it('hides an owned action immediately on logout while GET is pending', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('processing')]);
    const view = renderModal();
    expect(await screen.findByText(/payment is still processing/i)).toBeInTheDocument();
    client.getUnresolvedPaymentActions.mockReturnValue(
      new Promise(() => {
        // Intentionally unresolved to exercise logout invalidation.
      }),
    );
    session.current = {};
    view.rerender(
      <MemoryRouter>
        <TopupModal isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    expect(screen.queryByText(/payment is still processing/i)).toBeNull();
  });

  it('ignores a prepared-quote discard that settles after an owner generation change', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('prepared')]);
    let settle!: (value: unknown) => void;
    client.cancelPaymentAction.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    const view = renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Discard quote' }));
    client.followPaymentRedirect.mockClear();
    session.current = { ...session.current, userId: 'user-b' };
    view.rerender(
      <MemoryRouter>
        <TopupModal isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    session.current = { ...session.current, userId: 'user-a' };
    client.getUnresolvedPaymentActions.mockReturnValue(
      new Promise(() => {
        // Intentionally unresolved to exercise generation invalidation.
      }),
    );
    view.rerender(
      <MemoryRouter>
        <TopupModal isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    settle(wireAction('canceled'));
    await waitFor(() => {
      expect(screen.queryByText(/payment status: canceled/i)).toBeNull();
    });
    expect(client.followPaymentRedirect).not.toHaveBeenCalled();
  });

  it('prepares a frozen quote before confirmation', async () => {
    client.prepareTopup.mockResolvedValue(wireAction('prepared'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /review us\$25/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /review us\$25/i }));
    expect(client.prepareTopup).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
      },
      expect.objectContaining({ amountMinor: '2500', method: 'saved_card' }),
    );
    expect(await screen.findByText('US$27.50')).toBeInTheDocument();
    expect(screen.getByText('2500')).toBeInTheDocument();
    expect(screen.getByText('US$25.00')).toBeInTheDocument();
    expect(screen.getByText('US$2.50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm quote' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard quote' })).toBeEnabled();
  });

  it('prepares a custom amount through the current owner binding', async () => {
    client.prepareTopup.mockResolvedValue(wireAction('prepared'));
    renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Other' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Custom amount' }), '31.25');
    await userEvent.click(screen.getByRole('button', { name: /review us\$31\.25/i }));
    expect(client.prepareTopup).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
      },
      expect.objectContaining({ amountMinor: '3125', method: 'saved_card' }),
    );
  });

  it('reopens the owned unresolved purchase', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('processing')]);
    renderModal();
    expect(await screen.findByText(/payment is still processing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review/i })).toBeNull();
  });

  it('resumes an owned Checkout only after the user clicks', async () => {
    const redirect = {
      ...wireAction('redirect_required'),
      redirectUrl: 'https://checkout.example/resume',
    };
    client.getUnresolvedPaymentActions.mockResolvedValue([redirect]);
    renderModal();
    const resume = await screen.findByRole('button', { name: 'Resume Checkout' });
    expect(client.followPaymentRedirect).not.toHaveBeenCalled();
    await userEvent.click(resume);
    expect(client.followPaymentRedirect).toHaveBeenCalledWith(redirect);
  });

  it('pins the established financial subject when confirming', async () => {
    const prepared = wireAction('prepared');
    client.getUnresolvedPaymentActions.mockResolvedValue([prepared]);
    client.confirmPaymentAction.mockResolvedValue(wireAction('processing'));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm quote' }));
    expect(client.confirmPaymentAction).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
        subjectId: 'account-a',
      },
      'topup_1',
    );
  });

  it('renders the frozen amount and charged receipt card', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([
      {
        ...wireAction('fulfilled'),
        receipt: {
          receiptId: 'receipt_1',
          grantedCreditAtoms: '25000000',
          revision: '2',
          chargedPaymentMethod: { brand: 'mastercard', last4: '4444' },
        },
      },
    ]);
    renderModal();
    expect(await screen.findByRole('heading', { name: 'Credits added' })).toBeInTheDocument();
    expect(screen.getByText(/mastercard.*4{4}/i)).toBeInTheDocument();
    expect(screen.getByText(/us\$27\.50 charged/i)).toBeInTheDocument();
  });
});
