import { useSyncExternalStore } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { projectManager, query, registry, useQuery, worker } = vi.hoisted(() => {
  const listeners = new Set<
    (snapshot: { context: { refs: Readonly<Record<string, Record<string, unknown>>> } }) => void
  >();
  let references: Readonly<Record<string, Record<string, unknown>>> = {};
  const operations: string[] = [];
  const queryState = { isLoading: false };
  const actor = {
    getSnapshot: () => ({ context: { refs: references } }),
    subscribe: (
      listener: (snapshot: { context: { refs: Readonly<Record<string, Record<string, unknown>>> } }) => void,
    ) => {
      listeners.add(listener);
      return { unsubscribe: () => listeners.delete(listener) };
    },
    send: (event: { readonly type: string; readonly projectId?: string }) => {
      if (event.type !== 'close' || event.projectId === undefined) {
        return;
      }
      operations.push(`close:${event.projectId}`);
      references = Object.fromEntries(Object.entries(references).filter(([id]) => id !== event.projectId));
      for (const listener of listeners) {
        listener(actor.getSnapshot());
      }
    },
  };
  return {
    projectManager: {
      deleteProject: vi.fn(async (projectId: string) => {
        operations.push(`trash:${projectId}`);
        return true;
      }),
      permanentlyDeleteProject: vi.fn(async (projectId: string) => {
        operations.push(`delete:${projectId}`);
      }),
    },
    query: queryState,
    registry: {
      actor,
      live: (projectId: string) => {
        references = { ...references, [projectId]: {} };
      },
      reset: () => {
        references = {};
        listeners.clear();
        operations.length = 0;
      },
      operations,
    },
    useQuery: vi.fn((_options: Record<string, unknown>) => ({
      data: undefined,
      /* TanStack reports a *disabled* query as pending-but-not-loading, which is
       * the whole point of the readiness pin below. */
      isLoading: queryState.isLoading,
      error: undefined,
      refetch: vi.fn(),
    })),
    worker: { isLoading: false },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQuery,
  useQueryClient: () => ({ invalidateQueries: vi.fn(), removeQueries: vi.fn() }),
}));

vi.mock('#hooks/use-project-manager.js', () => ({
  useProjectManager: () => ({
    getProjectListing: vi.fn(),
    updateProject: vi.fn(),
    getProject: vi.fn(),
    deleteProject: projectManager.deleteProject,
    restoreProject: vi.fn(),
    permanentlyDeleteProject: projectManager.permanentlyDeleteProject,
    duplicateProject: vi.fn(),
    isLoading: worker.isLoading,
  }),
}));

vi.mock('#hooks/use-sessions.js', () => ({ useSessions: () => registry.actor }));

const { useProjects } = await import('#hooks/use-projects.js');

const listingQueryOptions = (): Record<string, unknown> => {
  useQuery.mockClear();
  renderHook(() => useProjects());
  return useQuery.mock.calls[0]![0];
};

describe('useProjects readiness', () => {
  afterEach(() => {
    worker.isLoading = false;
    query.isLoading = false;
    registry.reset();
  });

  /*
   * The worker window is the one shape that used to render `No projects yet`
   * over a live project: the query is disabled until the object store is up,
   * and a disabled query is not `isLoading`, so every consumer read "no
   * projects" from a listing that had not run once (P67).
   */
  it('reports loading across the window where its own query is disabled', () => {
    worker.isLoading = true;
    useQuery.mockClear();
    const { result } = renderHook(() => useProjects());

    expect(useQuery.mock.calls[0]![0]['enabled']).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  it('leaves loading to the query once the worker is up', () => {
    useQuery.mockClear();
    const { result } = renderHook(() => useProjects());

    expect(useQuery.mock.calls[0]![0]['enabled']).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('reports loading while the worker is up and its query is loading', () => {
    query.isLoading = true;
    useQuery.mockClear();
    const { result } = renderHook(() => useProjects());

    expect(useQuery.mock.calls[0]![0]['enabled']).toBe(true);
    expect(result.current.isLoading).toBe(true);
  });
});

describe('useProjects deletion', () => {
  afterEach(() => {
    registry.reset();
    vi.clearAllMocks();
  });

  it('closes a live project before trashing it so the live header drops with the row', async () => {
    registry.live('proj_live');
    const { result } = renderHook(() => {
      const { deleteProject } = useProjects();
      const liveCount = useSyncExternalStore(
        (listener) => {
          const subscription = registry.actor.subscribe(listener);
          return () => subscription.unsubscribe();
        },
        () => Object.keys(registry.actor.getSnapshot().context.refs).length,
      );
      return { deleteProject, header: `Live now · ${String(liveCount)} project` };
    });
    expect(result.current.header).toBe('Live now · 1 project');

    await act(async () => result.current.deleteProject('proj_live'));

    expect(result.current.header).toBe('Live now · 0 project');
    expect(registry.actor.getSnapshot().context.refs).not.toHaveProperty('proj_live');
    expect(registry.operations).toEqual(['close:proj_live', 'trash:proj_live']);
    expect(projectManager.deleteProject).toHaveBeenCalledExactlyOnceWith('proj_live');
  });

  it('closes a live project before permanently deleting it', async () => {
    registry.live('proj_live');
    const { result } = renderHook(() => useProjects());

    await act(async () => result.current.permanentlyDeleteProject('proj_live'));

    expect(registry.actor.getSnapshot().context.refs).not.toHaveProperty('proj_live');
    expect(registry.operations).toEqual(['close:proj_live', 'delete:proj_live']);
    expect(projectManager.permanentlyDeleteProject).toHaveBeenCalledExactlyOnceWith('proj_live');
  });
});

describe('useProjects listing query', () => {
  it('does not poll: worker filesystem events and cross-tab broadcasts drive invalidation', () => {
    expect(listingQueryOptions()).not.toHaveProperty('refetchInterval');
  });

  it('keeps a short stale window so rapid navigations reuse the last scan', () => {
    expect(listingQueryOptions()['staleTime']).toBe(3000);
  });

  it('leaves window-focus refetching at its default so a backgrounded tab refreshes on return', () => {
    expect(listingQueryOptions()).not.toHaveProperty('refetchOnWindowFocus');
  });
});
