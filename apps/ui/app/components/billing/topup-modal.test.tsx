import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactQuery from '@tanstack/react-query';
import { TopupModal } from '#components/billing/topup-modal.js';

const clientEnvironment = globalThis.window.ENV;
const client = vi.hoisted(() => ({
  prepareTopup: vi.fn(),
  confirmPaymentAction: vi.fn(),
  cancelPaymentAction: vi.fn(),
  recoverPaymentAction: vi.fn(),
  createPortalAction: vi.fn(),
  getUnresolvedPaymentActions: vi.fn(),
  getPaymentAction: vi.fn(),
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
const CollectionUnavailable = vi.hoisted(() => class extends Error {});
type TestEntitlements = {
  isResolved: boolean;
  paymentCollectionAvailable: boolean;
  paymentMethod?: { brand: string; last4: string };
};
const entitlements = vi.hoisted((): { current: TestEntitlements } => ({
  current: { isResolved: true, paymentCollectionAvailable: true, paymentMethod: { brand: 'visa', last4: '4242' } },
}));
const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  ...client,
  BillingPaymentConflict: PaymentConflict,
  BillingCollectionUnavailable: CollectionUnavailable,
  purchasesUnavailableMessage: 'You can’t buy credits yet. We’re still setting up payments.',
  createPaymentRequestId: () => 'request_1',
}));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({
  useEntitlements: () => entitlements.current,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQuery>()),
  useQueryClient: () => ({ invalidateQueries }),
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  useBillingSession: () => session.current,
}));
vi.mock('@taucad/ui/components/sonner', () => ({
  toast: Object.assign(vi.fn(), { warning: vi.fn() }),
}));

const compiledModal = await (async () => {
  const { transformSync } = await import('oxc-transform-react');
  const source = await readFile(new URL('topup-modal.tsx', pathToFileURL(import.meta.filename)), 'utf8');
  const compiled = transformSync('topup-modal.tsx', source, {
    lang: 'tsx',
    reactCompiler: { target: '19' },
  });
  if (compiled.fatal || compiled.errors.length > 0) {
    throw new Error(`React Compiler refused TopupModal: ${JSON.stringify(compiled.errors)}`);
  }
  const specifiers = [...compiled.code.matchAll(/^import {[^}]*} from "([^"]+)";$/gm)].map((match) => match[1]!);
  const modules = Object.fromEntries(
    await Promise.all(specifiers.map(async (specifier) => [specifier, await import(specifier)] as const)),
  );
  const linked = compiled.code
    .replaceAll(
      /^import {([^}]*)} from "([^"]+)";$/gm,
      (_match, names: string, specifier: string) =>
        `const { ${names.replaceAll(' as ', ': ')} } = __modules[${JSON.stringify(specifier)}];`,
    )
    .replaceAll(/^export /gm, '');
  // oxlint-disable-next-line no-new-func -- this pin executes the app's compiler output.
  const factory = new Function('__modules', `${linked}\nreturn { TopupModal };`) as (
    dependencies: Record<string, unknown>,
  ) => { TopupModal: typeof TopupModal };
  return { code: compiled.code, TopupModal: factory(modules).TopupModal };
})();

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
/** A request still in flight for the whole test. */
const neverSettles = async (): Promise<never> =>
  new Promise<never>(() => {
    // Left pending on purpose.
  });
const renderModal = (Modal: typeof TopupModal = TopupModal) =>
  render(
    <MemoryRouter>
      <Modal isOpen onOpenChange={vi.fn()} />
    </MemoryRouter>,
  );

