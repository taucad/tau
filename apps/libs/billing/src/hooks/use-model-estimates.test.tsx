// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
// oxlint-disable-next-line no-restricted-imports -- test wrapper targets the adjacent TSX provider.
import { BillingSessionProvider } from './billing-session.js';
import { useModelEstimates } from '#hooks/use-model-estimates.js';

const estimates = {
  environment: 'development',
  ownerId: 'user',
  routes: [
    {
      routeId: 'openai-gpt-6-astra',
      modelId: 'gpt-6-astra',
      typicalHoldAtoms: '3084332',
      minimumHoldAtoms: '1133877',
      tier: 'base',
    },
    {
      routeId: 'openai-gpt-5.6-luna',
      modelId: 'gpt-5.6-luna',
      typicalHoldAtoms: '65947',
      minimumHoldAtoms: '26938',
      tier: 'base',
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

describe('useModelEstimates', () => {
  it('parses the owned estimate fixture', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => estimates }));
    const { wrapper } = setup();
    const { result } = renderHook(() => useModelEstimates(), { wrapper });
    await waitFor(() => {
      expect(result.current).toEqual(estimates);
    });
    expect(fetch).toHaveBeenCalledWith('https://api.example/v1/billing/model-estimates', {
      credentials: 'include',
      signal: expect.any(AbortSignal) as AbortSignal,
    });
  });

  it.each([
    { ...estimates, ownerId: 'other' },
    { ...estimates, environment: 'staging' },
    { ...estimates, routes: [{ ...estimates.routes[0], tier: 'medium' }] },
    { ...estimates, routes: [{ ...estimates.routes[0], typicalHoldAtoms: '-1' }] },
    /* A route with no floor must not reach the pre-flight, which refuses against it. */
    { ...estimates, routes: [{ ...estimates.routes[0], minimumHoldAtoms: undefined }] },
  ])('rejects a foreign or malformed estimate', async (wire) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => wire }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useModelEstimates(), { wrapper });
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
    const { result } = renderHook(() => useModelEstimates(), { wrapper: signedOut });
    expect(result.current).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('stays undefined rather than pretending a turn is unaffordable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { client, wrapper } = setup();
    const { result } = renderHook(() => useModelEstimates(), { wrapper });
    await waitFor(() => {
      expect(client.getQueryCache().getAll()[0]?.state.status).toBe('error');
    });
    expect(result.current).toBeUndefined();
  });
});
