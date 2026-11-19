import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router';
import type * as ReactRouter from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const projectHost = vi.hoisted(() => ({ renders: 0, shouldThrow: true }));
const page = vi.hoisted(() => ({ renders: 0 }));
const productProvider = vi.hoisted(() => ({
  renders: 0,
  shouldThrow: false,
  rendersAtErrorDocument: undefined as number | undefined,
}));

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
/* T-B28.1: a product provider that throws on every render (`HeadlessImageProvider` stands for any of them). */
vi.mock('#providers/headless-image-provider.js', () => ({
  HeadlessImageProvider: ({ children }: { readonly children: React.ReactNode }): React.ReactNode => {
    productProvider.renders += 1;
    if (productProvider.shouldThrow) {
      throw new Error('controlled product provider failure');
    }
    return children;
  },
}));
/* The document's framework parts need `HydratedRouter`'s context, which a memory router does not give. */
vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  Links: (): React.ReactNode => null,
  Meta: (): React.ReactNode => null,
  Scripts: (): React.ReactNode => null,
  ScrollRestoration: (): React.ReactNode => null,
}));
vi.mock('#components/error-page.js', () => ({
  ErrorPage: () => {
    /* Read when the error document commits: React's retry of the failed render may run the provider before that. */
    useEffect(() => {
      productProvider.rendersAtErrorDocument ??= productProvider.renders;
    }, []);
    return <div role='alert'>Application error</div>;
  },
}));
vi.mock('@taucad/billing/hooks/billing-session', () => ({
  BillingSessionProvider: ({ children }: React.PropsWithChildren): React.ReactNode => children,
  useBillingSession: () => ({ apiBaseUrl: undefined, environment: undefined, userId: undefined }),
}));
vi.mock('@taucad/billing-ui/providers/financial-session-provider', () => ({
  FinancialSessionProvider: ({ children }: React.PropsWithChildren): React.ReactNode => children,
  FinancialSessionScope: ({ children }: React.PropsWithChildren): React.ReactNode => children,
  useFinancialSession: () => ({ capture: vi.fn() }),
  useOptionalFinancialSession: () => undefined,
}));

const { default: App, ErrorBoundary, Layout } = await import('#root.js');
const { AppRuntimeProvider } = await import('#runtime/app-runtime-provider.js');
const { createAppRuntime } = await import('#runtime/app-runtime.js');

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
  /* The real `Layout` export supplies the query client; the memory router renders `App` without it. The product
   * providers inside `App` read the app runtime, which the client entry supplies. */
  return render(
    <AppRuntimeProvider runtime={createAppRuntime({ idleFileManagers: true })}>
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppRuntimeProvider>,
  );
};

/**
 * The root as the framework composes it: `Layout` around `App`, or around `ErrorBoundary` once the root caught.
 */
const renderRootDocument = (pathname: string): ReturnType<typeof render> => {
  const loaderData = { env: {} };
  const router = createMemoryRouter(
    [
      {
        id: 'root',
        path: '*',
        loader: () => loaderData,
        Component: () => (
          <Layout>
            <App />
          </Layout>
        ),
        ErrorBoundary: () => (
          <Layout>
            <ErrorBoundary />
          </Layout>
        ),
      },
    ],
    { hydrationData: { loaderData: { root: loaderData } }, initialEntries: [pathname] },
  );
  return render(
    <AppRuntimeProvider runtime={createAppRuntime({ idleFileManagers: true })}>
      <RouterProvider router={router} />
    </AppRuntimeProvider>,
  );
};

describe('root error containment', () => {
  beforeEach(() => {
    projectHost.renders = 0;
    projectHost.shouldThrow = true;
    page.renders = 0;
    productProvider.renders = 0;
    productProvider.shouldThrow = false;
    productProvider.rendersAtErrorDocument = undefined;
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

  it('should render the error document with its safe-mode link without mounting a product provider again', async () => {
    projectHost.shouldThrow = false;
    productProvider.shouldThrow = true;
    renderRootDocument('/');

    const link = await screen.findByRole('link', { name: 'Open in safe mode' });
    expect(link).toHaveAttribute('href', '/?safe=1');
    expect(screen.getByRole('alert')).toHaveTextContent('Application error');
    const document = link.closest('[data-slot="root-error-document"]');
    expect(document).toHaveClass('h-dvh', 'overflow-y-auto');
    await Promise.resolve();
    await Promise.resolve();

    /* The failed render (and React's synchronous retry of it) ran the provider; the error document never runs it. */
    expect(productProvider.rendersAtErrorDocument).toBeGreaterThan(0);
    expect(productProvider.renders).toBe(productProvider.rendersAtErrorDocument);
    expect(page.renders).toBe(0);
  });
});