describe('TopupModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getUnresolvedPaymentActions.mockResolvedValue([]);
    client.getPaymentAction.mockResolvedValue(wireAction('processing'));
    entitlements.current = {
      isResolved: true,
      paymentCollectionAvailable: true,
      paymentMethod: { brand: 'visa', last4: '4242' },
    };
    session.current = {
      apiBaseUrl: 'https://api.tau.new',
      environment: 'development',
      userId: 'user-a',
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.window.ENV = clientEnvironment;
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
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
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
      expect(screen.queryByRole('button', { name: 'Pay $27.50' })).toBeNull();
    });
    expect(client.followPaymentRedirect).not.toHaveBeenCalled();
  });

  it('hides an owned action immediately on logout while GET is pending', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('processing')]);
    const view = renderModal();
    expect(await screen.findByText(/processing payment/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/processing payment/i)).toBeNull();
  });

  it('preserves owner switching in the compiled component', async () => {
    expect(compiledModal.code).toContain('from "react/compiler-runtime"');
    const view = renderModal(compiledModal.TopupModal);
    await waitFor(() => {
      expect(client.getUnresolvedPaymentActions).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'user-a' }),
        'manual_topup',
      );
    });
    client.getUnresolvedPaymentActions.mockClear();
    session.current = { ...session.current, userId: 'user-b' };
    view.rerender(
      <MemoryRouter>
        <compiledModal.TopupModal isOpen onOpenChange={vi.fn()} />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(client.getUnresolvedPaymentActions).toHaveBeenCalledWith(
        expect.objectContaining({ ownerId: 'user-b' }),
        'manual_topup',
      );
    });
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
    await userEvent.click(await screen.findByRole('button', { name: 'Back' }));
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

  it('should link Terms to the public website from a build that runs none', async () => {
    renderModal();

    const terms = await screen.findByRole('link', { name: 'Terms' });
    expect(terms).toHaveAttribute('href', 'https://tau.new/legal/terms');
    expect(terms).toHaveAttribute('target', '_blank');
  });

  it('should link Terms to the website of the deployment the app is bound to', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    globalThis.window.ENV = {
      ...clientEnvironment,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- `window.ENV`'s keys are the deployment's own environment variable names.
      TAU_FRONTEND_URL: 'https://taucad.dev',
    };

    renderModal();

    const terms = await screen.findByRole('link', { name: 'Terms' });
    expect(terms).toHaveAttribute('href', 'https://taucad.dev/legal/terms');
  });

  it('prepares a frozen quote before confirmation', async () => {
    client.prepareTopup.mockResolvedValue(wireAction('prepared'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(client.prepareTopup).toHaveBeenCalledWith(
      {
        apiBaseUrl: 'https://api.tau.new',
        environment: 'development',
        ownerId: 'user-a',
      },
      expect.objectContaining({ amountMinor: '2500', method: 'saved_card' }),
    );
    expect(await screen.findByText('$27.50 USD')).toBeInTheDocument();
    expect(screen.getByText('2,500 credits')).toBeInTheDocument();
    expect(screen.getByText('$25.00')).toBeInTheDocument();
    expect(screen.getByText('$2.50')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay $27.50' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Back' })).toBeEnabled();
  });

  it('prepares a custom amount through the current owner binding', async () => {
    client.prepareTopup.mockResolvedValue(wireAction('prepared'));
    renderModal();
    await userEvent.click(screen.getByRole('button', { name: 'Other' }));
    await userEvent.type(screen.getByRole('spinbutton', { name: 'Amount (USD)' }), '31.25');
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
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
    expect(await screen.findByText(/processing payment/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /review/i })).toBeNull();
  });

  it('polls a processing purchase until the worker settles it, then shows the receipt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('processing')]);
      client.getPaymentAction.mockResolvedValue({
        ...wireAction('fulfilled'),
        receipt: { revision: '1', grantedCreditAtoms: '25000000', chargedPaymentMethod: null },
      });
      renderModal();
      expect(await screen.findByText(/processing payment/i)).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(2000);
      expect(await screen.findByText('Credits added')).toBeInTheDocument();
      expect(client.getPaymentAction).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 'account-a' }),
        'topup_1',
      );
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['billing'] });
      await vi.advanceTimersByTimeAsync(4000);
      expect(client.getPaymentAction).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels an owned Checkout from the modal without following its redirect', async () => {
    const redirect = { ...wireAction('redirect_required'), redirectUrl: 'https://checkout.example/resume' };
    client.getUnresolvedPaymentActions.mockResolvedValue([redirect]);
    client.cancelPaymentAction.mockResolvedValue(wireAction('canceled'));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel purchase' }));
    expect(client.cancelPaymentAction).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'user-a' }), 'topup_1');
    expect(client.followPaymentRedirect).not.toHaveBeenCalled();
  });

  it('shows where a payment stands when the server refuses to cancel its closed Checkout', async () => {
    const { toast } = await import('@taucad/ui/components/sonner');
    const redirect = { ...wireAction('redirect_required'), redirectUrl: 'https://checkout.example/resume' };
    client.getUnresolvedPaymentActions.mockResolvedValue([redirect]);
    client.cancelPaymentAction.mockRejectedValue(
      Object.assign(new PaymentConflict(undefined), { code: 'action_not_cancelable' }),
    );
    client.getPaymentAction.mockResolvedValue({
      ...wireAction('fulfilled'),
      receipt: { revision: '1', grantedCreditAtoms: '25000000', chargedPaymentMethod: null },
    });
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel purchase' }));
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('This payment can’t be canceled anymore.');
    });
    expect(await screen.findByText('Credits added')).toBeInTheDocument();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['billing'] });
    expect(client.followPaymentRedirect).not.toHaveBeenCalled();
  });

  it('should show an automatic reload purchase that refused a top-up without quote controls', async () => {
    client.prepareTopup.mockRejectedValue(
      new PaymentConflict({ ...wireAction('prepared'), purpose: 'automatic_topup' }),
    );
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('heading', { name: 'Auto-reload in progress' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Auto-reload is buying these credits now. You don’t need to do anything.',
    );
    expect(screen.queryByRole('button', { name: 'Pay $27.50' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    // The dialog's own bootstrap reads only manual top-ups; a reload surfaces through the refusal it causes.
    expect(client.getUnresolvedPaymentActions).not.toHaveBeenCalledWith(expect.anything(), 'automatic_topup');
  });

  it('resumes an owned Checkout only after the user clicks', async () => {
    const redirect = {
      ...wireAction('redirect_required'),
      redirectUrl: 'https://checkout.example/resume',
    };
    client.getUnresolvedPaymentActions.mockResolvedValue([redirect]);
    renderModal();
    const resume = await screen.findByRole('button', { name: 'Continue to payment' });
    expect(client.followPaymentRedirect).not.toHaveBeenCalled();
    await userEvent.click(resume);
    expect(client.followPaymentRedirect).toHaveBeenCalledWith(redirect);
  });

  it('pins the established financial subject when confirming', async () => {
    const prepared = wireAction('prepared');
    client.getUnresolvedPaymentActions.mockResolvedValue([prepared]);
    client.confirmPaymentAction.mockResolvedValue(wireAction('processing'));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Pay $27.50' }));
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
    expect(screen.getByText('Total paid')).toBeInTheDocument();
    expect(screen.getByText('$27.50 USD')).toBeInTheDocument();
    expect(screen.getByText('Paid with')).toBeInTheDocument();
    expect(screen.queryByText('Total due')).toBeNull();
  });

  it.each([
    ['unavailable', { isResolved: true, paymentCollectionAvailable: false }, true],
    ['unresolved', { isResolved: false, paymentCollectionAvailable: false }, false],
  ])('disables every purchase control while collection is %s', async (_label, state, showsNote) => {
    entitlements.current = { ...entitlements.current, ...state };
    renderModal();
    await waitFor(() => {
      expect(client.getUnresolvedPaymentActions).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use a different card' })).toBeDisabled();
    expect(screen.queryByText('You can’t buy credits yet. We’re still setting up payments.') !== null).toBe(showsNote);
  });

  it('reports a collection refusal without asking the customer to retry', async () => {
    const { toast } = await import('@taucad/ui/components/sonner');
    client.prepareTopup.mockRejectedValue(new CollectionUnavailable());
    renderModal();
    const review = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => {
      expect(review).toBeEnabled();
    });
    await userEvent.click(review);
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('You can’t buy credits yet. We’re still setting up payments.');
    });
  });

  it('points to Checkout when there is no saved card with a billing address', async () => {
    const { toast } = await import('@taucad/ui/components/sonner');
    const refusal = Object.assign(new PaymentConflict(undefined), { code: 'customer_tax_location_invalid' });
    client.prepareTopup.mockRejectedValue(refusal);
    renderModal();
    const review = screen.getByRole('button', { name: 'Continue' });
    await waitFor(() => {
      expect(review).toBeEnabled();
    });
    await userEvent.click(review);
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'Your saved card needs a billing address. Choose "Use a different card" to add one.',
      );
    });
  });

  it('refreshes billing data once a saved-card purchase is fulfilled', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('prepared')]);
    client.confirmPaymentAction.mockResolvedValue(wireAction('fulfilled'));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Pay $27.50' }));
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['billing'] });
    });
  });

  it('describes the purchase in two plain sentences and links the refund policy from the footer', async () => {
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Add credits' });
    expect(dialog).toHaveAccessibleDescription(
      'Credits pay for AI and cloud kernel usage. They’re added right away and never expire.',
    );
    expect(dialog).not.toHaveTextContent(/refunded within 14 days|top up|US\$/iu);
    const footer = dialog.querySelector('[data-slot=legal-line]');
    expect(footer).toHaveTextContent('By continuing, you agree to Tau’s Terms and Refund policy.');
    expect(screen.getByRole('link', { name: 'Terms' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/legal\/terms$/u),
    );
    expect(screen.getByRole('link', { name: 'Refund policy' })).toHaveAttribute(
      'href',
      expect.stringMatching(/\/legal\/terms#refunds$/u),
    );
  });

  it('says how many credits the chosen amount adds and shows the saved card as a row', async () => {
    renderModal();
    expect(await screen.findByText('$25 adds 2,500 credits. Tax is added on the next step.')).toBeInTheDocument();
    expect(screen.getByText('Visa •••• 4242')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '$100' }));
    expect(screen.getByText('$100 adds 10,000 credits. Tax is added on the next step.')).toBeInTheDocument();
  });

  it('offers one button to the payment page when there is no saved card', async () => {
    entitlements.current = { isResolved: true, paymentCollectionAvailable: true };
    renderModal();
    const proceed = await screen.findByRole('button', { name: 'Continue to payment' });
    expect(
      screen.getByText('$25 adds 2,500 credits. You’ll enter your card on Stripe’s payment page, where tax is added.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use a different card' })).toBeNull();
    await waitFor(() => {
      expect(proceed).toBeEnabled();
    });
    await userEvent.click(proceed);
    expect(client.prepareTopup).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ amountMinor: '2500', method: 'checkout' }),
    );
  });

  it('labels the custom amount, states the allowed range and explains an amount outside it', async () => {
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Other' }));
    const field = screen.getByRole('spinbutton', { name: 'Amount (USD)' });
    expect(field).toHaveAccessibleDescription('Enter $5 to $5,000.');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();

    await userEvent.type(field, '2');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter an amount from $5 to $5,000.');
    expect(field).toBeInvalid();

    await userEvent.clear(field);
    await userEvent.type(field, '40');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(field).toHaveAccessibleDescription('$40 adds 4,000 credits. Enter $5 to $5,000.');
  });

  it('lets the dialog close while it checks for an unfinished payment', async () => {
    client.getUnresolvedPaymentActions.mockReturnValue(neverSettles());
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <TopupModal isOpen onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('button', { name: 'Continue' })).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  const processingDescription =
    'This usually takes a few seconds. You can close this window and your credits will still be added.';
  it.each([
    { state: 'processing', attention: null, title: 'Processing payment', description: processingDescription },
    { state: 'creating', attention: null, title: 'Processing payment', description: processingDescription },
    {
      state: 'funds_received',
      attention: null,
      title: 'Payment received',
      description: 'We’re adding 2,500 credits to your balance. This can take a moment.',
    },
    {
      state: 'attention_required',
      attention: { reason: 'operator_review', action: 'contact_support' },
      title: 'We’re reviewing this payment',
      description: 'You don’t need to do anything. If you have questions, email support@tau.new.',
    },
    {
      state: 'attention_required',
      attention: { reason: 'outcome_unknown', action: 'wait' },
      title: 'Waiting to hear from your bank',
      description:
        'We don’t know yet whether this payment went through. Please don’t pay again. Check back in a few minutes.',
    },
  ])('gives the waiting state $state ($title) a plain description and a Close button', async (row) => {
    const { state, attention, title, description } = row;
    client.getUnresolvedPaymentActions.mockResolvedValue([{ ...wireAction(state), attention }]);
    client.getPaymentAction.mockResolvedValue({ ...wireAction(state), attention });
    const onOpenChange = vi.fn();
    render(
      <MemoryRouter>
        <TopupModal isOpen onOpenChange={onOpenChange} />
      </MemoryRouter>,
    );
    const dialog = await screen.findByRole('dialog', { name: title });
    expect(dialog).toHaveAccessibleDescription(description);
    expect(dialog).not.toHaveTextContent(/payment status:/iu);
    // No payment is being asked for here, so the legal line is not shown.
    expect(dialog.querySelector('[data-slot=legal-line]')).toBeNull();
    const [, closeButton] = screen.getAllByRole('button', { name: 'Close' });
    await userEvent.click(closeButton!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('asks for the bank confirmation in the customer’s words and continues on the payment page', async () => {
    const paused = {
      ...wireAction('attention_required'),
      attention: { reason: 'authentication_required', action: 'continue_hosted' },
    };
    client.getUnresolvedPaymentActions.mockResolvedValue([paused]);
    client.recoverPaymentAction.mockResolvedValue(paused);
    renderModal();
    expect(await screen.findByRole('dialog', { name: 'Confirm with your bank' })).toHaveAccessibleDescription(
      'Your bank wants you to confirm this payment. You can also pay with a different card. You’ll only be charged once.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
    expect(client.recoverPaymentAction).toHaveBeenCalledWith(expect.anything(), 'topup_1');
  });

  it('reviews the purchase with a Pay button that states the charge and a Back that cancels it', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('prepared')]);
    client.cancelPaymentAction.mockResolvedValue(wireAction('canceled'));
    renderModal();
    const dialog = await screen.findByRole('dialog', { name: 'Review your purchase' });
    expect(dialog).toHaveAccessibleDescription('You’re adding 2,500 credits to your balance.');
    expect(screen.getByText('Total')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pay $27.50' })).toBeEnabled();
    expect(dialog.querySelector('[data-slot=legal-line]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(client.cancelPaymentAction).toHaveBeenCalledWith(expect.anything(), 'topup_1');
    expect(await screen.findByRole('dialog', { name: 'Add credits' })).toBeInTheDocument();
  });

  it.each([
    {
      state: 'failed',
      title: 'Payment failed',
      description: 'Your card wasn’t charged. Try again, or use a different card.',
      label: 'Try again',
    },
    { state: 'canceled', title: 'Purchase canceled', description: 'You weren’t charged.', label: 'Add credits' },
  ])('ends a $state purchase with what happened and a button back to the amounts', async (row) => {
    const { state, title, description, label } = row;
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction(state)]);
    renderModal();
    expect(await screen.findByRole('dialog', { name: title })).toHaveAccessibleDescription(description);
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(await screen.findByRole('group', { name: 'Amount' })).toBeInTheDocument();
  });

  it('does not leave a completed action without a way out', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('completed')]);
    renderModal();
    expect(await screen.findByRole('dialog', { name: 'Payment complete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();
  });
});
