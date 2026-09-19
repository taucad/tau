import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoReloadSettings } from '#components/billing/auto-reload-settings.js';

const getReloadConsent = vi.hoisted(() => vi.fn());
const prepareReloadConsent = vi.hoisted(() => vi.fn());
vi.mock('#lib/billing-lifecycle-client.js', () => ({
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
