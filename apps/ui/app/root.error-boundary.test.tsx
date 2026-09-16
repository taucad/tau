import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectHost = vi.hoisted(() => ({ renders: 0, shouldThrow: true }));
const page = vi.hoisted(() => ({ renders: 0 }));

vi.mock('#routes/w.$workspace.$project/project-route.js', () => ({
  ProjectSessionsHost: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => {
    projectHost.renders += 1;
    if (projectHost.shouldThrow) {
      throw new Error('controlled project host failure');
    }
    return children;
  },
}));
vi.mock('#components/layout/page.js', () => ({
  Page: ({ error }: { readonly error?: React.ReactNode }) => {
    page.renders += 1;
    return <main>{error ?? 'Application page'}</main>;
  },
}));
vi.mock('#components/error-page.js', () => ({
  ErrorPage: () => <div role='alert'>Application error</div>,
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  BillingSessionProvider: ({ children }: React.PropsWithChildren): React.ReactNode => children,
  useBillingSession: () => ({ apiBaseUrl: undefined, environment: undefined, userId: undefined }),
}));
vi.mock('#providers/financial-session-provider.js', () => ({
  FinancialSessionProvider: ({ children }: React.PropsWithChildren): React.ReactNode => children,
  FinancialSessionScope: ({ children }: React.PropsWithChildren): React.ReactNode => children,
  useFinancialSession: () => ({ capture: vi.fn() }),
}));

const { default: App, ErrorBoundary } = await import('#root.js');

const renderRootApp = (pathname: string, isDebug = false): ReturnType<typeof render> => {
  const loaderData = {
    cookies: {},
    env: {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- production loader key
      TAU_DEBUG: isDebug,
    },
    pathname,
    theme: null,
  };
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        path: '*',
        loader: () => loaderData,
        Component: App,
        ErrorBoundary,
      },
    ],
    { hydrationData: { loaderData: { root: loaderData } }, initialEntries: [pathname] },
  );
  return render(<RouterProvider router={router} />);
};

describe('root error containment', () => {
  beforeEach(() => {
    projectHost.renders = 0;
    projectHost.shouldThrow = true;
    page.renders = 0;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the root error page without re-entering a failed project host', async () => {
    renderRootApp('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Application error');
    const settledRenders = projectHost.renders;
    await Promise.resolve();
    await Promise.resolve();

    expect(settledRenders).toBeGreaterThan(0);
    expect(projectHost.renders).toBe(settledRenders);
    expect(page.renders).toBe(0);
  });

  it('should preserve the remote-host debug bypass', async () => {
    projectHost.shouldThrow = false;
    renderRootApp('/__e2e/remote-host', true);

    expect(await screen.findByRole('main')).toHaveTextContent('Application page');
    expect(projectHost.renders).toBe(0);
    expect(page.renders).toBe(1);
  });
});
