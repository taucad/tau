import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FinancialSessionProvider,
  FinancialSessionScope,
  useFinancialSession,
} from '#providers/financial-session-provider.js';

const purgeSavedUsage = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('#db/billing-snapshot-store.js', () => ({ purgeSavedUsage }));

beforeEach(() => {
  purgeSavedUsage.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const wrap =
  (queryClient: QueryClient) =>
  ({ children }: { readonly children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <FinancialSessionProvider>{children}</FinancialSessionProvider>
    </QueryClientProvider>
  );

describe('FinancialSessionProvider', () => {
  it('aborts the old generation and removes only financial query and mutation state', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['billing', 'credits'], { balance: 'old' });
    queryClient.setQueryData(['editor', 'document'], { id: 'kept' });
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['billing', 'topup'], mutationFn: async () => 1 });
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['editor', 'save'], mutationFn: async () => 1 });
    const { result } = renderHook(() => useFinancialSession(), { wrapper: wrap(queryClient) });
    const before = result.current.capture();
    act(() => {
      result.current.purge('logout');
    });
    const after = result.current.capture();
    expect(before.signal.aborted).toBe(true);
    expect(before.isCurrent()).toBe(false);
    expect(after.generation).toBeGreaterThan(before.generation);
    expect(queryClient.getQueryData(['billing', 'credits'])).toBeUndefined();
    expect(queryClient.getQueryData(['editor', 'document'])).toEqual({ id: 'kept' });
    expect(queryClient.getMutationCache().find({ mutationKey: ['billing', 'topup'] })).toBeUndefined();
    expect(queryClient.getMutationCache().find({ mutationKey: ['editor', 'save'] })).toBeDefined();
  });

  it('keeps every generation distinct across A to B to A', () => {
    const queryClient = new QueryClient();
    const { result } = renderHook(() => useFinancialSession(), { wrapper: wrap(queryClient) });
    act(() => {
      result.current.bind({ apiBaseUrl: 'https://api', environment: 'development', ownerId: 'a' });
    });
    const firstA = result.current.capture();
    act(() => {
      result.current.bind({ apiBaseUrl: 'https://api', environment: 'development', ownerId: 'b' });
    });
    const ownerB = result.current.capture();
    act(() => {
      result.current.bind({ apiBaseUrl: 'https://api', environment: 'development', ownerId: 'a' });
    });
    const secondA = result.current.capture();
    expect([firstA.generation, ownerB.generation, secondA.generation]).toEqual([1, 2, 3]);
    expect(firstA.isCurrent()).toBe(false);
    expect(ownerB.isCurrent()).toBe(false);
    expect(secondA.isCurrent()).toBe(true);
  });

  // ── Saved snapshot store ─────────────────────────────────────────────────
  it('clears this device saved usage on logout and account closure', () => {
    const { result } = renderHook(() => useFinancialSession(), { wrapper: wrap(new QueryClient()) });

    act(() => {
      result.current.purge('logout');
      result.current.purge('closure');
    });

    expect(purgeSavedUsage).toHaveBeenCalledTimes(2);
    expect(purgeSavedUsage).toHaveBeenNthCalledWith(1, undefined);
    expect(purgeSavedUsage).toHaveBeenNthCalledWith(2, undefined);
  });

  it('keeps only the newly bound owner saved usage on an account switch', () => {
    const { result } = renderHook(() => useFinancialSession(), { wrapper: wrap(new QueryClient()) });

    act(() => {
      result.current.bind({ apiBaseUrl: 'https://api', environment: 'development', ownerId: 'a' });
      result.current.bind({ apiBaseUrl: 'https://api', environment: 'development', ownerId: 'b' });
    });

    expect(purgeSavedUsage).toHaveBeenNthCalledWith(1, { environment: 'development', ownerId: 'a' });
    expect(purgeSavedUsage).toHaveBeenNthCalledWith(2, { environment: 'development', ownerId: 'b' });
  });

  it('applies a purge announced by another tab without announcing it again', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['billing', 'usage'], { balance: 'old' });
    render(
      <QueryClientProvider client={queryClient}>
        <FinancialSessionProvider>
          <FinancialSessionScope identity={undefined}>ready</FinancialSessionScope>
        </FinancialSessionProvider>
      </QueryClientProvider>,
    );
    const other = new BroadcastChannel('tau-financial-session-purge');
    const echoes: unknown[] = [];
    other.addEventListener('message', (event: MessageEvent) => {
      echoes.push(event.data);
    });

    other.postMessage({ keep: null });

    await waitFor(() => {
      expect(purgeSavedUsage).toHaveBeenCalledWith(undefined);
    });
    expect(queryClient.getQueryData(['billing', 'usage'])).toBeUndefined();
    expect(echoes).toEqual([]);
    other.close();
  });

  it('ignores a message that is not a purge announcement', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <FinancialSessionProvider>ready</FinancialSessionProvider>
      </QueryClientProvider>,
    );
    const other = new BroadcastChannel('tau-financial-session-purge');

    other.postMessage({ keep: { ownerId: 42 } });
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(purgeSavedUsage).not.toHaveBeenCalled();
    other.close();
  });
});
