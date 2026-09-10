import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { FinancialSessionProvider, useFinancialSession } from '#providers/financial-session-provider.js';

describe('FinancialSessionProvider', () => {
  it('aborts the old generation and removes only financial query and mutation state', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['billing', 'credits'], { balance: 'old' });
    queryClient.setQueryData(['editor', 'document'], { id: 'kept' });
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['billing', 'topup'], mutationFn: async () => 1 });
    queryClient.getMutationCache().build(queryClient, { mutationKey: ['editor', 'save'], mutationFn: async () => 1 });
    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FinancialSessionProvider>{children}</FinancialSessionProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useFinancialSession(), { wrapper });
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
    const wrapper = ({ children }: { readonly children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FinancialSessionProvider>{children}</FinancialSessionProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useFinancialSession(), { wrapper });
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
});
