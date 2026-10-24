// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setRevisionSessionUser } from '#lib/revision-actor.js';
import {
  assertCloudProjectActive,
  canOpenCloudProject,
  cloudProjectsQueryKeyFor,
  fetchCloudProjects,
  getCloudDeletionState,
  tauCloudIntent,
  useCloudProjects,
  useDeleteCloudProject,
} from '#hooks/use-cloud-projects.js';
import type { CloudProject } from '#hooks/use-cloud-projects.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- Deployment environment keys.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test' } }));
vi.mock('#hooks/use-resolved-auth.js', () => ({ useResolvedAuth: () => 'authed' }));
vi.mock('#cloud/commercial-features.js', () => ({
  useCommercialFeatures: () => ({ isResolved: true, canSyncFiles: true }),
}));

const project: CloudProject = {
  id: 'legacy-project',
  name: 'Kept bracket',
  role: 'owner',
  canDeleteCloud: true,
  cloudState: 'active',
};
let serverState: 'active' | 'deleting' | 'deleted';
let hasLostResponse: boolean;
let isOffline: boolean;
const fetchMock = vi.fn<typeof fetch>();
const clients: QueryClient[] = [];
const createWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  function Wrapper({ children }: PropsWithChildren): React.JSX.Element {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return { client, wrapper: Wrapper };
};

beforeEach(() => {
  localStorage.clear();
  setRevisionSessionUser({ id: 'owner', name: 'Owner' });
  serverState = 'active';
  hasLostResponse = false;
  isOffline = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    if (isOffline) {
      throw new TypeError('offline');
    }
    if (init?.method === 'DELETE') {
      serverState = 'deleting';
      if (hasLostResponse) {
        isOffline = true;
        throw new TypeError('response lost');
      }
      return Response.json({ projectId: project.id, state: serverState }, { status: 202 });
    }
    if (typeof input === 'string' && input.endsWith('/deletion')) {
      return Response.json({ projectId: project.id, state: serverState });
    }
    return Response.json(serverState === 'deleted' ? [] : [{ ...project, cloudState: serverState }]);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) {
    client.clear();
  }
  vi.unstubAllGlobals();
  setRevisionSessionUser(undefined);
});

