import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoReloadSettings } from '#components/billing/auto-reload-settings.js';
import type { PaymentActionBinding } from '#lib/billing-payment-client.js';

const getReloadConsent = vi.hoisted(() => vi.fn());
const prepareReloadConsent = vi.hoisted(() => vi.fn());
const revokeReloadConsent = vi.hoisted(() => vi.fn());
const AddressRequired = vi.hoisted(() => class extends Error {});
vi.mock('#lib/billing-lifecycle-client.js', () => ({
  BillingAddressRequired: AddressRequired,
  getReloadConsent,
  prepareReloadConsent,
  revokeReloadConsent,
}));
const CollectionUnavailable = vi.hoisted(() => class extends Error {});
const entitlements = vi.hoisted(() => ({ current: { isResolved: true, paymentCollectionAvailable: true } }));
vi.mock('@taucad/billing/hooks/use-entitlements', () => ({ useEntitlements: () => entitlements.current }));
vi.mock('#lib/billing-payment-client.js', () => ({
  BillingCollectionUnavailable: CollectionUnavailable,
  purchasesUnavailableMessage: 'You can’t buy credits yet. We’re still setting up payments.',
  createPaymentRequestId: () => 'request-a',
  confirmPaymentAction: vi.fn(),
  followPaymentRedirect: vi.fn(),
  recoverPaymentAction: vi.fn(),
}));
const financial = vi.hoisted(() => ({
  capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
}));
vi.mock('#providers/financial-session-provider.js', () => ({ useFinancialSession: () => financial }));
const binding = { apiBaseUrl: 'https://api.tau.new', environment: 'development', ownerId: 'user-a' } as const;
const consentIn = (state: string, minimumCadenceSeconds = 3600) => ({
  consentId: 'consent-a',
  subjectId: 'account-a',
  state,
  setupAction: null,
  paymentMethod: null,
  terms: {
    principalMinor: '2500',
    quotedTaxMinor: '0',
    grossCeilingMinor: '2500',
    monthlyGrossCapMinor: '10000',
    thresholdAtoms: '1000000',
    minimumCadenceSeconds,
    terminalFailureLimit: 2,
  },
});
/** A card setup Checkout the customer opened, which billing has yet to confirm. */
const setupInCheckout = {
  actionId: 'consent-a',
  subjectId: 'account-a',
  purpose: 'reload_setup',
  state: 'redirect_required',
  redirectUrl: 'https://checkout.stripe.com/c/pay/cs_test_setup',
};
/** The cache entry `useAutoReloadEnabled` reads for this owner and account. */
const sharedConsentKey = ['billing', 'reload-consent', 'https://api.tau.new', 'development', 'user-a', 'account-a'];
/** Renders the card under a fresh query client; the app provides its root one. */
const renderSettings = (queryClient = new QueryClient(), settingsBinding: PaymentActionBinding = binding) =>
  render(
    <QueryClientProvider client={queryClient}>
      <AutoReloadSettings binding={settingsBinding} />
    </QueryClientProvider>,
  );

