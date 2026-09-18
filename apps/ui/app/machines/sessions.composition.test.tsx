/**
 * The registry, its sessions and the **real** project route composed together
 * (S48, R3).
 *
 * The unit suites drive each machine on its own. This one renders
 * `ProjectSessionsHost` — the component the app root mounts — over the real
 * `sessions-store` singleton, because the invariants W19 owes are about the
 * composition: navigating opens and never closes (I22), a session's resources
 * die with it *including the project on screen* (I23, R1), a run reports to its
 * own project after the person has moved on (R2), a policy never touches a
 * running, dirty or unpushed project (I24, I25), a refusal is not permanent
 * (R6), the budget makes room (P47), and quit completes every closing before it
 * quiesces (D31).
 *
 * Only the leaves are mocked, and each one is the seam the session reads:
 * the file-manager provider (which is what "this project's resources exist"
 * means in the tree), the project actor, the revision client and the chat
 * store. The app host, route gate, binding and retained-set rendering are real.
 *
 * The registry is a module singleton by design, so each test uses its own
 * project ids and `afterEach` closes what it opened. The quit pin is last: a
 * quiesced registry is final.
 */

/* oxlint-disable eslint/no-await-in-loop, eslint/no-restricted-imports -- this composition suite is the boundary where ordered machine scripts meet their real hooks. */

