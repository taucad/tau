import { useEffect, useState } from 'react';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FinancialSessionProvider,
  FinancialSessionScope,
  useFinancialSession,
} from '#providers/financial-session-provider.js';
import type { FinancialSessionIdentity } from '#providers/financial-session-provider.js';

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

const owner = (ownerId: string): FinancialSessionIdentity => ({
  apiBaseUrl: 'https://api',
  environment: 'development',
  ownerId,
});

describe('FinancialSessionScope', () => {
  it('N1: keeps the children mounted when identity goes from none to an owner', () => {
    let mounts = 0;
    const Marker = (): undefined => {
      useEffect(() => {
        mounts += 1;
      }, []);
      return undefined;
    };
    const { rerender } = render(
      <FinancialSessionScope identity={undefined}>
        <Marker />
      </FinancialSessionScope>,
      { wrapper: wrap(new QueryClient()) },
    );

    rerender(
      <FinancialSessionScope identity={owner('a')}>
        <Marker />
      </FinancialSessionScope>,
    );

    expect(mounts).toBe(1);
  });

  it('H7: keeps a child upgraded state and its single mount when identity goes from none to an owner', () => {
    let mounts = 0;
    const seen: boolean[] = [];
    /** Stands in for the rich composer: it upgrades once after mount. */
    const Upgrading = (): undefined => {
      const [upgraded, setUpgraded] = useState(false);
      seen.push(upgraded);
      useEffect(() => {
        mounts += 1;
        // oxlint-disable-next-line react/set-state-in-effect -- the stand-in upgrades once after mount, as the composer does
        setUpgraded(true);
      }, []);
      return undefined;
    };
    const { rerender } = render(
      <FinancialSessionScope identity={undefined}>
        <Upgrading />
      </FinancialSessionScope>,
      { wrapper: wrap(new QueryClient()) },
    );
    expect(seen.at(-1)).toBe(true);
    seen.length = 0;

    rerender(
      <FinancialSessionScope identity={owner('a')}>
        <Upgrading />
      </FinancialSessionScope>,
    );

    expect({ mounts, seen: seen.every(Boolean) }).toEqual({ mounts: 1, seen: true });
  });

  it('never renders a new identity with the previous owner billing state', () => {
    type Seen = {
      readonly identity: string | undefined;
      readonly cached: string | undefined;
      readonly held: string | undefined;
    };
    const seen: Seen[] = [];
    const balanceKey = ['billing', 'balance'] as const;
    /** Reads billing state two ways: the shared query cache and React state latched at mount. */
    const Probe = ({ identity }: { readonly identity: FinancialSessionIdentity | undefined }): undefined => {
      const cached = useQueryClient().getQueryData<{ owner: string }>(balanceKey)?.owner;
      const [held] = useState(() => identity?.ownerId);
      seen.push({ identity: identity?.ownerId, cached, held });
      return undefined;
    };
    const queryClient = new QueryClient();
    const tree = (identity: FinancialSessionIdentity | undefined): React.JSX.Element => (
      <FinancialSessionScope identity={identity}>
        <Probe identity={identity} />
      </FinancialSessionScope>
    );
    const { rerender } = render(tree(owner('a')), { wrapper: wrap(queryClient) });
    act(() => {
      queryClient.setQueryData(balanceKey, { owner: 'a' });
    });
    rerender(tree(owner('a')));
    expect(seen.at(-1)).toEqual({ identity: 'a', cached: 'a', held: 'a' });

    rerender(tree(owner('b')));
    expect(seen.at(-1)).toEqual({ identity: 'b', cached: undefined, held: 'b' });
    act(() => {
      queryClient.setQueryData(balanceKey, { owner: 'b' });
    });
    rerender(tree(owner('b')));
    rerender(tree(undefined));

    const stale = seen.filter(
      (row) =>
        (row.cached !== undefined && row.cached !== row.identity) ||
        (row.held !== undefined && row.held !== row.identity),
    );
    expect(stale).toEqual([]);
    expect(seen.at(-1)).toEqual({ identity: undefined, cached: undefined, held: undefined });
  });
});