describe('cloud project deletion', () => {
  it('should fail closed for absent or non-boolean capability despite the owner display fallback', async () => {
    fetchMock.mockResolvedValue(
      Response.json([{ id: 'old', name: 'Old' }, { id: 'malformed', name: 'Malformed', canDeleteCloud: 'true' }, null]),
    );
    expect(await fetchCloudProjects()).toEqual([
      { id: 'old', name: 'Old', role: 'owner', canDeleteCloud: false, cloudState: 'active' },
      { id: 'malformed', name: 'Malformed', role: 'owner', canDeleteCloud: false, cloudState: 'active' },
    ]);
    const { wrapper } = createWrapper();
    const { result } = renderHook(useDeleteCloudProject, { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync({ ...project, canDeleteCloud: undefined })).rejects.toThrow(
        'Cloud deletion is unavailable',
      );
    });
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false);
  });

  it('should keep a lost response pending across remount and complete only from status', async () => {
    hasLostResponse = true;
    localStorage.setItem('local-work', 'dirty files, chats, Trash metadata and other remotes');
    tauCloudIntent.set(project.id, 'open');
    const { wrapper } = createWrapper();
    const view = renderHook(useDeleteCloudProject, { wrapper });
    await act(async () => {
      expect(await view.result.current.mutateAsync(project)).toBe('checking');
    });
    expect(getCloudDeletionState(project.id)).toBe('checking');
    expect(canOpenCloudProject(project.id)).toBe(false);
    view.unmount();
    const reloaded = renderHook(useCloudProjects, createWrapper());
    expect(reloaded.result.current.projects).toEqual([
      expect.objectContaining({ id: project.id, cloudState: 'deleting', isCheckingDeletion: true }),
    ]);
    expect(localStorage.getItem('local-work')).toBe('dirty files, chats, Trash metadata and other remotes');
    isOffline = false;
    serverState = 'deleted';
    await act(async () => {
      reloaded.result.current.retry();
    });
    await waitFor(() => {
      expect(reloaded.result.current.projects).toEqual([]);
    });
    expect(getCloudDeletionState(project.id)).toBe('deleted');
    expect(tauCloudIntent.get(project.id)).toBeUndefined();
    tauCloudIntent.set(project.id, 'open');
    expect(tauCloudIntent.get(project.id)).toBeUndefined();
    expect(localStorage.getItem('local-work')).toBe('dirty files, chats, Trash metadata and other remotes');
  });

  it('should recover server pending rows after reload and never infer success from absence', async () => {
    serverState = 'deleting';
    expect(await fetchCloudProjects()).toEqual([
      expect.objectContaining({ cloudState: 'deleting', canDeleteCloud: false }),
    ]);
    fetchMock.mockImplementation(async (input) =>
      typeof input === 'string' && input.endsWith('/deletion')
        ? new Response(null, { status: 404 })
        : Response.json([]),
    );
    expect(await fetchCloudProjects()).toEqual([expect.objectContaining({ id: project.id, cloudState: 'deleting' })]);
    expect(getCloudDeletionState(project.id)).toBe('deleting');
  });

  it('should discard stale active listings after authoritative deletion', async () => {
    const { wrapper, client } = createWrapper();
    const view = renderHook(useDeleteCloudProject, { wrapper });
    await act(async () => {
      await view.result.current.mutateAsync(project);
    });
    serverState = 'deleted';
    await fetchCloudProjects();
    client.setQueryData(cloudProjectsQueryKeyFor('owner'), [project]);
    fetchMock.mockResolvedValue(Response.json([project]));
    const listing = renderHook(useCloudProjects, { wrapper });
    expect(listing.result.current.projects).toEqual([]);
    await expect(assertCloudProjectActive(project.id)).rejects.toThrow('being deleted');
  });

  it('should invalidate only the initiating account and keep its receipt out of another account', async () => {
    const { wrapper, client } = createWrapper();
    client.setQueryData(cloudProjectsQueryKeyFor('other'), [{ id: 'other-project', name: 'Other', role: 'owner' }]);
    const invalidation = vi.spyOn(client, 'invalidateQueries');
    const view = renderHook(useDeleteCloudProject, { wrapper });
    await act(async () => {
      await view.result.current.mutateAsync(project);
    });
    expect(invalidation).toHaveBeenCalledExactlyOnceWith({ queryKey: cloudProjectsQueryKeyFor('owner'), exact: true });
    act(() => {
      setRevisionSessionUser({ id: 'other', name: 'Other' });
    });
    expect(getCloudDeletionState(project.id)).toBeUndefined();
    expect(client.getQueryData(cloudProjectsQueryKeyFor('other'))).toEqual([
      { id: 'other-project', name: 'Other', role: 'owner' },
    ]);
  });

  it('should report refusal inline and allow retry when status confirms active', async () => {
    fetchMock.mockImplementation(async (_input, init) =>
      init?.method === 'DELETE'
        ? new Response(null, { status: 403 })
        : Response.json({ projectId: project.id, state: 'active' }),
    );
    const { wrapper } = createWrapper();
    const view = renderHook(useDeleteCloudProject, { wrapper });
    await act(async () => {
      await expect(view.result.current.mutateAsync(project)).rejects.toThrow('403');
    });
    expect(getCloudDeletionState(project.id)).toBeUndefined();
    expect(canOpenCloudProject(project.id)).toBe(true);
  });

  it('should send no destructive request if durable recovery cannot be saved', async () => {
    const failure = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    try {
      const { wrapper } = createWrapper();
      const view = renderHook(useDeleteCloudProject, { wrapper });
      await act(async () => {
        await expect(view.result.current.mutateAsync(project)).rejects.toThrow('Storage unavailable');
      });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      failure.mockRestore();
    }
  });
  it.each([400, 401, 403, 404])(
    'should show an authoritative %s rejection even when status and listing are unavailable',
    async (rejectionStatus) => {
      const { wrapper, client } = createWrapper();
      client.setQueryData(cloudProjectsQueryKeyFor('owner'), [project]);
      fetchMock.mockImplementation(async (_input, init) => {
        if (init?.method === 'DELETE') {
          return new Response(null, { status: rejectionStatus });
        }
        throw new TypeError('offline');
      });
      const view = renderHook(useDeleteCloudProject, { wrapper });
      await act(async () => {
        await expect(view.result.current.mutateAsync(project)).rejects.toThrow(String(rejectionStatus));
      });
      expect(getCloudDeletionState(project.id)).toBeUndefined();
      expect(client.getQueryData(cloudProjectsQueryKeyFor('owner'))).toEqual([project]);
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'GET')).toBe(false);
    },
  );

  it('should retain an accepted intent when a late request returns an authoritative rejection', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') {
        localStorage.setItem(
          'tau:cloud-project-deletions:owner',
          JSON.stringify([{ id: project.id, name: project.name, state: 'deleting' }]),
        );
        return new Response(null, { status: 403 });
      }
      throw new TypeError('offline');
    });
    const view = renderHook(useDeleteCloudProject, createWrapper());
    await act(async () => {
      await expect(view.result.current.mutateAsync(project)).rejects.toThrow('403');
    });
    expect(getCloudDeletionState(project.id)).toBe('deleting');
    expect(canOpenCloudProject(project.id)).toBe(false);
  });

  it('should persist only completed IDs and state without names', async () => {
    fetchMock.mockResolvedValue(Response.json({ projectId: project.id, state: 'deleted' }));
    const view = renderHook(useDeleteCloudProject, createWrapper());
    await act(async () => {
      await view.result.current.mutateAsync(project);
    });
    expect(JSON.parse(localStorage.getItem('tau:cloud-project-deletions:owner') ?? '[]')).toEqual([
      { id: project.id, state: 'deleted' },
    ]);
  });

  it('should never overlay or persist an old account listing into the newly signed-in account', async () => {
    const listingResponse = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(listingResponse.promise);
    const oldListing = fetchCloudProjects();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    setRevisionSessionUser({ id: 'other', name: 'Other' });
    listingResponse.resolve(Response.json([{ ...project, cloudState: 'deleting' }]));
    expect(await oldListing).toEqual([]);
    expect(getCloudDeletionState(project.id)).toBeUndefined();
    expect(localStorage.getItem('tau:cloud-project-deletions:owner')).toBeNull();
    expect(localStorage.getItem('tau:cloud-project-deletions:other')).toBeNull();
    fetchMock.mockImplementation(async () => Response.json([{ id: 'other-only', name: 'Other only', role: 'owner' }]));
    expect(await fetchCloudProjects()).toEqual([expect.objectContaining({ id: 'other-only', cloudState: 'active' })]);
  });

  it('should stop an old account listing when the account changes during status recovery', async () => {
    localStorage.setItem(
      'tau:cloud-project-deletions:owner',
      JSON.stringify([{ id: project.id, name: project.name, state: 'deleting' }]),
    );
    const statusResponse = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(statusResponse.promise);
    const oldListing = fetchCloudProjects();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    setRevisionSessionUser({ id: 'other', name: 'Other' });
    statusResponse.resolve(Response.json({ projectId: project.id, state: 'deleting' }));
    expect(await oldListing).toEqual([]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(localStorage.getItem('tau:cloud-project-deletions:other')).toBeNull();
  });

  it('should keep a completed response on its initiating account after switching accounts', async () => {
    const deletionResponse = Promise.withResolvers<Response>();
    fetchMock.mockReturnValueOnce(deletionResponse.promise);
    const view = renderHook(useDeleteCloudProject, createWrapper());
    let mutation: Promise<unknown> | undefined;
    act(() => {
      mutation = view.result.current.mutateAsync(project);
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledOnce();
    });
    act(() => {
      setRevisionSessionUser({ id: 'other', name: 'Other' });
    });
    await act(async () => {
      deletionResponse.resolve(Response.json({ projectId: project.id, state: 'deleted' }));
      await mutation;
    });
    expect(getCloudDeletionState(project.id)).toBeUndefined();
    expect(localStorage.getItem('tau:cloud-project-deletions:other')).toBeNull();
    expect(JSON.parse(localStorage.getItem('tau:cloud-project-deletions:owner') ?? '[]')).toEqual([
      { id: project.id, state: 'deleted' },
    ]);
  });
  it('should retain unknown server failures for status recovery without claiming a rejection', async () => {
    fetchMock.mockImplementation(async (_input, init) => {
      if (init?.method === 'DELETE') {
        return new Response(null, { status: 503 });
      }
      throw new TypeError('status unavailable');
    });
    const view = renderHook(useDeleteCloudProject, createWrapper());
    await act(async () => {
      expect(await view.result.current.mutateAsync(project)).toBe('checking');
    });
    expect(getCloudDeletionState(project.id)).toBe('checking');
    expect(canOpenCloudProject(project.id)).toBe(false);
  });

  it('should poll a pending intent to authoritative completion and stop after unmount', async () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(
        'tau:cloud-project-deletions:owner',
        JSON.stringify([{ id: project.id, name: project.name, state: 'deleting' }]),
      );
      serverState = 'deleting';
      const view = renderHook(useCloudProjects, createWrapper());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      serverState = 'deleted';
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3100);
      });
      expect(getCloudDeletionState(project.id)).toBe('deleted');
      expect(view.result.current.projects).toEqual([]);
      view.unmount();
      const calls = fetchMock.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(calls);
    } finally {
      vi.useRealTimers();
    }
  });
});
