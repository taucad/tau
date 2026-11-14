// @vitest-environment jsdom
/**
 * H6, the state part (app state orchestration plan § 4 A13): the library reports the Tau Cloud listing as one of
 * three states, `fetching | ready | failed`, and Home's cloud line reads that state rather than two flags.
 *
 * `failed` is a listing react-query reports as errored; `fetching` is otherwise a request in flight (a retry of a listing
 * that never answered included, as react-query clears its error when that retry starts); `ready` is every other case,
 * including a listing not asked yet. These are the cases, in the order, that the cloud line draws today.
 */
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import { useCloudProjects } from '#hooks/use-cloud-projects.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Deployment environment keys.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));

const fetchMock = vi.fn<typeof fetch>();

const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: PropsWithChildren): React.JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
};

/** The listing state the hook reports. */
const cloudOf = (result: { readonly current: ReturnType<typeof useCloudProjects> }): string => result.current.cloud;

beforeEach(() => {
  localStorage.clear();
  setRevisionSessionUser(undefined);
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('H6: the cloud listing state', () => {
  it('H6: reports fetching while the listing request is in flight, then ready once it answers', async () => {
    const response = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(async () => response.promise);
    const { result } = renderHook(() => useCloudProjects(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(cloudOf(result)).toBe('fetching');
    });

    await act(async () => {
      response.resolve(Response.json([]));
      await response.promise;
    });
    await waitFor(() => {
      expect(cloudOf(result)).toBe('ready');
    });
  });

  it('H6: reports failed when the listing request fails, and fetching while its retry is in flight', async () => {
    fetchMock.mockImplementation(async () => new Response(undefined, { status: 503 }));
    const { result } = renderHook(() => useCloudProjects(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(cloudOf(result)).toBe('failed');
    });

    const retried = Promise.withResolvers<Response>();
    fetchMock.mockImplementation(async () => retried.promise);
    act(() => {
      result.current.retry();
    });
    await waitFor(() => {
      expect(cloudOf(result)).toBe('fetching');
    });

    await act(async () => {
      retried.resolve(Response.json([]));
      await retried.promise;
    });
    await waitFor(() => {
      expect(cloudOf(result)).toBe('ready');
    });
  });

  it('H6: reports ready for a listing that is not asked', () => {
    fetchMock.mockImplementation(async () => Response.json([]));
    const { result } = renderHook(() => useCloudProjects({ enabled: false }), { wrapper: createWrapper() });

    expect(cloudOf(result)).toBe('ready');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
