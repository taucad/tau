import { useSyncExternalStore } from 'react';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatStorage } from '#types/chat-storage.types.js';
import { mock } from 'vitest-mock-extended';
import type { Chat } from '@taucad/chat';
import type {
  ProjectCommands,
  ProjectCommandsServices,
  ProjectLibraryChatSessions,
} from '#runtime/project-library-commands.js';
import type { ProjectLibraryWorker } from '#types/project-library-io.types.js';
import type { ProjectsInputs } from '#hooks/use-projects.js';

/** A chat projection as far as the catch-up reads it: caught up once its ledger reaches the log's end. */
type Projection = Readonly<{ ledger: Readonly<{ position: Readonly<{ cursor: number }> }>; endCursor: number }>;
type ProjectClosePlan = Awaited<ReturnType<ProjectLibraryChatSessions<Projection>['getProjectClosePlan']>>;
const isCaughtUp = (projection: Projection): boolean => projection.ledger.position.cursor >= projection.endCursor;

const { projectManager, query, registry, useQuery, worker, chats } = vi.hoisted(() => {
  const listeners = new Set<
    (snapshot: { context: { refs: Readonly<Record<string, Record<string, unknown>>> } }) => void
  >();
  let references: Readonly<Record<string, Record<string, unknown>>> = {};
  const operations: string[] = [];
  const queryState: { isLoading: boolean; data: unknown } = { isLoading: false, data: undefined };
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
      getProjectListing: vi.fn(async (): Promise<unknown> => undefined),
      getChatsForResource: vi.fn(async (): Promise<Array<{ id: string }>> => []),
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
      data: queryState.data,
      /* TanStack reports a *disabled* query as pending-but-not-loading, which is
       * the whole point of the readiness pin below. */
      isLoading: queryState.isLoading,
      error: undefined,
      refetch: vi.fn(),
    })),
    worker: { isLoading: false },
    chats: {
      observed: [] as string[],
      projection: undefined as { ledger: { position: { cursor: number } }; endCursor: number } | undefined,
      plan: { liveChatIds: [] as string[] },
      logs: new Map<string, string>(),
    },
  };
});

vi.mock('@tanstack/react-query', () => ({
  useQuery,
  useQueryClient: () => ({ invalidateQueries: vi.fn(), removeQueries: vi.fn() }),
}));

/* The quiescence check and the session close are the library's commands since A4a (row L7): the real ones, over the
 * registry and chat-store doubles below. */
/** The library's listing query, as `useProjectManager()` hands it down. */
const listingQuery = vi.hoisted(() => ({ queryKey: ['projects'], queryFn: async () => undefined }));

const commands = vi.hoisted(() => ({
  current: undefined as
    | Pick<ProjectCommands, 'verifyProjectQuiescent' | 'leaseQuiescentProject' | 'closeProjectSession'>
    | undefined,
}));

/* The headless half (W30): a log reading `running` holds a run that has not ended; the lease records its release. */
const leases = vi.hoisted(() => ({
  taken: [] as Array<Readonly<{ projectId: string; chatIds: readonly string[] }>>,
  releasedAfter: undefined as readonly string[] | undefined,
}));
vi.mock('@taucad/agent-host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  unsettledLogRun: (bytes: Uint8Array<ArrayBuffer>) =>
    new TextDecoder().decode(bytes) === 'running' ? { runId: 'run_1', state: 'running' } : undefined,
}));
vi.mock('@taucad/agent-host/browser', () => ({
  leaseChatLogs: async (input: { projectId: string; chatIds: readonly string[] }) => {
    leases.taken.push(input);
    return {
      status: 'held',
      lost: () => false,
      release: () => {
        leases.releasedAfter = [...registry.operations];
      },
    };
  },
}));

const projectManagerDouble = await (async () => {
  const commandsModule = await import('#runtime/project-library-commands.js');
  const notCalled = async (): Promise<never> => {
    throw new Error('not called in this test');
  };
  const chatStore = mock<ProjectLibraryChatSessions<Projection>>({
    observedChatIdsOf: () => chats.observed,
    getProjection: () => (chats.projection === undefined ? undefined : mock<Projection>(chats.projection)),
    getProjectClosePlan: async () => mock<ProjectClosePlan>(chats.plan),
  });
  const chatSource = mock<ChatStorage>({
    getChatsForResource: async () => {
      const stored = await projectManager.getChatsForResource();
      return stored.map(({ id }) => mock<Chat>({ id, name: id }));
    },
    readChatLog: async (chatId) => new TextEncoder().encode(chats.logs.get(chatId) ?? ''),
  });
  const built = new commandsModule.ProjectCommands<ProjectLibraryWorker, Projection>({
    services: mock<ProjectCommandsServices<Projection>>({ isCaughtUp }),
    facade: notCalled,
    chatStore: () => undefined,
    readChats: async (operation) => operation(chatSource),
    readiedWorker: notCalled,
    whenDiscoveryReady: notCalled,
    whenReplaysDrained: notCalled,
    discover: notCalled,
    beginMutation: notCalled,
    replayForPerson: notCalled,
    invalidateProjectListing: notCalled,
    invalidateListing: () => undefined,
    invalidateProject: () => undefined,
    forgetProject: () => undefined,
    noteLibraryChanged: () => undefined,
    sessions: () => registry.actor,
    chatSessions: () => chatStore,
  });
  commands.current = {
    verifyProjectQuiescent: built.verifyProjectQuiescent,
    leaseQuiescentProject: built.leaseQuiescentProject,
    closeProjectSession: built.closeProjectSession,
  };
  /* The project manager as `useProjectManager()` hands it down on each render: only the members these rows read. */
  return (): ProjectsInputs['projectManager'] =>
    ({
      ...commands.current,
      getProjectListing: projectManager.getProjectListing,
      getChatsForResource: projectManager.getChatsForResource,
      updateProject: vi.fn(),
      getProject: vi.fn(),
      deleteProject: projectManager.deleteProject,
      restoreProject: vi.fn(),
      permanentlyDeleteProject: projectManager.permanentlyDeleteProject,
      duplicateProject: vi.fn(),
      isLoading: worker.isLoading,
      projectListingQuery: listingQuery,
    }) as unknown as ProjectsInputs['projectManager'];
})();

