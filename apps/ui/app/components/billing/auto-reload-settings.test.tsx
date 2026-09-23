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
    const consent = (minimumCadenceSeconds: number) => ({
      state: 'enabled',
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
    getReloadConsent.mockResolvedValue(consent(3600));
    const { unmount } = render(<AutoReloadSettings binding={binding} />);
    expect(await screen.findByText('1 hour')).toBeInTheDocument();
    unmount();
    getReloadConsent.mockResolvedValue(consent(7200));
    render(<AutoReloadSettings binding={binding} />);
    expect(await screen.findByText('2 hours')).toBeInTheDocument();
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
