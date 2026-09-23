import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactQuery from '@tanstack/react-query';
import { TopupModal } from '#components/billing/topup-modal.js';

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
const entitlements = vi.hoisted(() => ({
  current: { isResolved: true, paymentCollectionAvailable: true, paymentMethod: { brand: 'visa', last4: '4242' } },
}));
const invalidateQueries = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-payment-client.js', () => ({
  ...client,
  BillingPaymentConflict: PaymentConflict,
  BillingCollectionUnavailable: CollectionUnavailable,
  purchasesUnavailableMessage: 'Purchases are not available yet.',
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
vi.mock('#components/ui/sonner.js', () => ({
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
      expect(screen.getByRole('button', { name: /review purchase with saved card/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /review purchase with saved card/i }));
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

  it('links Terms to the public website so desktop never opens a removed route', async () => {
    renderModal();

    const terms = await screen.findByRole('link', { name: 'Terms' });
    expect(terms).toHaveAttribute('href', 'https://tau.new/legal/terms');
    expect(terms).toHaveAttribute('target', '_blank');
  });

  it('prepares a frozen quote before confirmation', async () => {
    client.prepareTopup.mockResolvedValue(wireAction('prepared'));
    renderModal();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /review purchase with saved card/i })).toBeEnabled();
    });
    await userEvent.click(screen.getByRole('button', { name: /review purchase with saved card/i }));
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
    await userEvent.click(screen.getByRole('button', { name: /review purchase with saved card/i }));
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

  it('polls a processing purchase until the worker settles it, then shows the receipt', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('processing')]);
      client.getPaymentAction.mockResolvedValue({
        ...wireAction('fulfilled'),
        receipt: { revision: '1', grantedCreditAtoms: '25000000', chargedPaymentMethod: null },
      });
      renderModal();
      expect(await screen.findByText(/payment is still processing/i)).toBeInTheDocument();
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

  it.each([
    ['unavailable', { isResolved: true, paymentCollectionAvailable: false }, true],
    ['unresolved', { isResolved: false, paymentCollectionAvailable: false }, false],
  ])('disables every purchase control while collection is %s', async (_label, state, showsNote) => {
    entitlements.current = { ...entitlements.current, ...state };
    renderModal();
    await waitFor(() => {
      expect(client.getUnresolvedPaymentActions).toHaveBeenCalled();
    });
    expect(screen.getByRole('button', { name: /review purchase with saved card/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /use another card in checkout/i })).toBeDisabled();
    expect(screen.queryByText('Purchases are not available yet.') !== null).toBe(showsNote);
  });

  it('reports a collection refusal without asking the customer to retry', async () => {
    const { toast } = await import('#components/ui/sonner.js');
    client.prepareTopup.mockRejectedValue(new CollectionUnavailable());
    renderModal();
    const review = screen.getByRole('button', { name: /review purchase with saved card/i });
    await waitFor(() => {
      expect(review).toBeEnabled();
    });
    await userEvent.click(review);
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith('Purchases are not available yet.');
    });
  });

  it('points to Checkout when there is no saved card with a billing address', async () => {
    const { toast } = await import('#components/ui/sonner.js');
    const refusal = Object.assign(new PaymentConflict(undefined), { code: 'customer_tax_location_invalid' });
    client.prepareTopup.mockRejectedValue(refusal);
    renderModal();
    const review = screen.getByRole('button', { name: /review purchase with saved card/i });
    await waitFor(() => {
      expect(review).toBeEnabled();
    });
    await userEvent.click(review);
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        'No saved card with a billing address yet. Use another card in Checkout.',
      );
    });
  });

  it('refreshes billing data once a saved-card purchase is fulfilled', async () => {
    client.getUnresolvedPaymentActions.mockResolvedValue([wireAction('prepared')]);
    client.confirmPaymentAction.mockResolvedValue(wireAction('fulfilled'));
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm quote' }));
    await waitFor(() => {
      expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['billing'] });
    });
  });
});
