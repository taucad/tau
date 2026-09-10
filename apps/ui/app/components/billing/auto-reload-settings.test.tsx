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
vi.mock('#lib/billing-payment-client.js', () => ({
  createPaymentRequestId: () => 'request-a',
  confirmPaymentAction: vi.fn(),
  followPaymentRedirect: vi.fn(),
  recoverPaymentAction: vi.fn(),
}));
vi.mock('#providers/financial-session-provider.js', () => ({
  useFinancialSession: () => ({
    capture: () => ({ generation: 1, signal: new AbortController().signal, isCurrent: () => true }),
  }),
}));
const binding = { apiBaseUrl: 'https://api.tau.new', environment: 'development', ownerId: 'user-a' } as const;

describe('AutoReloadSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getReloadConsent.mockResolvedValue(undefined);
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
