// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- test wrapper targets the adjacent TSX provider.
import { BillingSessionProvider } from './billing-session.js';
import { billingQueryClient } from '#hooks/query-client.js';
import { useCredits } from '#hooks/use-credits.js';

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId: 'user' }}>
    {children}
  </BillingSessionProvider>
);

const wireAccount = {
  balanceMicro: '10',
  grantBalanceMicro: '8',
  topupBalanceMicro: '2',
  reservedMicro: '0',
  monthlyGrantMicro: '8',
  rolloverCeilingMicro: '16',
  notifications: [],
  transactions: [
    {
      id: 'null-metadata',
      deltaMicro: '10',
      balanceAfterMicro: '10',
      reason: 'grant',
      category: null,
      modelId: null,
      note: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'metadata',
      deltaMicro: '-1',
      balanceAfterMicro: '9',
      reason: 'usage',
      category: 'chat',
      modelId: 'model',
      note: 'turn',
      createdAt: '2026-01-02T00:00:00.000Z',
    },
  ],
};

describe('useCredits', () => {
  beforeEach(() => {
    billingQueryClient.clear();
    billingQueryClient.setDefaultOptions({ queries: { retry: false } });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('stays undefined without a signed-in billing session', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCredits());
    expect(result.current).toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and parses the signed-in credit account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => wireAccount }));
    const { result } = renderHook(() => useCredits(), { wrapper });
    await waitFor(() => {
      expect(result.current?.balanceMicro).toBe(10n);
    });
    expect(result.current?.transactions).toEqual([
      expect.objectContaining({ id: 'null-metadata', category: undefined, modelId: undefined, note: undefined }),
      expect.objectContaining({ id: 'metadata', category: 'chat', modelId: 'model', note: 'turn' }),
    ]);
    expect(fetch).toHaveBeenCalledWith('https://api.example/v1/billing/credits', { credentials: 'include' });
  });

  it('stays undefined when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useCredits(), { wrapper });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(result.current).toBeUndefined();
  });
});
