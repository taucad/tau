/**
 * The adaptive financial core and the Cloud seam (adaptive app deployment mode charter W3): the loader (T-BA10,
 * T-BA25), the one surface helper (T-BA11, T-BA25), and the adaptive root boundary bound from the display mode
 * (T-BA8, T-BA12, T-BA20, T-BA22, T-BA23). The adaptive files are imported directly; unit tests run under the `cloud`
 * ceiling.
 */
import { act, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { Component, useEffect } from 'react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBillingSession } from '@taucad/billing/hooks/billing-session';
import { useFinancialSession } from '@taucad/billing-ui/providers/financial-session-provider';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import { CloudImportTimeoutError, createCloudLoader } from '#cloud/cloud-loader.js';
import type { CloudLoader } from '#cloud/cloud-loader.js';
import { CloudSurface } from '#cloud/cloud-surface.js';
import { cloudPort } from '#cloud/cloud-port.js';
import { reportBootStage, resetBootSignals } from '#lib/boot-signals.js';

const pendingMode: DeploymentModeSnapshot = { state: 'unknown', problem: 'pending' };
const harness = vi.hoisted(() => ({
  mode: undefined as DeploymentModeSnapshot | undefined,
  listeners: new Set<() => void>(),
  userId: undefined as string | undefined,
  purgeSavedUsage: vi.fn(async (_keep?: unknown) => undefined),
  reported: [] as unknown[],
}));

vi.mock('#cloud/use-deployment-mode.js', async () => {
  const { useSyncExternalStore } = await import('react');
  return {
    useDeploymentMode: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          harness.listeners.add(listener);
          return () => harness.listeners.delete(listener);
        },
        () => harness.mode ?? pendingMode,
        () => harness.mode ?? pendingMode,
      ),
  };
});
vi.mock('@better-auth-ui/react', () => ({
  useSession: () => ({ data: harness.userId === undefined ? undefined : { user: { id: harness.userId } } }),
}));
vi.mock('#providers/auth-provider.js', () => ({
  AuthConfigProvider: ({ children }: { children: ReactNode }): ReactNode => children,
}));
vi.mock('@taucad/billing-ui/db/billing-snapshot-database', () => ({
  purgeSavedUsage: async (keep?: unknown) => harness.purgeSavedUsage(keep),
}));
vi.mock('#lib/error-reporting.js', () => ({
  reportUiError: async (error: unknown) => {
    harness.reported.push(error);
    return undefined;
  },
}));

const setMode = (mode: DeploymentModeSnapshot): void => {
  act(() => {
    harness.mode = mode;
    for (const listener of harness.listeners) {
      listener();
    }
  });
};

const funded: DeploymentModeSnapshot = { state: 'funded', basis: 'confirmed', environment: 'staging' };

beforeEach(() => {
  harness.mode = undefined;
  harness.userId = undefined;
  harness.reported.length = 0;
  harness.purgeSavedUsage.mockClear();
  resetBootSignals();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cloudPort.clear();
});

/** A loader over a scripted import, ready at once, with recorded failures. */
const scripted = <Module,>(importer: () => Promise<Module>) => {
  const reported: unknown[] = [];
  const recovered: unknown[] = [];
  const loader = createCloudLoader({
    importer,
    deadlineMilliseconds: 1000,
    report: (error) => {
      reported.push(error);
    },
    recover: (error) => {
      recovered.push(error);
    },
    whenReady: (start) => {
      start();
      return () => undefined;
    },
  });
  return { loader, reported, recovered };
};