describe('AutoReloadSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReloadConsent.mockResolvedValue(undefined);
    entitlements.current = { isResolved: true, paymentCollectionAvailable: true };
  });
  it('shows one load failure with a working retry and no contradictory off state', async () => {
    getReloadConsent.mockRejectedValueOnce(new Error('offline'));
    renderSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load auto-reloadYour setting hasn’t changed.');
    expect(screen.queryByText('Auto-reload is off')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set up' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Auto-reload is off')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps Review disabled with the availability copy when collection is unavailable', async () => {
    entitlements.current = { isResolved: true, paymentCollectionAvailable: false };
    renderSettings();
    expect(await screen.findByRole('button', { name: 'Set up' })).toBeDisabled();
    expect(screen.getByText('You can’t buy credits yet. We’re still setting up payments.')).toBeInTheDocument();
  });
  it('maps a collection refusal to the availability copy', async () => {
    prepareReloadConsent.mockRejectedValue(new CollectionUnavailable());
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    expect(await screen.findByText('You can’t buy credits yet. We’re still setting up payments.')).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).toBeNull();
  });
  it('names the reload cadence in singular or plural hours', async () => {
    getReloadConsent.mockResolvedValue(consentIn('enabled', 3600));
    const { unmount } = renderSettings();
    expect(await screen.findByText(/and one reload per hour\.$/u)).toBeInTheDocument();
    unmount();
    getReloadConsent.mockResolvedValue(consentIn('enabled', 7200));
    renderSettings();
    expect(await screen.findByText(/and one reload every 2 hours\.$/u)).toBeInTheDocument();
  });

  it.each([
    {
      state: 'disabled_failures',
      status: 'We turned auto-reload off after 2 failed payments. Check your card, then turn it back on.',
      badge: 'Off',
      review: 'Turn on',
    },
    {
      state: 'paused_terms',
      status: 'We’ve updated the auto-reload terms. Review and accept them to turn auto-reload back on.',
      badge: 'Paused',
      review: 'Review new terms',
    },
  ])('should offer a review of new terms directly when the consent is $state', async (row) => {
    const { state, status, badge, review } = row;
    getReloadConsent.mockResolvedValue(consentIn(state));
    prepareReloadConsent.mockResolvedValue({ state: 'prepared' });
    renderSettings();
    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(screen.getByText(badge)).toHaveAttribute('data-tone', 'warning');
    // Auto-reload that failed payments already turned off has nothing left to turn off.
    expect(screen.queryByRole('button', { name: 'Turn off' }) !== null).toBe(state === 'paused_terms');
    await userEvent.click(screen.getByRole('button', { name: review }));
    expect(prepareReloadConsent).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-a' }),
      expect.objectContaining({ requestId: 'request-a' }),
    );
  });

  it.each([
    ['pending_setup', 'Cancel setup'],
    ['enabled', 'Turn off'],
  ])('should not offer a review while the consent is %s', async (state, off) => {
    getReloadConsent.mockResolvedValue(consentIn(state));
    renderSettings();
    expect(await screen.findByRole('button', { name: off })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(Set up|Turn on|Review new terms)$/u })).toBeNull();
  });

  it('should say what auto-reload does in one sentence with the card named properly and the limits on one line', async () => {
    getReloadConsent.mockResolvedValue({ ...consentIn('enabled'), paymentMethod: { brand: 'visa', last4: '8252' } });
    renderSettings();
    expect(
      await screen.findByText('When your balance drops below 100 credits, we charge Visa •••• 8252 $25.00 plus tax.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Limits: up to $25.00 per charge including tax, $100.00 per month, and one reload per hour.'),
    ).toBeInTheDocument();
    expect(screen.getByText('On')).toHaveAttribute('data-tone', 'positive');
    expect(screen.queryByText(/visa •••• 8252|US\$|Quoted tax|Failure limit/u)).toBeNull();
  });

  it('should show a layout-matching skeleton while the consent loads', () => {
    getReloadConsent.mockReturnValue(
      new Promise<never>(() => {
        // Left pending on purpose.
      }),
    );
    renderSettings();
    const loading = screen.getByRole('status');
    expect(loading).toHaveTextContent('Loading auto-reload…');
    expect(loading.querySelectorAll('[data-slot=skeleton]')).toHaveLength(2);
  });

  it('should state the terms in the customer’s words before turning on, and cancel instead of turning off', async () => {
    const limits = { ...setupInCheckout, state: 'prepared', redirectUrl: null };
    getReloadConsent.mockResolvedValue({ ...consentIn('pending_setup'), setupAction: limits });
    revokeReloadConsent.mockResolvedValue(consentIn('revoked'));
    renderSettings();
    expect(await screen.findByText('Turn on auto-reload?')).toBeInTheDocument();
    const list = screen.getByLabelText('Auto-reload limits');
    expect(list).toHaveTextContent('Each reload$25.00 plus tax');
    expect(list).toHaveTextContent('Most we charge at once$25.00');
    expect(list).toHaveTextContent('Most we charge per month$100.00');
    expect(list).toHaveTextContent('Time between reloadsAt least 1 hour');
    expect(list).toHaveTextContent('Turns off after2 failed payments');
    expect(
      screen.getByText(
        'By turning this on, you authorize Tau to charge your saved card $25.00 plus tax each time your balance drops below 100 credits, within these limits, until you turn auto-reload off.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(revokeReloadConsent).toHaveBeenCalledOnce();
    expect(await screen.findByRole('button', { name: 'Turn on' })).toBeInTheDocument();
  });

  it.each([
    ['paused_terms', 'redirect_required', 'Continue to payment'],
    ['paused_terms', 'prepared', 'Agree and turn on'],
    ['disabled_failures', 'redirect_required', 'Continue to payment'],
    ['disabled_failures', 'prepared', 'Agree and turn on'],
  ])(
    'should not offer the old card setup of a %s consent that still reads %s beside its review',
    async (state, setupState, control) => {
      getReloadConsent.mockResolvedValue({
        ...consentIn(state),
        setupAction: { ...setupInCheckout, state: setupState },
      });
      renderSettings();
      expect(
        await screen.findByRole('button', { name: state === 'paused_terms' ? 'Review new terms' : 'Turn on' }),
      ).toBeEnabled();
      expect(screen.queryByRole('button', { name: control })).toBeNull();
    },
  );

  it('should offer the limits of a new review in place of the old card setup', async () => {
    const newLimits = { ...setupInCheckout, state: 'prepared', redirectUrl: null };
    getReloadConsent
      .mockResolvedValueOnce({ ...consentIn('paused_terms'), setupAction: setupInCheckout })
      .mockResolvedValue({ ...consentIn('pending_setup'), setupAction: newLimits });
    prepareReloadConsent.mockResolvedValue(newLimits);
    renderSettings();

    await userEvent.click(await screen.findByRole('button', { name: 'Review new terms' }));

    expect(await screen.findByRole('button', { name: 'Agree and turn on' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review new terms' })).toBeNull();
  });

  it('should share the consent with useAutoReloadEnabled and refresh when billing is invalidated', async () => {
    const queryClient = new QueryClient();
    getReloadConsent.mockResolvedValue({ ...consentIn('pending_setup'), setupAction: setupInCheckout });
    renderSettings(queryClient, { ...binding, subjectId: 'account-a' });
    expect(await screen.findByText('Finish setting up auto-reload')).toBeInTheDocument();
    expect(queryClient.getQueryData(sharedConsentKey)).toMatchObject({ state: 'pending_setup' });

    getReloadConsent.mockResolvedValue(consentIn('enabled'));
    // What the payment return does once billing reports the setup completed.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['billing'] });
    });

    expect(await screen.findByText('On')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
  });

  it('should turn on in place once billing confirms a card setup it was waiting for', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getReloadConsent
        .mockResolvedValueOnce({ ...consentIn('pending_setup'), setupAction: setupInCheckout })
        .mockResolvedValue(consentIn('enabled'));
      renderSettings();
      expect(await screen.findByText('Finish setting up auto-reload')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(2000);

      expect(await screen.findByText('On')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should stop re-reading a card setup that stays unconfirmed after about a minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getReloadConsent.mockResolvedValue({ ...consentIn('pending_setup'), setupAction: setupInCheckout });
      renderSettings();
      expect(await screen.findByText('Finish setting up auto-reload')).toBeInTheDocument();
      expect(getReloadConsent).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(2000);
      expect(getReloadConsent).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_000);
      const reads = getReloadConsent.mock.calls.length;
      // Every 2 s for the first minute after the card opened.
      expect(reads).toBeGreaterThanOrEqual(30);
      await vi.advanceTimersByTimeAsync(20_000);

      expect(getReloadConsent).toHaveBeenCalledTimes(reads);
      expect(screen.getByRole('button', { name: 'Continue to payment' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should not re-read a consent that is not waiting for its card setup', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getReloadConsent.mockResolvedValue(consentIn('enabled'));
      renderSettings();
      expect(await screen.findByText('On')).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(10_000);

      expect(getReloadConsent).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should show automatic reload as off as soon as it is turned off', async () => {
    const queryClient = new QueryClient();
    getReloadConsent.mockResolvedValue(consentIn('enabled'));
    revokeReloadConsent.mockResolvedValue(consentIn('revoked'));
    renderSettings(queryClient, { ...binding, subjectId: 'account-a' });

    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }));

    expect(await screen.findByText('Auto-reload is off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeEnabled();
    expect(revokeReloadConsent).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'account-a' }), 'consent-a');
    expect(screen.queryByRole('button', { name: 'Turn off' })).toBeNull();
    expect(queryClient.getQueryData(sharedConsentKey)).toMatchObject({ state: 'revoked' });
  });

  it('points a customer without a saved billing address to a Checkout purchase first', async () => {
    prepareReloadConsent.mockRejectedValue(new AddressRequired());
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    expect(
      await screen.findByText(
        'Auto-reload needs a saved card. Add credits once to save your card, then come back here.',
      ),
    ).toBeInTheDocument();
  });

  it('requires an explicit review action before preparing consent', async () => {
    prepareReloadConsent.mockResolvedValue({ state: 'prepared' });
    renderSettings();
    expect(prepareReloadConsent).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    expect(prepareReloadConsent).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-a' }),
      expect.objectContaining({ requestId: 'request-a' }),
    );
  });
});
