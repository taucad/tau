// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { authQueryKeys } from '@better-auth-ui/core';
import { useEffect } from 'react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import { useCloudProjects } from '#hooks/use-cloud-projects.js';

vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));
const fetchMock = vi.fn<typeof fetch>();
const listings = (): number =>
  fetchMock.mock.calls.filter(([input]) => typeof input === 'string' && input.endsWith('/v1/projects')).length;
const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
};
beforeEach(() => {
  setRevisionSessionUser(undefined);
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json([]));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setRevisionSessionUser(undefined);
});

it('real tree: fence ancestor observes the session, listing below', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const answer = Promise.withResolvers<{ user: { id: string } }>();
  function Fence({ children }: PropsWithChildren) {
    const { data } = useQuery({ queryKey: authQueryKeys.session, queryFn: async () => answer.promise });
    return (
      <>
        {children}
        <Identity id={data?.user.id} />
      </>
    );
  }
  function Identity({ id }: { id: string | undefined }) {
    useEffect(() => {
      setRevisionSessionUser(id === undefined ? undefined : { id });
    }, [id]);
    return null;
  }
  function Home() {
    useCloudProjects();
    return null;
  }
  render(
    <QueryClientProvider client={client}>
      <Fence>
        <Home />
      </Fence>
    </QueryClientProvider>,
  );
  await settle();
  const before = listings();
  await act(async () => {
    answer.resolve({ user: { id: 'owner' } });
    await answer.promise;
  });
  await settle();
  console.log('listings before answer', before, 'after', listings());
  expect(listings()).toBe(1);
});

it('hydration: fence ancestor observes the session, listing below', async () => {
  const { renderToString } = await import('react-dom/server');
  const { hydrateRoot } = await import('react-dom/client');
  const answer = Promise.withResolvers<{ user: { id: string } }>();
  function Fence({ children }: PropsWithChildren) {
    const { data } = useQuery({ queryKey: authQueryKeys.session, queryFn: async () => answer.promise });
    return (
      <div>
        {children}
        <Identity id={data?.user.id} />
      </div>
    );
  }
  function Identity({ id }: { id: string | undefined }) {
    useEffect(() => {
      setRevisionSessionUser(id === undefined ? undefined : { id });
    }, [id]);
    return null;
  }
  function Home() {
    useCloudProjects();
    return <span>home</span>;
  }
  const tree = (client: QueryClient) => (
    <QueryClientProvider client={client}>
      <Fence>
        <Home />
      </Fence>
    </QueryClientProvider>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(tree(new QueryClient()));
  document.body.append(container);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, tree(client));
  });
  await settle();
  const before = listings();
  await act(async () => {
    answer.resolve({ user: { id: 'owner' } });
    await answer.promise;
  });
  await settle();
  console.log('hydration listings before answer', before, 'after', listings());
  act(() => root?.unmount());
  expect(listings()).toBe(1);
});
