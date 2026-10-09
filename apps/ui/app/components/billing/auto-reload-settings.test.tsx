import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoReloadSettings } from '#components/billing/auto-reload-settings.js';

const getReloadConsent = vi.hoisted(() => vi.fn());
const prepareReloadConsent = vi.hoisted(() => vi.fn());
const AddressRequired = vi.hoisted(() => class extends Error {});
vi.mock('#lib/billing-lifecycle-client.js', () => ({
  BillingAddressRequired: AddressRequired,
  getReloadConsent,
  prepareReloadConsent,
  revokeReloadConsent: vi.fn(),
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

describe('AutoReloadSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReloadConsent.mockResolvedValue(undefined);
    entitlements.current = { isResolved: true, paymentCollectionAvailable: true };
  });
  it('shows one load failure with a working retry and no contradictory off state', async () => {
    getReloadConsent.mockRejectedValueOnce(new Error('offline'));
    render(<AutoReloadSettings binding={binding} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.queryByText('Automatic reload is off.')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Review automatic reload' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Automatic reload is off.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('keeps Review disabled with the availability copy when collection is unavailable', async () => {
    entitlements.current = { isResolved: true, paymentCollectionAvailable: false };
    render(<AutoReloadSettings binding={binding} />);
    expect(await screen.findByRole('button', { name: 'Review automatic reload' })).toBeDisabled();
    expect(screen.getByText('Purchases are not available yet.')).toBeInTheDocument();
  });
  it('maps a collection refusal to the availability copy', async () => {
    prepareReloadConsent.mockRejectedValue(new CollectionUnavailable());
    render(<AutoReloadSettings binding={binding} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review automatic reload' }));
    expect(await screen.findByText('Purchases are not available yet.')).toBeInTheDocument();
    expect(screen.queryByText(/try again/i)).toBeNull();
  });
  it('names the reload cadence in singular or plural hours', async () => {
    getReloadConsent.mockResolvedValue(consentIn('enabled', 3600));
    const { unmount } = render(<AutoReloadSettings binding={binding} />);
    expect(await screen.findByText('1 hour')).toBeInTheDocument();
    unmount();
    getReloadConsent.mockResolvedValue(consentIn('enabled', 7200));
    render(<AutoReloadSettings binding={binding} />);
    expect(await screen.findByText('2 hours')).toBeInTheDocument();
  });

  it.each([
    ['disabled_failures', 'Off after failed payments'],
    ['paused_terms', 'Paused because the terms changed. Review the new terms to continue.'],
  ])('should offer a review of new terms directly when the consent is %s', async (state, status) => {
    getReloadConsent.mockResolvedValue(consentIn(state));
    prepareReloadConsent.mockResolvedValue({ state: 'prepared' });
    render(<AutoReloadSettings binding={binding} />);
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
    render(<AutoReloadSettings binding={binding} />);
    expect(await screen.findByRole('button', { name: 'Turn off automatic reload' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review automatic reload' })).toBeNull();
  });

  it('points a customer without a saved billing address to a Checkout purchase first', async () => {
    prepareReloadConsent.mockRejectedValue(new AddressRequired());
    render(<AutoReloadSettings binding={binding} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Review automatic reload' }));
    expect(
      await screen.findByText(
        'Add credits once through Checkout to save a card and billing address, then set up automatic reload.',
      ),
    ).toBeInTheDocument();
  });

  it('requires an explicit review action before preparing consent', async () => {
    prepareReloadConsent.mockResolvedValue({ state: 'prepared' });
    render(<AutoReloadSettings binding={binding} />);
    expect(prepareReloadConsent).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Review automatic reload' }));
    expect(prepareReloadConsent).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'user-a' }),
      expect.objectContaining({ requestId: 'request-a' }),
    );
  });
});