import { createContext, useContext, useEffect } from 'react';
import { act, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router';
import { createActor, fromCallback, fromPromise } from 'xstate';
import type { ActorRefFrom, EventObject } from 'xstate';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { projectToManifest } from '@taucad/types';
import type { ProjectRouteAccess } from '#hooks/use-project-manager.js';

import { SessionsProvider } from '#hooks/use-sessions.js';
import { sessionsActor } from '#services/sessions-store.js';
import { browserLiveProjectBudget, sessionsMachine } from '#machines/sessions.machine.js';
import type { SessionsMachineEmitted } from '#machines/sessions.machine.js';
import { projectSessionIdleWindowMilliseconds, projectSessionMachine } from '#machines/project-session.machine.js';
import { useChatSidebarStatus, useProjectSidebarRow } from '#hooks/use-sidebar-status.js';
import { useProjectRouteState } from '#routes/w.$workspace.$project/project-route-state.js';
import { graphicsMachine } from '#machines/graphics.machine.js';

const {
  workerFrames,
  workerRef,
  serviceCalls,
  mounted,
  getProjectRouteAccess,
  chatStore,
  revision,
  revisionClient,
  editor,
  rootCalls,
  revisionProjection,
  installedCheckoutRoutes,
  revisionClientLifecycle,
  projectProviderInputs,
} = vi.hoisted(() => {
  const frames: Array<{ type: string; projectId?: string }> = [];
  const calls: string[] = [];
  const live: string[] = [];
  /*
   * The editor, as far as the route's flush gate reads it: a `flushNow` and a
   * `storing.idle` a test decides the timing of. The route awaits this actor
   * before it lets a person leave a project (S48(12)), so a stub that is
   * always idle can never show that it waited.
   */
  const editorListeners = new Set<(snapshot: unknown) => void>();
  const editorState = { idle: true };
  const revisionListeners = new Set<() => void>();
  let revisionStatus = {
    dirty: false,
    branch: 'main',
    sync: { state: 'noRemote' as 'backedUp' | 'checking' | 'noRemote', pendingCount: 0 },
  };
  const editorSnapshot = (): unknown => ({
    context: { viewSettings: {} },
    status: 'active',
    matches: () => editorState.idle,
  });
  const editorActor = {
    send: (event: { type: string }) => {
      calls.push(`editor:${event.type}`);
    },
    getSnapshot: editorSnapshot,
    subscribe: (observer: ((snapshot: unknown) => void) | { next?: (snapshot: unknown) => void }) => {
      const next = typeof observer === 'function' ? observer : (observer.next ?? (() => undefined));
      editorListeners.add(next);
      return {
        unsubscribe: () => {
          editorListeners.delete(next);
        },
      };
    },
  };
  return {
    editor: {
      ref: editorActor,
      /** What the editor is doing, and who is told when it changes. */
      setIdle: (idle: boolean) => {
        editorState.idle = idle;
        if (idle) {
          calls.push('editor:stored');
        }
        for (const next of editorListeners) {
          next(editorSnapshot());
        }
      },
      reset: () => {
        editorState.idle = true;
        editorListeners.clear();
      },
    },
    /** Every `setRoot` the workbench's file manager was asked for (S48(14)). */
    rootCalls: [] as Array<{ type: string; path?: string; projectId?: string }>,
    /** The revision projection the workbench follows; a test moves it. */
    revisionProjection: { current: undefined as unknown },
    /** What the checkout route table currently holds. */
    installedCheckoutRoutes: { current: '' },
    revisionClientLifecycle: [] as string[],
    projectProviderInputs: [] as Array<{
      projectId: string;
      requestedChatId: string | undefined;
      createdChatId: string | undefined;
    }>,
    workerFrames: frames,
    serviceCalls: calls,
    mounted: live,
    workerRef: { current: undefined as Worker | undefined },
    getProjectRouteAccess: vi.fn(),

    chatStore: {
      get: () => ({
        persistenceActorRef: {
          getSnapshot: () => ({ matches: () => true }),
          subscribe: () => ({ unsubscribe: () => undefined }),
        },
      }),
      stopRun: vi.fn(),
      setProjectSession: vi.fn(),
      setFocusedProject: vi.fn(),
    },
    revision: {
      reset: () => {
        revisionStatus = { dirty: false, branch: 'main', sync: { state: 'noRemote', pendingCount: 0 } };
        revisionListeners.clear();
      },
      setSync: (state: typeof revisionStatus.sync.state, pendingCount = 0) => {
        revisionStatus = { ...revisionStatus, sync: { state, pendingCount } };
        for (const listener of revisionListeners) {
          listener();
        }
      },
    },
    revisionClient: {
      status: () => revisionStatus,
      subscribe: (listener: () => void) => {
        revisionListeners.add(listener);
        return () => {
          revisionListeners.delete(listener);
        };
      },
      quiesce: async () => {
        calls.push('quiesce');
      },
    },
  };
});

workerRef.current = mock<Worker>({
  postMessage: (frame: { type: string; projectId?: string }) => {
    workerFrames.push(frame);
  },
});

/* The provider mirrors the app's shared worker into the store; in jsdom there
 * is no `SharedWorkerContext`, so the one hook it reads is the seam to stand
 * in for. Compute admission is then the real path, on a recording worker. */
vi.mock('#hooks/use-file-manager.js', () => ({
  useSharedFileManagerWorker: () => workerRef.current,
  SharedWorkerGate: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  /* This subtree *is* the project's resources: mounted means they exist. */
  HomeFileManagerProvider: ({ children, projectId }: React.PropsWithChildren<{ projectId: string }>) => {
    useEffect(() => {
      mounted.push(`mount:${projectId}`);
      return () => {
        mounted.push(`unmount:${projectId}`);
      };
    }, [projectId]);
    return <div data-testid={`subtree-${projectId}`}>{children}</div>;
  },
  useFileManager: () => ({
    fileManagerRef: {
      send: (event: { type: string; path?: string; projectId?: string }) => {
        rootCalls.push(event);
      },
      getSnapshot: () => ({ context: {}, matches: (value: string) => value === 'ready' }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
    workspace: {
      syncProjectRoots: async () => {
        rootCalls.push({ type: 'syncProjectRoots' });
      },
    },
  }),
  useOptionalFileManager: () => undefined,
}));

/* Module scope: the route's session effect is keyed on this identity, so a
 * fresh object per render would re-run it forever. */
const parameterService = {
  close: async () => undefined,
  subscribeUnsavedDrafts: () => () => undefined,
};

/* One context object and one `viewGraphics` Map per project, both for the life of the suite: the
 * real provider is per project, and a fresh Map per snapshot read would hand React a new value on
 * every render. A test that needs a live view puts it in `viewGraphicsOf(projectId)`. */
const projectContexts = new Map<string, unknown>();
const viewGraphicsByProject = new Map<string, Map<string, ActorRefFrom<typeof graphicsMachine>>>();
const viewGraphicsOf = (projectId: string): Map<string, ActorRefFrom<typeof graphicsMachine>> => {
  const existing = viewGraphicsByProject.get(projectId);
  if (existing) {
    return existing;
  }
  const created = new Map<string, ActorRefFrom<typeof graphicsMachine>>();
  viewGraphicsByProject.set(projectId, created);
  return created;
};
const StubProjectContext = createContext('');
const projectContextOf = (projectId: string): unknown => {
  const existing = projectContexts.get(projectId);
  if (existing) {
    return existing;
  }
  const created = {
    projectId: 'unused',
    parameterService,
    viewGraphics: viewGraphicsOf(projectId),
    projectRef: {
      send: (event: { type: string }) => {
        serviceCalls.push(`project:${event.type}`);
      },
      getSnapshot: () => ({
        context: { project: { id: 'p' }, geometryUnits: new Map(), viewGraphics: viewGraphicsOf(projectId) },
        matches: (value: unknown) => JSON.stringify(value) === JSON.stringify({ ready: { storing: 'idle' } }),
      }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
    /* `ProjectPersistenceGuard` awaits this editor reaching `storing.idle`
     * before the route may leave a project; an editor that never answers is a
     * navigation that never completes. */
    editorRef: editor.ref,
  };
  projectContexts.set(projectId, created);
  return created;
};
vi.mock('#hooks/use-project.js', () => ({
  ProjectProvider: ({
    children,
    projectId,
    requestedChatId,
    createdChatId,
  }: React.PropsWithChildren<{ projectId: string; requestedChatId?: string; createdChatId?: string }>) => {
    projectProviderInputs.push({ projectId, requestedChatId, createdChatId });
    return (
      <StubProjectContext.Provider value={projectId}>
        <div>{children}</div>
      </StubProjectContext.Provider>
    );
  },
  useProject: () => projectContextOf(useContext(StubProjectContext)),
}));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));

/* One object for the life of the suite: a `useProjectManager()` that returns a
 * fresh object on every render re-runs the route's load effect forever. */
const projectManager = { getProjectRouteAccess, restoreProject: vi.fn() };
vi.mock('#hooks/use-project-manager.js', () => ({ useProjectManager: () => projectManager }));
vi.mock('#hooks/use-project-slug-route.js', () => ({
  useProjectIdBySlugs: (_workspace: string, project: string) =>
    project === 'resolving'
      ? { status: 'resolving' }
      : project === '' || project === 'missing'
        ? { status: 'not-found' }
        : { status: 'resolved', value: project },
  useCanonicalProjectUrlCorrection: () => undefined,
}));
vi.mock('#hooks/use-revision-status.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRevisionClient: () => revisionClient,
  useRevisionClientLifecycle: () => {
    useEffect(() => {
      revisionClientLifecycle.push('mount');
      return () => {
        revisionClientLifecycle.push('close');
      };
    }, []);
    return revisionClient;
  },
  peekRevisionClient: () => revisionClient,
  useRevisionStatus: () => revisionProjection.current,
  useRevisionCommands: () => ({ connectRemote: async () => undefined }),
}));
/* The checkout routes are storage, and storage is a leaf here: what S48(14) is
 * about is the workbench following the selection, not where the route table is
 * persisted. */
vi.mock('#filesystem/handle-store.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProjectRootConfigs: async () => ({
    projects: [{ projectId: 'unused', providerBasePath: 'projects/unused' }],
    roots: [],
  }),
  /* The real one answers *whether the set changed*, and the workbench skips the
   * re-issue when it did not; a stub that always says yes would hide a
   * re-issue-per-render regression. */
  setCheckoutRootConfigs: (routes: ReadonlyArray<{ readonly checkoutId: string }>) => {
    const next = routes.map((route) => route.checkoutId).join(' ');
    if (next === installedCheckoutRoutes.current) {
      return false;
    }
    installedCheckoutRoutes.current = next;
    rootCalls.push({ type: 'checkoutRoutes', path: next });
    return true;
  },
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => chatStore }));
vi.mock('#hooks/use-flush-on-close.js', () => ({ useFlushOnClose: () => undefined }));
vi.mock('#hooks/use-monaco-model-service.js', () => ({
  MonacoModelServiceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#hooks/use-webgl-context-tracker.js', () => ({
  WebglContextTrackerProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/revision-save-shortcut.js', () => ({ RevisionSaveShortcut: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-provider.js', () => ({
  RevisionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/project-chat-run-settlement.js', () => ({
  ProjectChatRunSettlement: () => null,
}));
vi.mock('#routes/w.$workspace.$project/project-command-items.js', () => ({ ProjectCommandPaletteItems: () => null }));
vi.mock('#routes/w.$workspace.$project/project-export-action.js', () => ({ ProjectExportAction: () => null }));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({ ProjectShareRouteIntent: () => null }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  ProjectWorkspaceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface.js', () => ({ ChatInterface: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-conflict-chat.js', () => ({ RevisionConflictChat: () => null }));
/* W2: the route's non-editor states all render through one notice now. This
 * suite is about the registry, so the notice stands in as its kind. */
vi.mock('#routes/w.$workspace.$project/project-route-notices.js', async () => {
  const { createContext } = await import('react');
  return {
    ProjectRouteRetryContext: createContext<() => void>(() => undefined),
    ProjectRouteNotice: ({ state }: { readonly state: { kind: string } }) => <p>Notice: {state.kind}</p>,
  };
});
vi.mock('#routes/w.$workspace.$project/revision-restore.js', () => ({ RevisionRestore: () => null }));
/* Not mocked away for the route's own rows either: with no projection the real
 * component does nothing, and S48(14) below renders it against one. */
const { WorkbenchCheckoutRoot } = await import('#routes/w.$workspace.$project/workbench-checkout-root.js');
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({ RevisionOutcomes: () => null }));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  ChatWorkspaceAuthorityProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

const routeModule = await import('#routes/w.$workspace.$project/project-route.js');
/* The live-session subtree is behind a `lazy()` boundary (W21). Importing it here settles that
 * boundary in the first `act` flush, so a rendered route is complete when `settle()` returns. */
await import('#routes/w.$workspace.$project/project-live-sessions.js');

const ready = (projectId: string): ProjectRouteAccess => ({
  status: 'ready',
  project: projectToManifest({
    id: projectId,
    name: projectId,
    description: '',
    tags: [],
    assets: { main: { entryPath: 'main.ts' } },
  }),
});

const emitted: SessionsMachineEmitted[] = [];

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Let already-queued actor work reach an observable predicate. */
const settle = async (
  predicate: () => boolean = () =>
    Object.values(sessionsActor.getSnapshot().context.refs).every((ref) => {
      const snapshot = ref.getSnapshot();
      return (
        !snapshot.matches('opening') &&
        !snapshot.matches({ closing: 'cancellingRuns' }) &&
        !snapshot.matches({ closing: 'flushingProducers' }) &&
        !snapshot.matches({ closing: 'flushing' }) &&
        !snapshot.matches({ closing: 'releasing' })
      );
    }),
): Promise<void> => {
  await act(async () => {
    await Promise.resolve();
    await vi.waitFor(() => {
      expect(predicate()).toBe(true);
    });
  });
};

/** Send to the registry the way the app does — inside React's act scope. */
const send = async (event: Parameters<typeof sessionsActor.send>[0]): Promise<void> => {
  await act(async () => {
    sessionsActor.send(event);
    await Promise.resolve();
  });
};

const liveProjectIds = (): readonly string[] => Object.keys(sessionsActor.getSnapshot().context.refs);
const sessionOf = (projectId: string) => sessionsActor.getSnapshot().context.refs[projectId];

/** Render the real route at one project and let it open. */
const renderRoute = async (
  projectId: string,
): Promise<{ rerender: (next: string) => Promise<void>; unmount: () => void }> => {
  /* `SessionsProvider` hosts the budget dialog (R5), whose body reads the
   * project list when a refusal fires; the app's root client is shared, so the
   * composition needs one too. */
  const at = (id: string): React.JSX.Element => (
    <QueryClientProvider client={queryClient}>
      <SessionsProvider>
        <routeModule.ProjectRouteProviders projectId={id} />
      </SessionsProvider>
    </QueryClientProvider>
  );
  const view = render(at(projectId));
  await settle();
  return {
    rerender: async (next: string) => {
      view.rerender(at(next));
      await settle();
    },
    unmount: () => {
      view.unmount();
    },
  };
};

let navigateRoute: ReturnType<typeof useNavigate> | undefined;

let currentSearch = '';

function NavigationProbe(): undefined {
  const navigate = useNavigate();
  currentSearch = useLocation().search;
  useEffect(() => {
    navigateRoute = navigate;
    return () => {
      navigateRoute = undefined;
    };
  }, [navigate]);
  return undefined;
}

/** Render the app-owned session host with real project and non-project navigation. */
/*
 * W2: the route component below the outlet is what picks between the editor
 * and a notice, and it reads the one state the gate publishes. The real
 * `ProjectChatRoute` needs the whole chat stack; this probe reads the same
 * context, so these tests can assert what the gate derived.
 */
const RouteStateProbe = (): React.JSX.Element => (
  <span data-testid='route-state'>{useProjectRouteState()?.kind ?? 'none'}</span>
);

const renderRouteFamily = async (
  projectId: string,
  initialEntry = `/w/workspace/${projectId}`,
): Promise<{ navigate: (target: string) => Promise<void>; unmount: () => void }> => {
  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NavigationProbe />
      <QueryClientProvider client={queryClient}>
        <SessionsProvider>
          <routeModule.ProjectSessionsHost>
            <Routes>
              <Route path='/' element={<div>Home</div>} />
              <Route
                path='/w/:workspace/:project'
                element={
                  <>
                    <Link to='/projects'>Projects</Link>
                    <RouteStateProbe />
                  </>
                }
              />
              <Route path='/projects' element={<div>Project library</div>} />
            </Routes>
          </routeModule.ProjectSessionsHost>
        </SessionsProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  await settle();
  return {
    navigate: async (target) => {
      await act(async () => {
        await navigateRoute?.(target);
      });
      await settle();
    },
    unmount: view.unmount,
  };
};

beforeEach(() => {
  workerFrames.length = 0;
  serviceCalls.length = 0;
  mounted.length = 0;
  rootCalls.length = 0;
  editor.reset();
  revision.reset();
  revisionProjection.current = undefined;
  installedCheckoutRoutes.current = '';
  revisionClientLifecycle.length = 0;
  projectProviderInputs.length = 0;
  for (const views of viewGraphicsByProject.values()) {
    views.clear();
  }
  navigateRoute = undefined;
  emitted.length = 0;
  getProjectRouteAccess.mockReset();
  getProjectRouteAccess.mockImplementation(async (projectId: string) => ready(projectId));
  for (const type of ['liveSetChanged', 'budgetRefused', 'quiesced'] as const) {
    sessionsActor.on(type, (event) => emitted.push(event));
  }
});

afterEach(async () => {
  /* A refused open is remembered until somebody makes room (R8); drop it so
   * one test's refusal cannot open a project inside the next one. */
  if (sessionsActor.getSnapshot().status === 'active') {
    await send({ type: 'cancelPendingOpen' });
  }
  for (const [projectId, ref] of Object.entries(sessionsActor.getSnapshot().context.refs)) {
    if (ref.getSnapshot().status !== 'active') {
      continue;
    }
    await send({ type: 'close', projectId, reason: 'user' });
    if (ref.getSnapshot().status === 'active' && !ref.getSnapshot().matches('closed')) {
      await act(async () => {
        ref.send({ type: 'confirmClose' });
        await Promise.resolve();
      });
    }
  }
  await settle();
  vi.restoreAllMocks();
});

/* The registry is a module singleton, and the quit pin inside the suite below
 * is final for it (a quiesced registry never opens again), so every row that
 * needs a live registry runs before it. */
/*
 * S48(11) is not here, and is not missing.
 *
 * "All fifteen agent-state rows render glyph and description with `getByRole`
 * names" is W20's `it.each` over `agentStateRows` in
 * `apps/ui/app/hooks/use-sidebar-status.test.tsx` — eleven run × read rows,
 * each driven through a real `chatSessionMachine` and rendered through the real
 * `ChatStatusGlyph`; the two revision rows are that file's branch-chip and
 * dirty-pip pins, and the two sync rows are project-row facts under P64 and are
 * pinned on the project row there (W20-a2 §1, R11). Restating the table here
 * would give the vocabulary two owners that could drift apart, which is the one
 * thing a composition suite must not do.
 */

/**
 * S48(12), seam-unit ordering half — a controlled editor seam resolves before
 * the real route lets its project go. The real revision/port bytes half lives
 * in `packages/revisions/src/composition.test.ts`.
 *
 * The route holds navigation on `ProjectPersistenceGuard`'s registration
 * (`project-route.tsx:361`): the person may not land on the next project until
 * this one's editor reaches `storing.idle`. The close flush that takes the
 * `close` revision (`flushSync` → `RevisionClient.quiesce()`) comes after. What
 * this asserts is the order, with the editor's answer under the test's control,
 * so "it happened to be idle" cannot pass for "it was waited for".
 *
 * The bytes half of S48(12) — that the edit buffered last is *inside* the close
 * revision — is host-neutral and lives in `packages/revisions/src/composition.test.ts`;
 * the `hidden` → `saveRevision { trigger: 'close' }` and precomputed-only
 * `pagehide` wire are pinned at their owner in
 * `apps/ui/app/hooks/use-revision-status.test.tsx` (W13, P32, A38).
 */
describe('sessions composition — the quit flush order (S48(12))', () => {
  it('holds the next project until the editor has stored, then takes the close revision', async () => {
    const view = await renderRoute('flush-a');
    expect(mounted).toEqual(['mount:flush-a']);

    /* A write is in flight when the person navigates. */
    editor.setIdle(false);
    await view.rerender('flush-b');

    /* Nothing of the next project exists yet: the route is still awaiting the
     * editor, and the close flush has not run either. */
    expect(mounted).toEqual(['mount:flush-a']);
    expect(serviceCalls).toEqual(['editor:flushNow']);

    await act(async () => {
      editor.setIdle(true);
      await Promise.resolve();
    });
    await settle();

    expect(mounted).toContain('mount:flush-b');
    /* And only now may the project be let go, which is what takes the `close`
     * revision: the store resolves before the cut, never beside it. */
    await send({ type: 'close', projectId: 'flush-a', reason: 'user' });
    await settle();

    expect(serviceCalls).toEqual([
      'editor:flushNow',
      'editor:stored',
      'project:flushNow',
      'editor:flushNow',
      'quiesce',
    ]);
    view.unmount();
  });
});

/**
 * S48(13) / V24 — a row wakes on its own machine.
 *
 * W20 found that a render *count* cannot discriminate here: `useSyncExternalStore`
 * bails on an unchanged key, so a row that subscribes to the whole sidebar
 * still renders once under `act()` batching. Sibling isolation is the shape
 * that can fail, and this is it at composition scale: eight live projects, each
 * a real `project-session`, with real `chat-session` children — one chat moves,
 * and every other row stays asleep.
 */
describe('sessions composition — sidebar rows across eight live projects (S48(13), V24)', () => {
  it('wakes the moving chat row and its own project row, and no sibling', async () => {
    const view = await renderRoute('row-0');
    for (let index = 1; index < browserLiveProjectBudget; index += 1) {
      await send({ type: 'open', projectId: `row-${String(index)}` });
    }
    await settle();
    const projectIds = Array.from({ length: browserLiveProjectBudget }, (_, index) => `row-${String(index)}`);
    expect(liveProjectIds()).toEqual(projectIds);

    /* One chat per project, spawned the way the store spawns them. */
    for (const projectId of projectIds) {
      await act(async () => {
        sessionOf(projectId)?.send({ type: 'openChat', chatId: `chat-${projectId}` });
        await Promise.resolve();
      });
    }

    const renders: string[] = [];

    function ProjectRow({ projectId }: { readonly projectId: string }): React.JSX.Element {
      renders.push(`project:${projectId}`);
      const row = useProjectSidebarRow(projectId);
      return <span>{row.glyph}</span>;
    }

    function ChatRow({ projectId }: { readonly projectId: string }): React.JSX.Element {
      renders.push(`chat:${projectId}`);
      const status = useChatSidebarStatus(projectId, `chat-${projectId}`);
      return <span>{status?.state ?? 'none'}</span>;
    }

    const sidebar = render(
      <QueryClientProvider client={queryClient}>
        <SessionsProvider>
          <ul>
            {projectIds.map((projectId) => (
              <li key={projectId}>
                <ProjectRow projectId={projectId} />
                <ChatRow projectId={projectId} />
              </li>
            ))}
          </ul>
        </SessionsProvider>
      </QueryClientProvider>,
    );
    await settle();
    renders.length = 0;

    /* One chat starts streaming. */
    const moved = sessionOf('row-3')?.getSnapshot().context.chatRefs['chat-row-3'];
    await act(async () => {
      moved?.send({ type: 'runLifecycle', phase: 'running' });
      await Promise.resolve();
    });

    expect(renders.toSorted()).toEqual(['chat:row-3', 'project:row-3']);
    sidebar.unmount();
    view.unmount();
  });
});

describe('sessions composition — host-attested chat completion (P71)', () => {
  it('keeps an edit made after lifecycle completion out of done until turn.finalized', async () => {
    const view = await renderRoute('finishing-project');
    const session = sessionOf('finishing-project');
    await act(async () => {
      session?.send({ type: 'openChat', chatId: 'finishing-chat' });
      await Promise.resolve();
    });
    const chat = session?.getSnapshot().context.chatRefs['finishing-chat'];

    function ChatRow(): React.JSX.Element {
      const status = useChatSidebarStatus('finishing-project', 'finishing-chat');
      return <span>{status?.state ?? 'none'}</span>;
    }

    const row = render(<ChatRow />);
    await act(async () => {
      chat?.send({ type: 'runLifecycle', phase: 'running', runId: 'run-finishing' });
      chat?.send({ type: 'runLifecycle', phase: 'completed', runId: 'run-finishing' });
      /* This is the person's edit in the settlement window. */
      chat?.send({ type: 'dirtyChanged', dirty: true });
      await Promise.resolve();
    });

    expect(row.getByText('finishing')).toBeInTheDocument();
    expect(row.queryByText('done')).not.toBeInTheDocument();

    await act(async () => {
      chat?.send({ type: 'turnFinalizedObserved', runId: 'run-finishing', branch: 'main' });
      await Promise.resolve();
    });

    expect(row.getByText('done')).toBeInTheDocument();
    row.unmount();
    view.unmount();
  });
});

describe('sessions composition', () => {
  it('keeps a project live across navigation away and back (pin a, I22)', async () => {
    const view = await renderRoute('pin-a-1');
    const first = sessionOf('pin-a-1');
    const firstChildren = first?.getSnapshot().context;
    expect(firstChildren?.computeRef).toBeDefined();

    await view.rerender('pin-a-2');
    await view.rerender('pin-a-1');

    const back = sessionOf('pin-a-1');
    expect(back).toBe(first);
    expect(back?.getSnapshot().context.computeRef).toBe(firstChildren?.computeRef);
    expect(back?.getSnapshot().context.fileManagerRef).toBe(firstChildren?.fileManagerRef);
    /* The kernel is not rebooted on return: compute was admitted once and
     * never released while the project stayed live (V21). */
    expect(workerFrames.filter((frame) => frame.projectId === 'pin-a-1')).toEqual([
      { type: 'computeStoreAdmission', projectId: 'pin-a-1' },
    ]);
    /* And the subtree that holds its file manager never unmounted. */
    expect(mounted.filter((entry) => entry.endsWith('pin-a-1'))).toEqual(['mount:pin-a-1']);
    expect(liveProjectIds()).toEqual(['pin-a-1', 'pin-a-2']);
    view.unmount();
  });

  /* R6: the write-side host is mounted beside `ProjectPersistenceGuard`, above the `focused ?` gate.
   * Move it into the gate -- or back into the viewer -- and a project the person navigated away from
   * silently stops persisting what its own actors hold, with every other row still green. */
  it('keeps writing the view settings of a live project that is not focused', async () => {
    const graphicsRef = createActor(
      graphicsMachine.provide({ actors: { probeWebGpu: fromPromise(async () => false) } }),
      { input: {} },
    ).start();
    viewGraphicsOf('pin-unfocused-1').set('view-1', graphicsRef);

    const view = await renderRoute('pin-unfocused-1');
    await view.rerender('pin-unfocused-2');
    expect(liveProjectIds()).toEqual(['pin-unfocused-1', 'pin-unfocused-2']);
    serviceCalls.length = 0;

    await act(async () => {
      graphicsRef.send({ type: 'setGridVisibility', payload: false });
      await Promise.resolve();
    });

    expect(serviceCalls).toContain('editor:updateViewSettings');
    graphicsRef.stop();
    view.unmount();
  });

  it('unmounts the focused project when its session closes (pin f, R1/I23)', async () => {
    const view = await renderRoute('pin-f');
    expect(mounted).toEqual(['mount:pin-f']);
    expect(workerFrames).toEqual([{ type: 'computeStoreAdmission', projectId: 'pin-f' }]);

    /* The 30-minute idle policy, reachable with no W20 verb. */
    await send({ type: 'idleExpired', projectId: 'pin-f' });
    await settle();

    expect(liveProjectIds()).not.toContain('pin-f');
    /* Its resources go with it, even though the person is looking at it. */
    expect(mounted).toEqual(['mount:pin-f', 'unmount:pin-f']);
    expect(workerFrames).toEqual([
      { type: 'computeStoreAdmission', projectId: 'pin-f' },
      { type: 'computeStoreRelease', projectId: 'pin-f' },
    ]);
    view.unmount();
  });

  it('closes the least recently touched idle project for a ninth open (pin b, P47)', async () => {
    const view = await renderRoute('pin-b-0');
    for (let index = 1; index < browserLiveProjectBudget; index += 1) {
      await send({ type: 'open', projectId: `pin-b-${index}` });
      await send({ type: 'touch', projectId: `pin-b-${index}` });
    }
    await settle();
    expect(liveProjectIds()).toHaveLength(browserLiveProjectBudget);

    await send({ type: 'open', projectId: 'pin-b-ninth' });
    await settle();

    /* Room was made, not refused: the least recently touched idle project
     * closed with `budget` on its row and the ninth is live. */
    expect(emitted.find((event) => event.type === 'budgetRefused')).toBeUndefined();
    expect(liveProjectIds()).toContain('pin-b-ninth');
    expect(liveProjectIds()).not.toContain('pin-b-0');
    expect(liveProjectIds()).toHaveLength(browserLiveProjectBudget);
    expect(sessionsActor.getSnapshot().context.closed['pin-b-0']?.reason).toBe('budget');
    expect(workerFrames.filter((frame) => frame.type === 'computeStoreRelease')).toEqual([
      { type: 'computeStoreRelease', projectId: 'pin-b-0' },
    ]);
    view.unmount();
  });

  it('closes the least recently touched route subtree for a ninth route open', async () => {
    const view = await renderRoute('route-budget-0');
    for (let index = 1; index <= browserLiveProjectBudget; index += 1) {
      await view.rerender(`route-budget-${String(index)}`);
    }

    expect(liveProjectIds()).toHaveLength(browserLiveProjectBudget);
    expect(liveProjectIds()).not.toContain('route-budget-0');
    expect(liveProjectIds()).toContain(`route-budget-${String(browserLiveProjectBudget)}`);
    expect(sessionsActor.getSnapshot().context.closed['route-budget-0']?.reason).toBe('budget');
    expect(mounted.filter((entry) => entry === 'unmount:route-budget-0')).toHaveLength(1);
    expect(workerFrames.filter((frame) => frame.type === 'computeStoreRelease')).toContainEqual({
      type: 'computeStoreRelease',
      projectId: 'route-budget-0',
    });
    view.unmount();
  });

  it('updates an unfocused project when backup settles, then closes it as the LRU budget victim', async () => {
    revision.setSync('checking');
    const view = await renderRoute('projection-a');
    await view.rerender('projection-b');

    expect(sessionOf('projection-a')?.getSnapshot().context.pushed).toBe(false);
    await act(async () => {
      revision.setSync('backedUp');
      await Promise.resolve();
    });
    expect(sessionOf('projection-a')?.getSnapshot().context.pushed).toBe(true);

    for (let index = 2; index < browserLiveProjectBudget; index += 1) {
      await send({ type: 'open', projectId: `projection-${String(index)}` });
      await send({ type: 'touch', projectId: `projection-${String(index)}` });
    }
    await send({ type: 'open', projectId: 'projection-ninth' });
    await settle();

    expect(liveProjectIds()).toHaveLength(browserLiveProjectBudget);
    expect(liveProjectIds()).not.toContain('projection-a');
    expect(liveProjectIds()).toContain('projection-ninth');
    expect(sessionsActor.getSnapshot().context.closed['projection-a']?.reason).toBe('budget');
    view.unmount();
  });

  it('keeps one resource subtree and revision client across the project route family and back', async () => {
    revision.setSync('checking');
    const view = await renderRouteFamily('route-family-a');
    const subtree = screen.getByTestId('subtree-route-family-a');

    await view.navigate('/projects');
    await screen.findByText('Project library');

    expect(liveProjectIds()).toContain('route-family-a');
    expect(screen.getByTestId('subtree-route-family-a')).toBe(subtree);
    expect(mounted.filter((entry) => entry === 'mount:route-family-a')).toHaveLength(1);
    expect(mounted).not.toContain('unmount:route-family-a');
    expect(revisionClientLifecycle).toEqual(['mount']);
    await act(async () => {
      revision.setSync('backedUp');
      await Promise.resolve();
    });
    expect(sessionOf('route-family-a')?.getSnapshot().context.pushed).toBe(true);

    await view.navigate('/w/workspace/route-family-a');
    await screen.findByRole('link', { name: 'Projects' });
    expect(screen.getByTestId('subtree-route-family-a')).toBe(subtree);
    expect(mounted.filter((entry) => entry === 'mount:route-family-a')).toHaveLength(1);
    expect(mounted).not.toContain('unmount:route-family-a');
    expect(revisionClientLifecycle).toEqual(['mount']);

    for (let index = 1; index < browserLiveProjectBudget; index += 1) {
      await send({ type: 'open', projectId: `route-family-${String(index)}` });
      await send({ type: 'touch', projectId: `route-family-${String(index)}` });
    }
    await send({ type: 'open', projectId: 'route-family-ninth' });
    await settle();

    expect(liveProjectIds()).not.toContain('route-family-a');
    expect(liveProjectIds()).toContain('route-family-ninth');
    expect(sessionsActor.getSnapshot().context.closed['route-family-a']?.reason).toBe('budget');
    view.unmount();
  });

  it.each([
    ['/', 'Home'],
    ['/projects', 'Project library'],
  ])('renders a cold non-project route at %s without opening a project', async (initialEntry, content) => {
    const view = await renderRouteFamily('cold-non-project', initialEntry);

    expect(screen.getByText(content)).toBeInTheDocument();
    expect(liveProjectIds()).not.toContain('cold-non-project');
    expect(getProjectRouteAccess).not.toHaveBeenCalled();
    view.unmount();
  });

  it('flushes the focused project before showing a non-project route', async () => {
    const view = await renderRouteFamily('route-flush-a');
    editor.setIdle(false);

    await view.navigate('/projects');

    expect(serviceCalls).toEqual(['editor:flushNow']);
    expect(screen.queryByText('Project library')).not.toBeInTheDocument();
    await act(async () => {
      editor.setIdle(true);
      await Promise.resolve();
    });
    await screen.findByText('Project library');
    view.unmount();
  });

  it('consumes the Tau Cloud open marker through the router (W7)', async () => {
    /*
     * The marker used to be stripped with `history.replaceState` from inside
     * the session subtree, so React never saw the change and the URL and the
     * render disagreed. It is read and cleared through the router now.
     */
    const view = await renderRouteFamily('route-cloud-a', '/w/workspace/route-cloud-a?cloudOpen=tau&chat=chat-keep');

    expect(currentSearch).not.toContain('cloudOpen');
    /* The write merges: the unrelated parameter survives. */
    expect(currentSearch).toContain('chat=chat-keep');
    view.unmount();
  });

  it('never combines a retained project with a chat from an unresolved new URL', async () => {
    const view = await renderRouteFamily('route-chat-a');
    await view.navigate('/w/workspace/resolving?chat=chat-new');

    /* W2: an unresolved slug is the `resolving` state, and its loader lives in
     * the notice the real route component renders below the outlet. */
    expect(screen.getByTestId('route-state')).toHaveTextContent('resolving');
    expect(projectProviderInputs).not.toContainEqual({
      projectId: 'route-chat-a',
      requestedChatId: 'chat-new',
      createdChatId: undefined,
    });

    await view.navigate('/w/workspace/missing?chat=chat-new');
    expect(projectProviderInputs).not.toContainEqual({
      projectId: 'route-chat-a',
      requestedChatId: 'chat-new',
      createdChatId: undefined,
    });
    view.unmount();
  });

  it('refuses a ninth open when nothing is idle, naming the candidates (pin b2, P47/I28)', async () => {
    const view = await renderRoute('pin-b2-0');
    for (let index = 0; index < browserLiveProjectBudget; index += 1) {
      const projectId = index === 0 ? 'pin-b2-0' : `pin-b2-${index}`;
      if (index > 0) {
        await send({ type: 'open', projectId });
      }
      await settle();
      sessionOf(projectId)?.send({ type: 'runStarted', chatId: `chat-${index}` });
    }
    await settle();

    await send({ type: 'open', projectId: 'pin-b2-ninth' });

    const refusal = emitted.find((event) => event.type === 'budgetRefused');
    expect(refusal?.projectId).toBe('pin-b2-ninth');
    expect(refusal?.suggestions).toHaveLength(browserLiveProjectBudget);
    expect(liveProjectIds()).not.toContain('pin-b2-ninth');

    /* *Not now* drops the remembered open, so the next close — whatever its
     * reason — does not open a project nobody asked for any more. */
    await send({ type: 'cancelPendingOpen' });
    await send({ type: 'close', projectId: 'pin-b2-1', reason: 'user' });
    await act(async () => {
      sessionOf('pin-b2-1')?.send({ type: 'confirmClose' });
      await Promise.resolve();
    });
    await settle();
    expect(liveProjectIds()).not.toContain('pin-b2-ninth');
    view.unmount();
  });

  it.each<[string, { runs?: number; dirty?: boolean; pushed?: boolean }]>([
    ['running', { runs: 1 }],
    ['dirty', { dirty: true }],
    ['unpushed', { pushed: false }],
  ])('never closes a %s project on the idle window (pin c, I24/I25)', async (reason, facts) => {
    const projectId = `pin-c-${reason}`;
    const view = await renderRoute(projectId);
    const session = sessionOf(projectId);
    await act(async () => {
      if (facts.runs === undefined) {
        session?.send({ type: 'revisionState', dirty: facts.dirty === true, pushed: facts.pushed !== false });
      } else {
        session?.send({ type: 'runStarted', chatId: 'chat-1' });
      }
      await Promise.resolve();
    });

    await send({ type: 'idleExpired', projectId });
    await settle();

    expect(liveProjectIds()).toContain(projectId);
    expect(sessionsActor.getSnapshot().context.refusals[projectId]).toBe(reason);
    expect(sessionsActor.getSnapshot().context.closed[projectId]).toBeUndefined();
    expect(mounted).toEqual([`mount:${projectId}`]);
    view.unmount();
  });

  it('offers the idle window again once the refusal is gone (pin g, R6)', async () => {
    const view = await renderRoute('pin-g');
    const session = sessionOf('pin-g');
    await act(async () => {
      session?.send({ type: 'runStarted', chatId: 'chat-1' });
      await Promise.resolve();
    });
    await send({ type: 'idleExpired', projectId: 'pin-g' });
    expect(sessionsActor.getSnapshot().context.refusals['pin-g']).toBe('running');

    /* The run settles: the reason is gone, so the row stops saying it. */
    await act(async () => {
      session?.send({ type: 'runSettled', chatId: 'chat-1' });
      await Promise.resolve();
    });
    expect(sessionsActor.getSnapshot().context.refusals['pin-g']).toBeUndefined();

    /* And the next window closes it, rather than never asking again. */
    await send({ type: 'idleExpired', projectId: 'pin-g' });
    await settle();
    expect(liveProjectIds()).not.toContain('pin-g');
    expect(sessionsActor.getSnapshot().context.closed['pin-g']?.reason).toBe('idle');
    view.unmount();
  });

  it('asks, cancels, flushes, releases and stops every child on Close (pin d)', async () => {
    const view = await renderRoute('pin-d');
    const session = sessionOf('pin-d');
    expect(session).toBeDefined();
    await act(async () => {
      session?.send({ type: 'runStarted', chatId: 'chat-1' });
      await Promise.resolve();
    });
    expect(Object.keys(session?.getSnapshot().children ?? {}).length).toBeGreaterThan(0);

    await send({ type: 'close', projectId: 'pin-d', reason: 'user' });
    await settle();
    /* A live run makes Close a question, not an action (A35). */
    expect(session?.getSnapshot().matches({ closing: 'asking' })).toBe(true);
    expect(liveProjectIds()).toContain('pin-d');

    await act(async () => {
      session?.send({ type: 'confirmClose' });
      await Promise.resolve();
    });
    await settle();

    /* The flush is W13's seam, called through the route's own registration. */
    expect(serviceCalls).toContain('quiesce');
    expect(Object.keys(session?.getSnapshot().children ?? {})).toEqual([]);
    expect(liveProjectIds()).not.toContain('pin-d');
    expect(mounted).toEqual(['mount:pin-d', 'unmount:pin-d']);
    /* The worker count is back to baseline: every admission has its release. */
    expect(workerFrames).toEqual([
      { type: 'computeStoreAdmission', projectId: 'pin-d' },
      { type: 'computeStoreRelease', projectId: 'pin-d' },
    ]);
    view.unmount();
  });

  it('runs every session closing before it is quiesced (pin e, D31)', async () => {
    const view = await renderRoute('pin-e-1');
    await send({ type: 'open', projectId: 'pin-e-2' });
    await settle();
    expect(liveProjectIds()).toEqual(['pin-e-1', 'pin-e-2']);

    await send({ type: 'quit' });
    await settle();

    expect(sessionsActor.getSnapshot().matches('quiesced')).toBe(true);
    expect(emitted).toContainEqual({ type: 'quiesced', forced: false });
    /* Quit runs the closing with the sync flush, per session, before it is
     * quiesced — never a bare stop (D31). */
    expect(workerFrames.filter((frame) => frame.type === 'computeStoreRelease')).toHaveLength(2);
    view.unmount();
  });
});

/**
 * S48(6) — the idle window is a child timer, driven by hand.
 *
 * The pins above reach the policy by sending `idleExpired` at the registry,
 * which is the registry's half. This is the other half: nobody sends that
 * event in the app — `project-session.live.idle` raises it after 30 minutes
 * without attention, and `reenter` re-arms it (W19-a2 R6). A manual clock is
 * the only way to assert it without waiting half an hour, and a fake global
 * timer would also move every unrelated timeout in the document.
 */
describe('sessions composition — the idle window (S48(6))', () => {
  /** Virtual time the test moves by hand; nothing here waits on the wall. */
  const manualClock = (): Readonly<{
    setTimeout: (callback: () => void, delay: number) => number;
    clearTimeout: (id: number) => void;
    advance: (milliseconds: number) => void;
  }> => {
    const timeouts = new Map<number, { at: number; callback: () => void }>();
    let now = 0;
    let nextId = 0;
    return {
      setTimeout: (callback, delayMilliseconds) => {
        nextId += 1;
        timeouts.set(nextId, { at: now + delayMilliseconds, callback });
        return nextId;
      },
      clearTimeout: (id) => {
        timeouts.delete(id);
      },
      advance: (milliseconds) => {
        now += milliseconds;
        for (const [id, entry] of [...timeouts].sort(([, left], [, right]) => left.at - right.at)) {
          if (entry.at <= now) {
            timeouts.delete(id);
            entry.callback();
          }
        }
      },
    };
  };

  /* The four startup children, each reporting its region up at once: the host
   * supplies these, and what this row is about is what happens after they are
   * up. Everything else — the timer, the policy, the close — is the real pair
   * of machines. */
  const readyChild = (region: string) =>
    fromCallback<EventObject, { projectId: string }>(({ sendBack }) => {
      sendBack({ type: 'childReady', region });
      return undefined;
    });

  const startRegistry = () => {
    const clock = manualClock();
    const actor = createActor(
      sessionsMachine.provide({
        actors: {
          projectSession: projectSessionMachine.provide({
            actors: {
              fileManager: readyChild('views'),
              project: readyChild('runtime'),
              agentHost: readyChild('agentHost'),
              compute: readyChild('compute'),
            },
          }),
        },
      }),
      { clock, input: { budget: browserLiveProjectBudget } },
    );
    return Object.assign(actor, { clock });
  };

  /** Let the actor reach a stable state; nothing renders here. */
  const drain = async (registry: ReturnType<typeof startRegistry>): Promise<void> => {
    await Promise.resolve();
    await vi.waitFor(() => {
      expect(
        Object.values(registry.getSnapshot().context.refs).every((ref) => {
          const snapshot = ref.getSnapshot();
          return (
            !snapshot.matches('opening') &&
            !snapshot.matches({ closing: 'cancellingRuns' }) &&
            !snapshot.matches({ closing: 'flushingProducers' }) &&
            !snapshot.matches({ closing: 'flushing' }) &&
            !snapshot.matches({ closing: 'releasing' })
          );
        }),
      ).toBe(true);
    });
  };

  it('closes an idle project through its own child timer', async () => {
    const registry = startRegistry();
    registry.start();
    registry.send({ type: 'open', projectId: 'timer-idle' });
    await drain(registry);
    expect(registry.getSnapshot().context.refs['timer-idle']?.getSnapshot().value).toEqual({ live: 'idle' });

    /* One minute short of the window: nothing has expired yet. */
    registry.clock.advance(projectSessionIdleWindowMilliseconds - 60_000);
    await drain(registry);
    expect(registry.getSnapshot().context.closed['timer-idle']).toBeUndefined();

    registry.clock.advance(60_000);
    await drain(registry);

    expect(registry.getSnapshot().context.closed['timer-idle']?.reason).toBe('idle');
    expect(registry.getSnapshot().context.refs['timer-idle']).toBeUndefined();
    registry.stop();
  });

  /* A run does not *refuse* the window — it removes it. `live.busy` has no
   * `after`, so the 30 minutes are never counted while an agent is working and
   * the registry is never asked. The refusal path the pins above drive
   * (`refusals[projectId] = 'running'`) is the race where a run starts between
   * the timer firing and the registry reading the facts; the steady state is
   * this one, and it is the stronger guarantee. */
  it('never arms the window while a run is in flight, and arms it again when the run settles', async () => {
    const registry = startRegistry();
    registry.start();
    registry.send({ type: 'open', projectId: 'timer-busy' });
    await drain(registry);
    const session = registry.getSnapshot().context.refs['timer-busy'];
    session?.send({ type: 'runStarted', chatId: 'chat-1' });
    await drain(registry);
    expect(session?.getSnapshot().value).toEqual({ live: 'busy' });

    registry.clock.advance(projectSessionIdleWindowMilliseconds * 2);
    await drain(registry);
    expect(registry.getSnapshot().context.refs['timer-busy']).toBeDefined();
    expect(registry.getSnapshot().context.closed['timer-busy']).toBeUndefined();

    session?.send({ type: 'runSettled', chatId: 'chat-1' });
    await drain(registry);
    registry.clock.advance(projectSessionIdleWindowMilliseconds);
    await drain(registry);

    expect(registry.getSnapshot().context.closed['timer-busy']?.reason).toBe('idle');
    registry.stop();
  });

  /* R6 — the window is re-armed by a refusal rather than spent on it. A dirty
   * tree is the refusal that *stays* in `live.idle`, so the same child timer
   * has to come round again once the tree is clean. */
  it('re-arms the window after a refusal rather than asking once (R6)', async () => {
    const registry = startRegistry();
    registry.start();
    registry.send({ type: 'open', projectId: 'timer-rearm' });
    await drain(registry);
    const session = registry.getSnapshot().context.refs['timer-rearm'];
    session?.send({ type: 'revisionState', dirty: true, pushed: true });
    await drain(registry);

    registry.clock.advance(projectSessionIdleWindowMilliseconds);
    await drain(registry);
    expect(registry.getSnapshot().context.refusals['timer-rearm']).toBe('dirty');
    expect(registry.getSnapshot().context.refs['timer-rearm']).toBeDefined();

    session?.send({ type: 'revisionState', dirty: false, pushed: true });
    await drain(registry);
    registry.clock.advance(projectSessionIdleWindowMilliseconds);
    await drain(registry);

    expect(registry.getSnapshot().context.closed['timer-rearm']?.reason).toBe('idle');
    registry.stop();
  });
});

/**
 * S48(14), seam-unit workbench half — *Switch* re-roots, it does not reload.
 *
 * The real selection actor is composed and asserted at the package owner. This
 * jsdom row deliberately substitutes only the host file-manager and handle
 * store seams, then proves `WorkbenchCheckoutRoot` issues one `setRoot` and
 * never remounts the workbench.
 */
describe('sessions composition — the workbench follows the selection (S48(14))', () => {
  const projection = (checkoutId: string, checkoutRoot: string): unknown => ({
    projectId: 'unused',
    checkoutId,
    checkoutRoot,
    branch: checkoutId === 'live' ? 'main' : 'bracket-fillet',
    branches: [
      { name: 'main', checkoutId: 'live', checkoutRoot: '/projects/unused', leaseChatIds: [] },
      {
        name: 'bracket-fillet',
        checkoutId: 'checkout-fillet',
        checkoutRoot: '/checkouts/checkout-fillet',
        leaseChatIds: [],
      },
    ],
  });

  it('follows the selection to a new root without remounting the workbench', async () => {
    revisionProjection.current = projection('live', '/projects/unused');
    let mounts = 0;

    function Workbench(): React.JSX.Element {
      useEffect(() => {
        mounts += 1;
      }, []);
      return (
        <>
          <WorkbenchCheckoutRoot />
          <span>workbench</span>
        </>
      );
    }

    const view = render(<Workbench />);
    await settle();
    /* The branch's route is installed before the workbench moves at all (W2
     * review R4): a `setRoot` at a route nothing mounted answers ESTALE. */
    expect(rootCalls).toEqual([
      { type: 'checkoutRoutes', path: 'checkout-fillet' },
      { type: 'syncProjectRoots' },
      { type: 'setRoot', path: '/projects/unused', projectId: 'unused' },
    ]);

    /* The selection moves to the branch's own checkout. */
    revisionProjection.current = projection('checkout-fillet', '/checkouts/checkout-fillet');
    await act(async () => {
      view.rerender(<Workbench />);
      await Promise.resolve();
    });
    await settle();

    /* The move is one `setRoot`, with no second route installation (the set did
     * not change) and no remount: no reload, for a person with a file open. */
    expect(rootCalls).toEqual([
      { type: 'checkoutRoutes', path: 'checkout-fillet' },
      { type: 'syncProjectRoots' },
      { type: 'setRoot', path: '/projects/unused', projectId: 'unused' },
      { type: 'setRoot', path: '/checkouts/checkout-fillet', projectId: 'unused' },
    ]);
    expect(mounts).toBe(1);
    view.unmount();
  });
});

/**
 * S48(17), the renderer half — the quit hold, painted and cut short.
 *
 * `apps/desktop-e2e/src/desktop-quit-hold.spec.ts` owns the main-process half:
 * the window is asked (`main.renderer-quiesce`) before the services utility is
 * quiesced. What it cannot observe is the overlay — a desktop quit with
 * nothing live is answered inside the same React commit, so nothing paints,
 * and making a project live on the packaged shell needs an account and a turn.
 *
 * Composed here: the actual desktop bridge, registry/session machines, overlay
 * and Quit-anyway verb. Not composed here: Electron main/preload and a real
 * revision port; the desktop e2e owns the former and the Node close row owns
 * the latter. Only the sync flush is held open (D31, P49).
 */
describe('sessions composition — the desktop quit hold (S48(17))', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { tau?: unknown }).tau;
  });

  it('answers a quit ask buffered before the renderer mounted', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const answers: string[] = [];
    let ready = false;
    (globalThis as { tau?: unknown }).tau = {
      quit: {
        isReady: () => ready,
        onAsk: (handler: () => void) => {
          ready = true;
          handler();
          return () => {
            ready = false;
          };
        },
        reportQuiesced: () => answers.push('quiesced'),
      },
    };

    expect(ready).toBe(false);

    vi.resetModules();
    const freshSessions = await import('#hooks/use-sessions.js');

    const view = render(
      <QueryClientProvider client={queryClient}>
        <freshSessions.SessionsProvider>
          <span>app</span>
        </freshSessions.SessionsProvider>
      </QueryClientProvider>,
    );
    await settle();

    expect(ready).toBe(true);
    expect(answers).toEqual(['quiesced']);
    view.unmount();
    expect(ready).toBe(false);
  });

  it('paints what is being waited for, and Quit anyway answers main', async () => {
    vi.stubEnv('TAU_TARGET', 'desktop');
    const asks: Array<() => void> = [];
    const answers: string[] = [];
    (globalThis as { tau?: unknown }).tau = {
      quit: {
        onAsk: (handler: () => void) => {
          asks.push(handler);
          return () => undefined;
        },
        reportQuiesced: () => answers.push('quiesced'),
      },
    };

    /* A registry of this row's own: the module singleton the rows above share
     * is quiesced by pin e, and a quiesced registry never opens again. */
    vi.resetModules();
    const freshSessions = await import('#hooks/use-sessions.js');
    const freshStore = await import('#services/sessions-store.js');

    const view = render(
      <QueryClientProvider client={queryClient}>
        <freshSessions.SessionsProvider>
          <span>app</span>
        </freshSessions.SessionsProvider>
      </QueryClientProvider>,
    );
    await settle();
    expect(asks).toHaveLength(1);

    /* One session whose flush never answers — the only reason a quit is ever
     * held open. */
    const unregister = freshStore.registerProjectSessionServices('quit-hold', {
      flushProducers: async () => undefined,
      flushSync: async () => {
        await new Promise<void>(() => {
          /* Never answers: a flush that settles would not hold a quit open. */
        });
      },
      cancelRuns: async () => undefined,
      releaseLeases: async () => undefined,
    });
    await act(async () => {
      freshStore.sessionsActor.send({ type: 'open', projectId: 'quit-hold' });
      await Promise.resolve();
    });
    await settle();

    /* Main asks. */
    await act(async () => {
      asks[0]?.();
      await Promise.resolve();
    });
    await settle();

    expect(view.getByRole('status').textContent).toContain('Closing your projects');
    expect(answers).toEqual([]);
    expect(freshStore.sessionsActor.getSnapshot().matches('quiesced')).toBe(false);

    /* The one way out. It answers main rather than leaving the shell to time
     * the renderer out; the packaged-shell ordering is the desktop spec's. */
    await act(async () => {
      view.getByRole('button', { name: 'Quit anyway' }).click();
      await Promise.resolve();
    });
    await settle();

    expect(freshStore.sessionsActor.getSnapshot().matches('forced')).toBe(true);
    expect(answers).toEqual(['quiesced']);
    expect(view.queryByRole('status')).toBeNull();

    unregister();
    view.unmount();
  });
});
