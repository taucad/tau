// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { usePrivacyPreferences } from '#hooks/use-privacy-preferences.js';

let queryClient: QueryClient;
const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

const respond = (...bodies: unknown[]) => {
  const fetchMock = vi.fn<typeof fetch>();
  for (const body of bodies) {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body)));
  }
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe('usePrivacyPreferences', () => {
  it('should read allowsUsageMetrics from the API', async () => {
    respond({ allowsAiTraining: false, allowsUsageMetrics: false });

    const { result } = renderHook(() => usePrivacyPreferences(), { wrapper });

    await waitFor(() => {
      expect(result.current.preferences).toEqual({ allowsAiTraining: false, allowsUsageMetrics: false });
    });
  });

  it('should default allowsUsageMetrics to true when an older API omits it', async () => {
    respond({ allowsAiTraining: false });

    const { result } = renderHook(() => usePrivacyPreferences(), { wrapper });

    await waitFor(() => {
      expect(result.current.preferences).toEqual({ allowsAiTraining: false, allowsUsageMetrics: true });
    });
  });

  it('should patch allowsUsageMetrics and cache the returned preferences', async () => {
    const fetchMock = respond(
      { allowsAiTraining: true, allowsUsageMetrics: true },
      { allowsAiTraining: true, allowsUsageMetrics: false },
    );
    const { result } = renderHook(() => usePrivacyPreferences(), { wrapper });
    await waitFor(() => {
      expect(result.current.preferences?.allowsUsageMetrics).toBe(true);
    });

    act(() => {
      result.current.updatePreferences({ allowsUsageMetrics: false });
    });

    await waitFor(() => {
      expect(result.current.preferences?.allowsUsageMetrics).toBe(false);
    });
    expect(fetchMock).toHaveBeenLastCalledWith(
      'http://localhost:4000/v1/privacy',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ allowsUsageMetrics: false }) }),
    );
  });
});
