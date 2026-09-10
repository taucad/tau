// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- test wrapper targets the adjacent TSX provider.
import { BillingSessionProvider } from './billing-session.js';
import { useCredits } from '#hooks/use-credits.js';

const balance = {
  schemaVersion: 1,
  environment: 'development',
  subjectId: 'account',
  revision: '4',
  asOf: '2026-09-05T00:00:00.000Z',
  promoGrantCreditAtoms: '0',
  planGrantCreditAtoms: '0',
  purchasedCreditAtoms: '25000000',
  debtCreditAtoms: '0',
  promoHeldCreditAtoms: '0',
  planHeldCreditAtoms: '0',
  purchasedHeldCreditAtoms: '0',
  pendingIssuanceCreditAtoms: '0',
  eligibleAvailableCreditAtoms: '25000000',
  netBalanceCreditAtoms: '25000000',
};
const explanation = {
  schemaVersion: 1,
  environment: 'development',
  ownerId: 'user',
  subjectId: 'account',
  snapshotRevision: '4',
  asOf: balance.asOf,
  availability: { state: 'available', reason: null },
  balance,
  journalTotals: { accountDeltaCreditAtoms: '0', byKind: [] },
  history: { items: [], nextCursor: null, complete: true },
};

function setup(userId: string | undefined = 'user') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId, environment: 'development' }}>
        {children}
      </BillingSessionProvider>
    </QueryClientProvider>
  );
  return { client, wrapper };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useCredits', () => {
  it('reads the owned authoritative balance at or after the receipt revision', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => explanation }));
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useCredits({ environment: 'development', subjectId: 'account', revision: '4' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current).toEqual(explanation);
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example/v1/billing/credits?minRevision=4', {
      credentials: 'include',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it.each([
    { ...explanation, ownerId: 'other' },
    { ...explanation, environment: 'staging', balance: { ...balance, environment: 'staging' } },
    { ...explanation, subjectId: 'other', balance: { ...balance, subjectId: 'other' } },
    { ...explanation, snapshotRevision: '3', balance: { ...balance, revision: '3' } },
  ])('rejects a foreign or stale receipt balance', async (wire) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => wire }));
    const { client, wrapper } = setup();
    const { result } = renderHook(
      () => useCredits({ environment: 'development', subjectId: 'account', revision: '4' }),
      { wrapper },
    );
    await waitFor(() => {
      expect(client.getQueryCache().getAll()[0]?.state.status).toBe('error');
    });
    expect(result.current).toBeUndefined();
  });

  it('does not fetch while signed out', () => {
    vi.stubGlobal('fetch', vi.fn());
    const signedOut = ({ children }: { readonly children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCredits(), { wrapper: signedOut });
    expect(result.current).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps failed reads unavailable rather than inventing a zero balance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useCredits(), { wrapper });
    await waitFor(() => {
      expect(client.getQueryCache().getAll()[0]?.state.status).toBe('error');
    });
    expect(result.current).toBeUndefined();
  });
});
