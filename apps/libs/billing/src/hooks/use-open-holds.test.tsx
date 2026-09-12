// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- test wrapper targets the adjacent TSX provider.
import { BillingSessionProvider } from './billing-session.js';
import { useOpenHolds } from '#hooks/use-open-holds.js';

const holds = {
  environment: 'development',
  ownerId: 'user',
  holds: [
    {
      operationId: 'operation-a',
      model: { id: 'gpt-6-astra', displayName: 'Astra', providerId: 'openai' },
      heldCreditAtoms: '3084332',
      admittedAt: '2026-09-12T08:00:00.000000Z',
      dueAt: '2026-09-12T08:10:00.000000Z',
      releaseAfter: '2026-09-12T08:15:00.000000Z',
      dispatchState: 'accepted',
      customerState: 'pending',
    },
  ],
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

describe('useOpenHolds', () => {
  it('parses the owned open-hold fixture', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => holds }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useOpenHolds(), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual(holds);
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example/v1/billing/holds', {
      credentials: 'include',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it.each([
    { ...holds, ownerId: 'other' },
    { ...holds, environment: 'staging' },
    { ...holds, holds: [{ ...holds.holds[0], customerState: 'settled' }] },
    { ...holds, holds: [{ ...holds.holds[0], dispatchState: 'dispatched' }] },
    { ...holds, holds: [{ ...holds.holds[0], heldCreditAtoms: '-1' }] },
    { ...holds, holds: [{ ...holds.holds[0], dueAt: 'soon' }] },
  ])('rejects a foreign or malformed holds page', async (wire) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => wire }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useOpenHolds(), { wrapper });
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
    const { result } = renderHook(() => useOpenHolds(), { wrapper: signedOut });
    expect(result.current).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stays undefined rather than reporting nothing reserved', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useOpenHolds(), { wrapper });
    await waitFor(() => {
      expect(client.getQueryCache().getAll()[0]?.state.status).toBe('error');
    });
    expect(result.current).toBeUndefined();
  });
});
