// @vitest-environment jsdom
/**
 * N2 (app state orchestration plan § 11, carried to A2): a load of Home requests `/v1/projects` once.
 *
 * The cloud listing is keyed by the published account. On a load the session's first answer arrives after Home's
 * library has mounted, so the listing ran keyed by no account and ran again once the account was published: two
 * requests. It now waits for the session's answer, and for the published account to agree with it.
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authQueryKeys } from '@better-auth-ui/core';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import { useCloudProjects } from '#hooks/use-cloud-projects.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Deployment environment keys.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const fetchMock = vi.fn<typeof fetch>();
const listings = (): number =>
  fetchMock.mock.calls.filter(([input]) => typeof input === 'string' && input.endsWith('/v1/projects')).length;

// oxlint-disable-next-line typescript/no-restricted-types -- better-auth answers a signed-out session with null.
type SessionAnswer = { readonly user: { readonly id: string } } | null;

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren): React.JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  /* The session query as the billing fence starts it at the root: in flight until the test answers it. */
  const answer = Promise.withResolvers<SessionAnswer>();
  const session = async (): Promise<void> => {
    await client.query({ queryKey: authQueryKeys.session, queryFn: async () => answer.promise });
  };
  return { client, wrapper: Wrapper, answer, session };
};

const settle = async (): Promise<void> => {
  await act(async () => {
    for (let turn = 0; turn < 10; turn += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each turn lets one more continuation run.
      await Promise.resolve();
    }
  });
};

beforeEach(() => {
  localStorage.clear();
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

describe('N2: the cloud listing on a load', () => {
  it('N2: requests /v1/projects once when the session answers after the listing mounts', async () => {
    const { wrapper, answer, session } = createWrapper();
    const loaded = session();
    renderHook(() => useCloudProjects(), { wrapper });
    await settle();
    expect(listings(), 'N2: no listing while the session is unanswered').toBe(0);

    answer.resolve({ user: { id: 'owner' } });
    await act(async () => {
      await loaded;
    });
    await settle();
    expect(listings(), 'N2: no listing keyed by no account once the session named one').toBe(0);

    /* `RevisionActorIdentity` publishes the account in its effect. */
    act(() => {
      setRevisionSessionUser({ id: 'owner' });
    });
    await settle();
    expect(listings(), 'N2: requests per load of Home').toBe(1);
  });

  it('N2: requests /v1/projects once for a signed-out session', async () => {
    const { wrapper, answer, session } = createWrapper();
    const loaded = session();
    renderHook(() => useCloudProjects(), { wrapper });
    await settle();
    expect(listings()).toBe(0);

    answer.resolve(null);
    await act(async () => {
      await loaded;
    });
    await settle();
    expect(listings()).toBe(1);
  });

  it('should list at once in a tree with no session query', async () => {
    const { wrapper } = createWrapper();
    setRevisionSessionUser({ id: 'owner' });
    renderHook(() => useCloudProjects(), { wrapper });
    await settle();
    expect(listings()).toBe(1);
  });

  it('should list at once when the session failed to answer', async () => {
    const { client, wrapper } = createWrapper();
    await client
      .query({
        queryKey: authQueryKeys.session,
        queryFn: async () => {
          throw new Error('offline');
        },
      })
      .catch(() => undefined);
    renderHook(() => useCloudProjects(), { wrapper });
    await settle();
    expect(listings()).toBe(1);
  });
});
