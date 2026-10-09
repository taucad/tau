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
  purchasesUnavailableMessage: 'Purchases are not available yet.',
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
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByText('Automatic reload is off.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review automatic reload' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Automatic reload is off.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps Review disabled with the availability copy when collection is unavailable', async () => {
    entitlements.current = { isResolved: true, paymentCollectionAvailable: false };
    renderSettings();
    expect(await screen.findByRole('button', { name: 'Review automatic reload' })).toBeDisabled();
    expect(screen.getByText('Purchases are not available yet.')).toBeInTheDocument();
  });
  it('maps a collection refusal to the availability copy', async () => {
    prepareReloadConsent.mockRejectedValue(new CollectionUnavailable());
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Review automatic reload' }));
    expect(await screen.findByText('Purchases are not available yet.')).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).toBeNull();
  });
  it('names the reload cadence in singular or plural hours', async () => {
    getReloadConsent.mockResolvedValue(consentIn('enabled', 3600));
    const { unmount } = renderSettings();
    expect(await screen.findByText('1 hour')).toBeInTheDocument();
    unmount();
    getReloadConsent.mockResolvedValue(consentIn('enabled', 7200));
    renderSettings();
    expect(await screen.findByText('2 hours')).toBeInTheDocument();
  });

  it.each([
    ['disabled_failures', 'Off after failed payments'],
    ['paused_terms', 'Paused because the terms changed. Review the new terms to continue.'],
  ])('should offer a review of new terms directly when the consent is %s', async (state, status) => {
    getReloadConsent.mockResolvedValue(consentIn(state));
    prepareReloadConsent.mockResolvedValue({ state: 'prepared' });
    renderSettings();
    expect(await screen.findByText(status)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn off automatic reload' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Review automatic reload' }));
    expect(prepareReloadConsent).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-a' }),
      expect.objectContaining({ requestId: 'request-a' }),
    );
  });

  it.each(['pending_setup', 'enabled'])('should not offer a review while the consent is %s', async (state) => {
    getReloadConsent.mockResolvedValue(consentIn(state));
    renderSettings();
    expect(await screen.findByRole('button', { name: 'Turn off automatic reload' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review automatic reload' })).toBeNull();
  });

  it.each([
    ['paused_terms', 'redirect_required', 'Continue setup'],
    ['paused_terms', 'prepared', 'Accept these limits'],
    ['disabled_failures', 'redirect_required', 'Continue setup'],
    ['disabled_failures', 'prepared', 'Accept these limits'],
  ])(
    'should not offer the old card setup of a %s consent that still reads %s beside its review',
    async (state, setupState, control) => {
      getReloadConsent.mockResolvedValue({
        ...consentIn(state),
        setupAction: { ...setupInCheckout, state: setupState },
      });
      renderSettings();
      expect(await screen.findByRole('button', { name: 'Review automatic reload' })).toBeEnabled();
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

    await userEvent.click(await screen.findByRole('button', { name: 'Review automatic reload' }));

    expect(await screen.findByRole('button', { name: 'Accept these limits' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue setup' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review automatic reload' })).toBeNull();
  });

  it('should share the consent with useAutoReloadEnabled and refresh when billing is invalidated', async () => {
    const queryClient = new QueryClient();
    getReloadConsent.mockResolvedValue({ ...consentIn('pending_setup'), setupAction: setupInCheckout });
    renderSettings(queryClient, { ...binding, subjectId: 'account-a' });
    expect(await screen.findByText('Waiting for card setup')).toBeInTheDocument();
    expect(queryClient.getQueryData(sharedConsentKey)).toMatchObject({ state: 'pending_setup' });

    getReloadConsent.mockResolvedValue(consentIn('enabled'));
    // What the payment return does once billing reports the setup completed.
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['billing'] });
    });

    expect(await screen.findByText('On')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continue setup' })).toBeNull();
  });

  it('should turn on in place once billing confirms a card setup it was waiting for', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getReloadConsent
        .mockResolvedValueOnce({ ...consentIn('pending_setup'), setupAction: setupInCheckout })
        .mockResolvedValue(consentIn('enabled'));
      renderSettings();
      expect(await screen.findByText('Waiting for card setup')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue setup' })).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(2000);

      expect(await screen.findByText('On')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Continue setup' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('should stop re-reading a card setup that stays unconfirmed after about a minute', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      getReloadConsent.mockResolvedValue({ ...consentIn('pending_setup'), setupAction: setupInCheckout });
      renderSettings();
      expect(await screen.findByText('Waiting for card setup')).toBeInTheDocument();
      expect(getReloadConsent).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(2000);
      expect(getReloadConsent).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(60_000);
      const reads = getReloadConsent.mock.calls.length;
      // Every 2 s for the first minute after the card opened.
      expect(reads).toBeGreaterThanOrEqual(30);
      await vi.advanceTimersByTimeAsync(20_000);

      expect(getReloadConsent).toHaveBeenCalledTimes(reads);
      expect(screen.getByRole('button', { name: 'Continue setup' })).toBeInTheDocument();
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

    await userEvent.click(await screen.findByRole('button', { name: 'Turn off automatic reload' }));

    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(revokeReloadConsent).toHaveBeenCalledWith(expect.objectContaining({ subjectId: 'account-a' }), 'consent-a');
    expect(screen.queryByRole('button', { name: 'Turn off automatic reload' })).toBeNull();
    expect(queryClient.getQueryData(sharedConsentKey)).toMatchObject({ state: 'revoked' });
  });

  it('points a customer without a saved billing address to a Checkout purchase first', async () => {
    prepareReloadConsent.mockRejectedValue(new AddressRequired());
    renderSettings();
    await userEvent.click(await screen.findByRole('button', { name: 'Review automatic reload' }));
    expect(
      await screen.findByText(
        'Add credits once through Checkout to save a card and billing address, then set up automatic reload.',
      ),
    ).toBeInTheDocument();
  });

  it('requires an explicit review action before preparing consent', async () => {
    prepareReloadConsent.mockResolvedValue({ state: 'prepared' });
    renderSettings();
    expect(prepareReloadConsent).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Review automatic reload' }));
    expect(prepareReloadConsent).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-a' }),
      expect.objectContaining({ requestId: 'request-a' }),
    );
  });
});
