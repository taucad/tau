import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, Outlet, RouterProvider, createMemoryRouter } from 'react-router';
import type {
  DataStrategyFunction,
  DataStrategyResult,
  LoaderFunctionArgs,
  ShouldRevalidateFunctionArgs,
} from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { shouldRevalidate } from '#root.js';

const navigation = (from: string, to: string, formMethod?: 'POST'): ShouldRevalidateFunctionArgs => ({
  currentUrl: new URL(from, 'https://tau.new'),
  nextUrl: new URL(to, 'https://tau.new'),
  currentParams: {},
  nextParams: {},
  formMethod,
  defaultShouldRevalidate: true,
});

describe('root shouldRevalidate', () => {
  it('should skip the root loader when only the query string changes', () => {
    expect(shouldRevalidate(navigation('/community', '/community?q=gear'))).toBe(false);
    expect(shouldRevalidate(navigation('/community?q=gea', '/community?q=gear&kernel=replicad'))).toBe(false);
  });

  it('should skip the root loader when a client navigation changes the pathname', () => {
    expect(shouldRevalidate(navigation('/', '/w/local/gear'))).toBe(false);
    expect(shouldRevalidate(navigation('/community', '/projects?sort=recent'))).toBe(false);
  });

  it('should keep the default for an explicit revalidation and a submission', () => {
    expect(shouldRevalidate(navigation('/community?q=gear', '/community?q=gear'))).toBe(true);
    expect(shouldRevalidate(navigation('/community', '/community?q=gear', 'POST'))).toBe(true);
    expect(shouldRevalidate(navigation('/', '/w/local/gear', 'POST'))).toBe(true);
  });

  it('should keep the default when the debug remote-host page is entered or left', () => {
    expect(shouldRevalidate(navigation('/', '/__e2e/remote-host'))).toBe(true);
    expect(shouldRevalidate(navigation('/__e2e/remote-host', '/'))).toBe(true);
  });
});

/*
 * Framework mode loads through React Router's single-fetch data strategy, which passes its own default to every
 * route's `shouldRevalidate`: revalidate, unless an action answered with an error status
 * (`singleFetchLoaderNavigationStrategy`, react-router 7.18.2). A plain data router would default the root to
 * "no" on a pathname change and hide U23, so this router uses the same call.
 */
const singleFetchStrategy: DataStrategyFunction = async ({ matches }) => {
  const results = await Promise.all(
    matches.map(async (match): Promise<readonly [string, DataStrategyResult] | undefined> => {
      const actionStatus = match.shouldRevalidateArgs?.actionStatus;
      if (!match.shouldCallHandler(actionStatus === undefined || actionStatus < 400)) {
        return undefined;
      }
      return [match.route.id, await match.resolve()];
    }),
  );
  return Object.fromEntries(results.filter((result) => result !== undefined));
};

/*
 * U23: in framework mode the root route's loader runs on the client as a `<path>.data` request, and the project
 * route has no loader of its own, so whether a click waits on the server is decided by the root route's
 * `shouldRevalidate` alone. This router stands that request in with a recorded one the test can hold.
 */
describe('root loader on a client navigation', () => {
  let dataRequests: string[] = [];
  let heldResponse: Promise<never> | undefined;

  afterEach(() => {
    dataRequests = [];
    heldResponse = undefined;
  });

  const rootLoader = async ({ request }: LoaderFunctionArgs): Promise<{ readonly pathname: string }> => {
    const { pathname } = new URL(request.url);
    dataRequests.push(`${pathname}.data`);
    if (heldResponse !== undefined) {
      await heldResponse;
    }
    return { pathname };
  };

  const renderApp = async (): Promise<ReturnType<typeof createMemoryRouter>> => {
    const router = createMemoryRouter(
      [
        {
          id: 'root',
          path: '/',
          loader: rootLoader,
          shouldRevalidate,
          Component: Outlet,
          children: [
            { index: true, element: <Link to='/w/local/gear'>Open gear</Link> },
            {
              path: 'w/:workspace/:project',
              element: <p>Project gear</p>,
              action: () => ({ ok: true }),
            },
            { path: '__e2e/remote-host', element: <p>Remote host</p> },
          ],
        },
      ],
      { initialEntries: ['/'], dataStrategy: singleFetchStrategy },
    );
    render(<RouterProvider router={router} />);
    await screen.findByText('Open gear');
    expect(dataRequests).toEqual(['/.data']);
    dataRequests = [];
    return router;
  };

  it('should send no root .data request when a Home project link is clicked', async () => {
    await renderApp();

    fireEvent.click(screen.getByText('Open gear'));

    expect(await screen.findByText('Project gear')).toBeInTheDocument();
    expect(dataRequests).toEqual([]);
  });

  it('should commit the project route while a root .data response is held', async () => {
    const router = await renderApp();
    // The response never arrives, like the 17.9 s sample in U23.
    heldResponse = new Promise<never>(() => {
      /* Held. */
    });

    fireEvent.click(screen.getByText('Open gear'));

    expect(await screen.findByText('Project gear', undefined, { timeout: 1000 })).toBeInTheDocument();
    expect(router.state.navigation.state).toBe('idle');
    expect(router.state.location.pathname).toBe('/w/local/gear');
  });

  it('should still run the root loader for a submission and an explicit revalidation', async () => {
    const router = await renderApp();
    const formData = new FormData();
    formData.set('intent', 'save');

    await router.navigate('/w/local/gear', { formMethod: 'post', formData });
    await router.revalidate();

    await waitFor(() => {
      expect(dataRequests).toEqual(['/w/local/gear.data', '/w/local/gear.data']);
    });
  });

  it('should still run the root loader when the debug remote-host page is entered and left', async () => {
    const router = await renderApp();

    await router.navigate('/__e2e/remote-host');
    await router.navigate('/');

    expect(dataRequests).toEqual(['/__e2e/remote-host.data', '/.data']);
  });
});
