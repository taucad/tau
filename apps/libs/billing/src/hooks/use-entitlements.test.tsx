// @vitest-environment jsdom

import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { entitlementsFromTier, serializeEntitlements } from '@taucad/billing';
// oxlint-disable-next-line no-restricted-imports -- test wrapper targets the adjacent TSX provider.
import { BillingSessionProvider } from './billing-session.js';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useEntitlements, useKernelTierRequirement } from '#hooks/use-entitlements.js';

const billingQueryClient = new QueryClient();
const queryWrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={billingQueryClient}>{children}</QueryClientProvider>
);

const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={billingQueryClient}>
    <BillingSessionProvider value={{ apiBaseUrl: 'https://api.example', userId: 'user' }}>
      {children}
    </BillingSessionProvider>
  </QueryClientProvider>
);

describe('useEntitlements', () => {
  beforeEach(() => {
    billingQueryClient.clear();
    billingQueryClient.setDefaultOptions({ queries: { retry: false } });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('returns free entitlements without fetching outside a provider', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useEntitlements(), { wrapper: queryWrapper });
    expect(result.current).toEqual({ ...entitlementsFromTier('free'), isResolved: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches and parses signed-in entitlements', async () => {
    const expected = { ...entitlementsFromTier('pro'), paymentCollectionAvailable: true };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => serializeEntitlements(expected) }));
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual({ ...expected, isResolved: true });
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example/v1/billing/entitlements', {
      credentials: 'include',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it('keeps an unresolved free fallback when the request fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503 });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useEntitlements(), { wrapper });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    expect(result.current).toEqual({ ...entitlementsFromTier('free'), isResolved: false });
  });
});

describe('useKernelTierRequirement', () => {
  it('projects the required tier and unlock state', () => {
    const { result } = renderHook(() => useKernelTierRequirement('zoo'), { wrapper: queryWrapper });
    expect(result.current).toEqual({ requiredTier: 'pro', isUnlocked: false, isPro: true });
  });
});