/* The chat session store stops a project's live composer records; the view exceptions drop its rows. */
const chatSessions: ProjectsInputs['chatSessions'] = {
  removeProject: async (projectId: string) => {
    registry.operations.push(`remove-composers:${projectId}`);
  },
};
const viewExceptions: ProjectsInputs['viewExceptions'] = { dropProject: () => undefined };

const { useProjects: useProjectListing } = await import('#hooks/use-projects.js');

/** The hook as the app's binding calls it, over the doubles above. */
// oxlint-disable-next-line @typescript-eslint/explicit-module-boundary-types -- the hook's inferred result
const useProjects = (options?: Parameters<typeof useProjectListing>[1]) =>
  useProjectListing({ projectManager: projectManagerDouble(), chatSessions, viewExceptions }, options);

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
    chats.observed = [];
    chats.projection = undefined;
    chats.plan = { liveChatIds: [] };
    chats.logs.clear();
    leases.taken.length = 0;
    leases.releasedAfter = undefined;
    projectManager.getChatsForResource.mockResolvedValue([]);
    vi.clearAllMocks();
  });

  /* #2303: a closed project's chats are read from their logs under a lease; it is never asked to be opened. */
  it('permanently deletes a closed project whose chat logs hold no unended run, under their lease', async () => {
    projectManager.getChatsForResource.mockResolvedValue([{ id: 'settled-chat' }]);
    const { result } = renderHook(() => useProjects());
    await act(async () => result.current.permanentlyDeleteProject('proj_closed'));
    /* Verified once, then held through the delete. */
    expect(leases.taken).toEqual([
      { projectId: 'proj_closed', chatIds: ['settled-chat'] },
      { projectId: 'proj_closed', chatIds: ['settled-chat'] },
    ]);
    expect(registry.operations).toEqual(['remove-composers:proj_closed', 'delete:proj_closed']);
    /* Released only once the delete is done. */
    expect(leases.releasedAfter).toEqual(['remove-composers:proj_closed', 'delete:proj_closed']);
  });

  it('refuses permanent deletion of a closed project whose chat log holds a run that has not ended', async () => {
    projectManager.getChatsForResource.mockResolvedValue([{ id: 'running-chat' }]);
    chats.logs.set('running-chat', 'running');
    const { result } = renderHook(() => useProjects());
    await expect(result.current.permanentlyDeleteProject('proj_closed')).rejects.toThrow(
      /running-chat" has a run that has not ended/u,
    );
    expect(projectManager.permanentlyDeleteProject).not.toHaveBeenCalled();
  });

  it('refuses Trash while an observed run is continuing, before closing the session', async () => {
    registry.live('proj_live');
    projectManager.getChatsForResource.mockResolvedValue([{ id: 'unseen-chat' }]);
    chats.observed = ['unseen-chat'];
    chats.projection = { ledger: { position: { cursor: 1 } }, endCursor: 1 };
    chats.plan = { liveChatIds: ['unseen-chat'] };
    const { result } = renderHook(() => useProjects());
    await expect(result.current.deleteProject('proj_live')).rejects.toThrow(/running/u);
    expect(registry.operations).toEqual([]);
    expect(projectManager.deleteProject).not.toHaveBeenCalled();
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
    // Live composer records stop before their directory goes, so none is written back (D11).
    expect(registry.operations).toEqual(['close:proj_live', 'remove-composers:proj_live', 'delete:proj_live']);
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

  /* Two keys meant two whole-workspace discovery passes per navigation (W21 / D19). */
  it('reads one key whichever scope the caller asks for', () => {
    useQuery.mockClear();
    renderHook(() => useProjects());
    renderHook(() => useProjects({ scope: 'all' }));

    const keys = useQuery.mock.calls.map((call) => JSON.stringify(call[0]['queryKey']));
    expect(new Set(keys).size).toBe(1);
  });

  it('filters the shared listing to the scope it is asked for', () => {
    const entry = (id: string, deletedAt?: number) => ({
      projectId: id,
      manifest: { name: id },
      library: { lastActivityAt: 1, ...(deletedAt === undefined ? {} : { deletedAt }) },
      locator: { backend: 'indexeddb' },
    });
    query.data = {
      projects: [entry('proj_live'), entry('proj_trashed', 5)],
      conflicts: [],
      recoveries: [],
      workspaceBindingRepairs: [],
    };

    const visible = renderHook(() => useProjects());
    const trash = renderHook(() => useProjects({ scope: 'trash' }));
    const all = renderHook(() => useProjects({ scope: 'all' }));

    expect(visible.result.current.projects.map(({ id }) => id)).toEqual(['proj_live']);
    /* #2305: the Trash is the trashed projects alone, never the live ones beside them. */
    expect(trash.result.current.projects.map(({ id }) => id)).toEqual(['proj_trashed']);
    expect(all.result.current.projects.map(({ id }) => id)).toEqual(['proj_live', 'proj_trashed']);
    query.data = undefined;
  });

  /* D9: the hook queries with the library's listing query, so the library alone writes the listing. */
  it("queries the listing with the library's own key and function", () => {
    const options = listingQueryOptions();
    expect(options['queryKey']).toBe(listingQuery.queryKey);
    expect(options['queryFn']).toBe(listingQuery.queryFn);
  });
});