describe('cloud loader', () => {
  it('should retry a rejected import once on its own, then wait for the person, reporting once (T-BA10)', async () => {
    const importer = vi.fn(async (): Promise<{ ok: boolean }> => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    const { loader, reported, recovered } = scripted(importer);
    loader.load();
    await waitFor(() => {
      expect(loader.state()).toEqual({ status: 'failed', retryable: true });
    });
    expect(importer).toHaveBeenCalledTimes(2);
    expect(reported).toHaveLength(1);
    expect(recovered).toHaveLength(2);
    loader.load();
    expect(importer).toHaveBeenCalledTimes(2);

    importer.mockResolvedValueOnce({ ok: true });
    loader.retry();
    await waitFor(() => {
      expect(loader.state()).toEqual({ status: 'loaded', module: { ok: true } });
    });
    expect(reported).toHaveLength(1);
  });

  it('should give up on an import that never settles at the deadline, twice, then fail (T-BA25, I15)', async () => {
    vi.useFakeTimers();
    const importer = vi.fn(async () => Promise.withResolvers<never>().promise);
    const { loader, reported } = scripted(importer);
    loader.load();
    expect(loader.state()).toEqual({ status: 'loading' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(importer).toHaveBeenCalledTimes(2);
    expect(loader.state()).toEqual({ status: 'loading' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(loader.state()).toEqual({ status: 'failed', retryable: true });
    expect(reported).toEqual([expect.any(CloudImportTimeoutError)]);
  });

  it('should not start before home-ready (I1)', async () => {
    const importer = vi.fn(async () => ({}));
    const loader = createCloudLoader({ importer, report: () => undefined, recover: () => undefined });
    loader.load();
    await act(async () => {
      await Promise.resolve();
    });
    expect(importer).not.toHaveBeenCalled();
    reportBootStage('shell-mounted');
    reportBootStage('home-ready');
    await waitFor(() => {
      expect(importer).toHaveBeenCalledTimes(1);
    });
  });
});

describe('cloud surface', () => {
  const loaded = <Module,>(module: Module): CloudLoader<Module> => {
    const state = { status: 'loaded', module } as const;
    return { state: () => state, load: () => undefined, retry: () => undefined, subscribe: () => () => undefined };
  };

  it('should render the fallback while the mode is not funded or the chunk has not loaded, and never load then', () => {
    const load = vi.fn();
    const loading = { status: 'loading' } as const;
    const pending: CloudLoader<unknown> = {
      state: () => loading,
      load,
      retry: () => undefined,
      subscribe: () => () => undefined,
    };
    const { container, rerender } = render(
      <CloudSurface loader={pending} enabled={false} fallback='self-host' render={() => 'cloud'} />,
    );
    expect(container.textContent).toBe('self-host');
    expect(load).not.toHaveBeenCalled();
    rerender(<CloudSurface loader={pending} enabled fallback='self-host' render={() => 'cloud'} />);
    expect(container.textContent).toBe('self-host');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('should render a surface with no loader yet, without re-rendering forever (the W2 stubs)', () => {
    const { container } = render(<CloudSurface enabled fallback='self-host' render={() => 'cloud'} />);
    expect(container.textContent).toBe('self-host');
  });

  it('should keep the shell when a Cloud surface throws in render or in an effect, and report once (T-BA11)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const ThrowsInRender = (): never => {
      throw new Error('render');
    };
    const ThrowsInEffect = (): string => {
      useEffect(() => {
        throw new Error('effect');
      }, []);
      return 'mounted';
    };
    const { container } = render(
      <>
        <nav>sidebar</nav>
        <CloudSurface loader={loaded({})} enabled fallback='a' render={() => <ThrowsInRender />} />
        <CloudSurface loader={loaded({})} enabled fallback='b' render={() => <ThrowsInEffect />} />
      </>,
    );
    expect(container.textContent).toBe('sidebarab');
    expect(harness.reported).toHaveLength(2);
  });
});

/* The root boundary under test, imported after the mocks. */
const { CloudRootBoundary, fundedIdentity } = await import('#cloud/root-billing.adaptive.js');
const { useCloudFinancialPurge } = await import('#cloud/financial-purge.adaptive.js');

class Catch extends Component<{ readonly children: ReactNode }, { readonly error: string | undefined }> {
  public static getDerivedStateFromError(error: Error): { error: string } {
    return { error: error.message };
  }

  public override state: { readonly error: string | undefined } = { error: undefined };

  public override render(): ReactNode {
    return this.state.error ?? this.props.children;
  }
}

describe('adaptive root boundary', () => {
  const seen: Array<ReturnType<typeof useBillingSession>> = [];
  const mounts = { count: 0 };
  /** A shell child: reads the billing session, needs the financial provider, counts its mounts. */
  const Shell = (): string => {
    useFinancialSession();
    seen.push(useBillingSession());
    useEffect(() => {
      mounts.count += 1;
    }, []);
    return 'shell';
  };
  const mount = () => {
    seen.length = 0;
    mounts.count = 0;
    const queryClient = new QueryClient();
    const posted: unknown[] = [];
    vi.spyOn(BroadcastChannel.prototype, 'postMessage').mockImplementation((message: unknown) => {
      posted.push(message);
    });
    const view = render(
      <QueryClientProvider client={queryClient}>
        <Catch>
          <CloudRootBoundary>
            <Shell />
          </CloudRootBoundary>
        </Catch>
      </QueryClientProvider>,
    );
    return { queryClient, posted, view };
  };

  /* First: the Cloud loader is one module instance, which later rows leave waiting for a home-ready they never report. */
  it('should fill the port for the bound identity only after home-ready, through the one loader', async () => {
    harness.mode = funded;
    harness.userId = 'a';
    const QueryProbe = (): undefined => {
      useQueryClient();
      return undefined;
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CloudRootBoundary>
          <QueryProbe />
        </CloudRootBoundary>
      </QueryClientProvider>,
    );
    const key = JSON.stringify(['http://localhost:4000', 'staging', 'a']);
    expect(cloudPort.read(key)).toBeUndefined();
    act(() => {
      reportBootStage('shell-mounted');
      reportBootStage('home-ready');
    });
    await waitFor(() => {
      expect(cloudPort.read(key)).toEqual({});
    });
  });

  it('should mount every provider in every mode, and bind no billing session unless funded (T-BA12, T-BA22)', () => {
    harness.userId = 'a';
    const { view } = mount();
    expect(view.container.textContent).toBe('shell');
    expect(seen.at(-1)).toEqual({ apiBaseUrl: undefined, environment: undefined, userId: undefined });
    setMode({ state: 'unfunded', basis: 'confirmed' });
    expect(seen.at(-1)).toEqual({ apiBaseUrl: undefined, environment: undefined, userId: undefined });
    setMode(funded);
    expect(seen.at(-1)).toEqual({ apiBaseUrl: 'http://localhost:4000', environment: 'staging', userId: 'a' });
    expect(view.container.textContent).toBe('shell');
  });

  it('should keep the session signed out with no owner, even when funded (T-BA22)', () => {
    harness.mode = funded;
    mount();
    expect(seen.at(-1)).toEqual({ apiBaseUrl: 'http://localhost:4000', environment: 'staging', userId: undefined });
    expect(
      fundedIdentity({ apiBaseUrl: 'http://x', state: 'funded', environment: 'staging', ownerId: undefined }),
    ).toBeUndefined();
  });

  it('should keep the tree and the saved usage, drop billing queries and tell no window when the mode leaves funded (T-BA23, T-BA8)', async () => {
    harness.mode = funded;
    harness.userId = 'a';
    const { queryClient, posted } = mount();
    await waitFor(() => {
      expect(mounts.count).toBe(1);
    });
    queryClient.setQueryData(['billing', 'credits'], { balance: 'a' });
    harness.purgeSavedUsage.mockClear();
    posted.length = 0;

    setMode({ state: 'unknown', problem: 'unsupported' });
    expect(queryClient.getQueryData(['billing', 'credits'])).toBeUndefined();
    expect(harness.purgeSavedUsage).not.toHaveBeenCalled();
    expect(posted).toEqual([]);
    expect(mounts.count).toBe(1);

    setMode(funded);
    expect(mounts.count).toBe(1);
  });

  it('should not remount on sign-out while not funded (D17 c)', async () => {
    harness.userId = 'a';
    const { view } = mount();
    await waitFor(() => {
      expect(mounts.count).toBe(1);
    });
    harness.userId = undefined;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Catch>
          <CloudRootBoundary>
            <Shell />
          </CloudRootBoundary>
        </Catch>
      </QueryClientProvider>,
    );
    expect(harness.purgeSavedUsage).not.toHaveBeenCalled();
  });

  it('should purge every saved usage on sign-out with the Cloud chunk never loaded (T-BA20, I5)', () => {
    let purge: ((reason: 'logout' | 'owner_changed') => void) | undefined;
    const SignOut = (): undefined => {
      purge = useCloudFinancialPurge();
      return undefined;
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CloudRootBoundary>
          <SignOut />
        </CloudRootBoundary>
      </QueryClientProvider>,
    );
    harness.purgeSavedUsage.mockClear();
    purge?.('logout');
    expect(harness.purgeSavedUsage).toHaveBeenCalledWith(undefined);
  });
});
