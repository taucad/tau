/**
 * Every live project's resource subtree, characterised before it moves into the session (app state
 * orchestration A0.2, inventory S1 to S7, S12, S26, S27 and S40).
 *
 * The registry is real (`createSessionsActor` on a `StepClock`), and so are the unload sequencer,
 * `LiveProjectSessions`, the binding, the persistence guard and `ProjectProvider` with its producer set.
 * Only the leaves are stand-ins: the project and editor actors (as `useActorRef` returns them), the
 * file manager, the revision client and the chat store. Each row renders under StrictMode, as the
 * app does in development.
 */

import { StrictMode, createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock } from 'vitest-mock-extended';
import type { Actor } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import type * as XstateReactModule from '@xstate/react';
import type * as UseProjectModule from '#hooks/use-project.js';
import type * as CloudProjectsModule from '#hooks/use-cloud-projects.js';
import type * as SessionsStoreModule from '#services/sessions-store.js';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import { projectSessionParkWindowMilliseconds } from '#machines/project-session.machine.js';
import { SessionsProvider, useLiveProjectIds } from '#hooks/use-sessions.js';
import { UnloadProvider } from '#hooks/use-flush-on-close.js';
import { createSessionsActor, forgetProjectRegions } from '#services/sessions-store.js';
import { tauCloudIntent } from '#hooks/use-cloud-projects.js';
import type { ProjectSessionFlushRegistration } from '#routes/w.$workspace.$project/project-live-sessions.js';

// ===========================================================================
// Leaf stand-ins
// ===========================================================================

type Observer = Readonly<{ next?: (snapshot: unknown) => void; error?: (error: unknown) => void }>;

/** A project or editor actor as far as its readers go: a snapshot, a send log and subscribers. */
type FixtureActor = Readonly<{
  sent: string[];
  send: (event: { type: string }) => void;
  getSnapshot: () => FixtureSnapshot;
  subscribe: (observer: Observer | ((snapshot: unknown) => void)) => { unsubscribe: () => void };
  on: () => { unsubscribe: () => void };
  /** Replace the active state keys and context, and tell subscribers. */
  set: (patch: Readonly<{ states?: readonly string[]; context?: Readonly<Record<string, unknown>> }>) => void;
  fail: (error: Error) => void;
}>;

type FixtureSnapshot = Readonly<{
  status: 'active';
  context: Readonly<Record<string, unknown>>;
  matches: (value: unknown) => boolean;
}>;

const storingIdle = JSON.stringify({ ready: { storing: 'idle' } });
const focusedChatDeferred = JSON.stringify({ ready: { operation: 'focusedChatDeferred' } });

const createFixtureActor = (
  name: string,
  initial: Readonly<{ states: readonly string[]; context: Readonly<Record<string, unknown>> }>,
  onSend: (actor: FixtureActor, event: { type: string }) => void = () => undefined,
): FixtureActor => {
  const observers = new Set<Observer>();
  let states = new Set(initial.states);
  let { context } = initial;
  const build = (): FixtureSnapshot => {
    const active = states;
    return {
      status: 'active',
      context,
      matches: (value) => active.has(typeof value === 'string' ? value : JSON.stringify(value)),
    };
  };
  let snapshot = build();
  const actor: FixtureActor = {
    sent: [],
    send: (event) => {
      actor.sent.push(`${name}:${event.type}`);
      onSend(actor, event);
    },
    getSnapshot: () => snapshot,
    subscribe: (observer) => {
      const entry: Observer = typeof observer === 'function' ? { next: observer } : observer;
      observers.add(entry);
      return {
        unsubscribe: () => {
          observers.delete(entry);
        },
      };
    },
    on: () => ({ unsubscribe: () => undefined }),
    set: (patch) => {
      states = patch.states === undefined ? states : new Set(patch.states);
      context = patch.context === undefined ? context : { ...context, ...patch.context };
      snapshot = build();
      for (const observer of observers) {
        observer.next?.(snapshot);
      }
    },
    fail: (error) => {
      for (const observer of observers) {
        observer.error?.(error);
      }
    },
  };
  return actor;
};

type RevisionStatus = Readonly<{
  projectDirty: boolean;
  line: Readonly<{ kind: 'branch'; name: string } | { kind: 'unknown' }>;
  remote: Readonly<{ kind: 'none' | 'tau'; phase: 'none' | 'connected'; fetchOnly: boolean }>;
  sync: Readonly<{
    state: 'noRemote' | 'backedUp' | 'pending' | 'conflicted';
    pendingCount: number;
    chats?: 'ready' | 'pending';
    hasAppliedRemote?: boolean;
  }>;
}>;

/** One project's revision client: the session's close cut and the focus long poll. */
type FixtureRevisionClient = Readonly<{
  focus: ReturnType<typeof vi.fn<(focused: boolean) => void>>;
  quiesce: ReturnType<typeof vi.fn<() => Promise<void>>>;
  status: () => RevisionStatus;
  subscribe: (listener: () => void) => () => void;
  setStatus: (patch: Partial<RevisionStatus>) => void;
}>;

const createRevisionClient = (order: string[], projectId: string): FixtureRevisionClient => {
  const listeners = new Set<() => void>();
  let status: RevisionStatus = {
    projectDirty: false,
    line: { kind: 'branch', name: 'main' },
    remote: { kind: 'none', phase: 'none', fetchOnly: false },
    sync: { state: 'noRemote', pendingCount: 0 },
  };
  return {
    focus: vi.fn<(focused: boolean) => void>(),
    quiesce: vi.fn(async () => {
      order.push(`quiesce:${projectId}`);
    }),
    status: () => status,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setStatus: (patch) => {
      status = { ...status, ...patch };
      for (const listener of listeners) {
        listener();
      }
    },
  };
};

/** The person's choices the binding reads (models, kernel), as a store a row can change. */
const choiceStore = vi.hoisted(() => {
  let value = { model: 'fixture-model', kernel: 'openscad' };
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: Partial<{ model: string; kernel: string }>) => {
      value = { ...value, ...next };
      for (const listener of listeners) {
        listener();
      }
    },
    reset: () => {
      value = { model: 'fixture-model', kernel: 'openscad' };
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

/** The browser agent host lease: one retain per project, released by the returned function. */
const browserLease = vi.hoisted(() => ({ retained: [] as string[], released: [] as string[] }));

const fixtures = vi.hoisted(() => ({
  /** Every send, flush and cut, in order, across projects. */
  order: [] as string[],
  actors: new Map<string, unknown>(),
  revisionClients: new Map<string, unknown>(),
  lifecycleMounts: [] as string[],
  fileManagers: new Map<string, unknown>(),
  retryManifestObservation: new Map<string, unknown>(),
  chatProducers: new Map<string, () => Promise<void>>(),
}));

const ProjectIdContext = createContext('');

const actorFor = (key: string): FixtureActor => {
  const existing = fixtures.actors.get(key) as FixtureActor | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const [machine = '', projectId = ''] = key.split(':');
  const created =
    machine === 'project'
      ? createFixtureActor(
          key,
          {
            states: [storingIdle],
            context: {
              project: { id: projectId },
              viewGraphics: new Map(),
              geometryUnits: new Map(),
              kernelRefusal: undefined,
              error: undefined,
            },
          },
          (actor, event) => {
            fixtures.order.push(`${key}:${event.type}`);
            if (event.type === 'closeRuntime') {
              actor.set({ states: [storingIdle, 'runtimeClosed'] });
            }
          },
        )
      : createFixtureActor(
          key,
          { states: [storingIdle], context: { focusedChatId: undefined, requestedChatId: undefined } },
          (_actor, event) => {
            fixtures.order.push(`${key}:${event.type}`);
          },
        );
  fixtures.actors.set(key, created);
  return created;
};

const revisionClientOf = (projectId: string): FixtureRevisionClient => {
  const existing = fixtures.revisionClients.get(projectId) as FixtureRevisionClient | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const created = createRevisionClient(fixtures.order, projectId);
  fixtures.revisionClients.set(projectId, created);
  return created;
};

type FixtureFileManager = Readonly<{
  fileManagerRef: FixtureActor;
  workspace: { syncProjectRoots: () => Promise<void> };
  workerChangeChannel: {
    onFileWritten: (subscription: {
      interestedIn: (path: string) => boolean;
      handler: (event: { path: string }) => void;
    }) => () => void;
    write: (path: string) => void;
  };
  contentService: undefined;
  parameterFiles: undefined;
  watchRecordFile: undefined;
}>;

const fileManagerOf = (projectId: string): FixtureFileManager => {
  const existing = fixtures.fileManagers.get(projectId) as FixtureFileManager | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const subscriptions = new Set<{
    interestedIn: (path: string) => boolean;
    handler: (event: { path: string }) => void;
  }>();
  const created: FixtureFileManager = {
    fileManagerRef: createFixtureActor(`fileManager:${projectId}`, {
      states: ['ready'],
      context: {
        rootDirectory: `/projects/${projectId}`,
        openFileSystemBridge: vi.fn((_root: string, _mode: string) => ({ bridge: 'first' })),
        openRevisionSessionPort: vi.fn((_kind: string, _projectId: string) => ({ port: 'revisions' })),
        openComputeStorePort: vi.fn((_projectId: string) => ({ port: 'compute' })),
      },
    }),
    workspace: { syncProjectRoots: async () => undefined },
    workerChangeChannel: {
      onFileWritten: (subscription) => {
        subscriptions.add(subscription);
        return () => {
          subscriptions.delete(subscription);
        };
      },
      write: (path) => {
        for (const subscription of subscriptions) {
          if (subscription.interestedIn(path)) {
            subscription.handler({ path });
          }
        }
      },
    },
    contentService: undefined,
    parameterFiles: undefined,
    watchRecordFile: undefined,
  };
  fixtures.fileManagers.set(projectId, created);
  return created;
};

const retrySpyOf = (projectId: string): ReturnType<typeof vi.fn<() => void>> => {
  const existing = fixtures.retryManifestObservation.get(projectId) as ReturnType<typeof vi.fn<() => void>> | undefined;
  if (existing !== undefined) {
    return existing;
  }
  const created = vi.fn<() => void>();
  fixtures.retryManifestObservation.set(projectId, created);
  return created;
};

vi.mock('@xstate/react', async (importOriginal) => {
  const actual = await importOriginal<typeof XstateReactModule>();
  return {
    ...actual,
    /* `ProjectProvider` builds its project and editor actors here; the rows read their stand-ins. */
    useActorRef: (logic: { readonly id: string }, options: { readonly input: { readonly projectId: string } }) =>
      actorFor(`${logic.id}:${options.input.projectId}`),
  };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  useSharedFileManagerWorker: () => undefined,
  HomeFileManagerProvider: ({ children, projectId }: React.PropsWithChildren<{ projectId: string }>) => {
    useEffect(() => {
      fixtures.order.push(`mount:${projectId}`);
      return () => {
        fixtures.order.push(`unmount:${projectId}`);
      };
    }, [projectId]);
    return <ProjectIdContext.Provider value={projectId}>{children}</ProjectIdContext.Provider>;
  },
  useFileManager: () => fileManagerOf(useContext(ProjectIdContext)),
}));

/* The real provider and its producer set; `retryManifestObservation` is observed, because the real
 * one has nothing to refresh until a manifest observation is running. */
vi.mock('#hooks/use-project.js', async (importOriginal) => {
  const actual = await importOriginal<typeof UseProjectModule>();
  return {
    ...actual,
    useProject: () => {
      const value = actual.useProject();
      return { ...value, retryManifestObservation: retrySpyOf(value.projectId) };
    },
  };
});

vi.mock('#hooks/use-project-manager.js', () => {
  const projectManager = {
    projectManagerRef: {
      getSnapshot: () => ({ matches: () => false, context: {} }),
      subscribe: () => ({ unsubscribe: () => undefined }),
    },
    touchProject: async () => undefined,
  };
  return { useProjectManager: () => projectManager };
});

vi.mock('@taucad/ui-core/services/parameter-set-service', () => ({
  createParameterSetService: () => parameterService,
}));
vi.mock('#machines/inspector.js', () => ({ inspect: undefined }));

vi.mock('#hooks/use-revision-status.js', async () => {
  const { useProject } = await import('#hooks/use-project.js');
  return {
    useRevisionClientLifecycle: () => {
      const { projectId } = useProject();
      useEffect(() => {
        fixtures.lifecycleMounts.push(`mount:${projectId}`);
        return () => {
          fixtures.lifecycleMounts.push(`close:${projectId}`);
        };
      }, [projectId]);
      return revisionClientOf(projectId);
    },
    useRevisionClientStatus: (client: FixtureRevisionClient | undefined) =>
      useSyncExternalStore(
        (listener) => client?.subscribe(listener) ?? (() => undefined),
        () => client?.status(),
      ),
    useRevisionCommands: () => ({ connectRemote: async () => undefined }),
    useProjectRole: () => 'owner',
  };
});

vi.mock('#hooks/use-cloud-projects.js', async (importOriginal) => ({
  ...(await importOriginal<typeof CloudProjectsModule>()),
  useTauCloudIntentConnection: () => undefined,
}));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => chatSessions }));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => {
    const { model } = useSyncExternalStore(choiceStore.subscribe, choiceStore.get);
    return {
      defaultExecution: { kind: 'tau', model },
      resolveModel: (id: string) => ({ id, name: id, isResolved: false, provider: { id: 'unknown', name: 'Unknown' } }),
    };
  },
}));
vi.mock('#hooks/use-kernel.js', () => ({
  useKernel: () => ({ kernel: useSyncExternalStore(choiceStore.subscribe, choiceStore.get).kernel }),
}));
vi.mock('#services/sessions-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionsStoreModule>();
  return { ...actual, forgetProjectRegions: vi.fn(actual.forgetProjectRegions) };
});
vi.mock('#hooks/use-publish-cloud-project-preview.js', () => ({ usePublishCloudProjectPreview: () => undefined }));
vi.mock('#services/project-agent-host-registration.js', () => ({
  registerProjectAgentHost: async () => ({ release: async () => undefined }),
}));
const browserClientOptions: Array<Readonly<Record<string, unknown>>> = [];
vi.mock('#services/agent-host-client.js', () => ({
  createBrowserAgentHostClient: (options: Readonly<Record<string, unknown>>) => {
    browserClientOptions.push(options);
    return { close: async () => undefined };
  },
  createAgentHostClient: () => ({ close: async () => undefined }),
  noteBrowserRunPresented: async () => undefined,
  noteBrowserRunRated: async () => undefined,
  readBrowserRunStoppability: async () => 'stoppable',
  retainBrowserAgentHostProject: (options: { readonly authority: { readonly projectId: string } }) => {
    browserLease.retained.push(options.authority.projectId);
    return () => {
      browserLease.released.push(options.authority.projectId);
    };
  },
}));
vi.mock('@taucad/chat-ui/services/daemon-agent-host-client', () => ({
  createDaemonAgentHostTransport: (dial: unknown) => ({ dial }),
}));
vi.mock('#filesystem/handle-store.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getProjectFileSystemConfig: async (projectId: string) => ({
    projectId,
    backend: 'opfs',
    providerBasePath: projectId,
  }),
}));
vi.mock('#providers/chat-workspace-authority-provider.js', () => ({
  ChatWorkspaceAuthorityProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  readRootedBridgeCapabilities: async () => ({ writable: true, durability: 'exclusive-append' }),
}));
vi.mock('#components/nav/project-close-dialogs.js', () => ({ BudgetRefusedDialog: () => null }));
vi.mock('@taucad/viewer/hooks/use-webgl-context-tracker', () => ({
  WebglContextTrackerProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#hooks/use-editor-document-session.js', () => ({
  EditorDocumentSessionProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/workbench-record-host.js', () => ({ WorkbenchRecordHost: () => null }));
vi.mock('#routes/w.$workspace.$project/view-settings-sync-host.js', () => ({ ViewSettingsSyncHost: () => null }));
/*
 * The entries host stands in for every record host of a live project, focused or not: it registers one
 * producer in the project's producer set, as `entries-sync-host.tsx` does (S40).
 */
vi.mock('#routes/w.$workspace.$project/entries-sync-host.js', async () => {
  const { useProject } = await import('#hooks/use-project.js');
  return {
    EntriesSyncHost: () => {
      const { projectId, registerWorkbenchRecordProducer } = useProject();
      useEffect(
        () =>
          registerWorkbenchRecordProducer(async () => {
            fixtures.order.push(`producer:${projectId}`);
            await fixtures.chatProducers.get(projectId)?.();
          }),
        [projectId, registerWorkbenchRecordProducer],
      );
      return null;
    },
  };
});
vi.mock('#routes/w.$workspace.$project/revision-save-shortcut.js', () => ({ RevisionSaveShortcut: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-restore.js', () => ({ RevisionRestore: () => null }));
vi.mock('#routes/w.$workspace.$project/workbench-checkout-root.js', () => ({ WorkbenchCheckoutRoot: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-outcomes.js', () => ({ RevisionOutcomes: () => null }));
vi.mock('#routes/w.$workspace.$project/revision-conflict-chat.js', () => ({ RevisionConflictChat: () => null }));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  ProjectWorkspaceProvider: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('#routes/w.$workspace.$project/project-share-action.js', () => ({ ProjectShareRouteIntent: () => null }));
vi.mock('#routes/w.$workspace.$project/project-print-route-intent.js', () => ({ ProjectPrintRouteIntent: () => null }));
vi.mock('#routes/w.$workspace.$project/project-sync-placeholder.js', () => ({ ProjectSyncAnnouncement: () => null }));
vi.mock('#routes/w.$workspace.$project/unsaved-parameter-drafts-dialog.js', () => ({
  UnsavedParameterDraftsDialog: () => null,
}));
vi.mock('#routes/w.$workspace.$project/chat-interface.js', () => ({ ChatInterface: () => null }));
vi.mock('#routes/w.$workspace.$project/project-route-notices.js', () => ({ ProjectRouteNotice: () => null }));
vi.mock('#hooks/use-focused-chat-read-state.js', () => ({ useFocusedChatReadState: () => undefined }));

const parameterService = mock<ParameterSetService>({
  close: vi.fn(async () => undefined),
  subscribeActors: () => () => undefined,
  subscribeUnsavedDrafts: () => () => undefined,
});

const unpublishConnector = vi.fn();
async function stopProjectedRun(chatId: string): Promise<'stopped' | 'continuing' | 'absent'> {
  fixtures.order.push(`cancel:${chatId}`);
  return 'stopped';
}

const chatSessions = mock<ChatSessionStore>({
  setRevisionFacts: vi.fn(),
  setProjectSession: vi.fn(),
  setFocusedProject: vi.fn(),
  publishProjectHostConnector: vi.fn(() => unpublishConnector),
  getChatHostSettings: vi.fn(async () => undefined),
  cancelProjectedRun: vi.fn(stopProjectedRun),
  refreshRemoteSegments: vi.fn(async () => undefined),
  observedChatIdsOf: vi.fn(() => ['chat-observed']),
});

const { LiveProjectSessions } = await import('#routes/w.$workspace.$project/project-live-sessions.js');

// ===========================================================================
// Harness
// ===========================================================================

const projectA = 'proj_live_aaaaaaaaaaaaaaa';
const projectB = 'proj_live_bbbbbbbbbbbbbbb';

let visibility: DocumentVisibilityState = 'visible';
let clock: StepClock;
let registry: Actor<typeof sessionsMachine>;
let queryClient: QueryClient;
const flushRegistrations: Array<ProjectSessionFlushRegistration | undefined> = [];

type Focus = Readonly<{ projectId: string; requestedChatId?: string; createdChatId?: string }> | undefined;

function Sessions({ focus }: { readonly focus: Focus }): React.JSX.Element {
  const liveProjectIds = useLiveProjectIds();
  return (
    <LiveProjectSessions
      focused={
        focus === undefined
          ? undefined
          : {
              projectId: focus.projectId,
              requestedChatId: focus.requestedChatId,
              createdChatId: focus.createdChatId,
              children: undefined,
            }
      }
      liveProjectIds={liveProjectIds}
      onFlushRegistration={(registration) => {
        flushRegistrations.push(registration);
      }}
      retainedKernels={{}}
    />
  );
}

/** The app's root composition around the live sessions: unload sequencer, query client, registry. */
const tree = (focus: Focus, mounted = true): React.JSX.Element => (
  <StrictMode>
    <UnloadProvider>
      <QueryClientProvider client={queryClient}>
        <SessionsProvider actor={registry}>{mounted ? <Sessions focus={focus} /> : null}</SessionsProvider>
      </QueryClientProvider>
    </UnloadProvider>
  </StrictMode>
);

const flushTasks = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  });
};

const sessionOf = (projectId: string) => registry.getSnapshot().context.refs[projectId];

/** Open projects through the registry, render the subtrees and let every region report. */
const openAndRender = async (projectIds: readonly string[], focus: Focus): Promise<ReturnType<typeof render>> => {
  for (const projectId of projectIds) {
    registry.send({ type: 'open', projectId });
  }
  const view = render(tree(focus));
  await flushTasks();
  return view;
};

const sentOf = (key: string): readonly string[] => actorFor(key).sent.map((entry) => entry.slice(key.length + 1));

const hide = async (): Promise<void> => {
  visibility = 'hidden';
  await act(async () => {
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
  await flushTasks();
};

beforeEach(() => {
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  clock = new StepClock();
  registry = createSessionsActor({ clock }).start();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fixtures.order.length = 0;
  fixtures.actors.clear();
  fixtures.revisionClients.clear();
  fixtures.lifecycleMounts.length = 0;
  fixtures.fileManagers.clear();
  fixtures.retryManifestObservation.clear();
  fixtures.chatProducers.clear();
  flushRegistrations.length = 0;
  browserClientOptions.length = 0;
  browserLease.retained.length = 0;
  browserLease.released.length = 0;
  choiceStore.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  registry.stop();
  tauCloudIntent.set(projectA, undefined);
});

// ===========================================================================
// ProjectSessionBinding: one row per relay (S1 to S7, S27), under StrictMode
// ===========================================================================

describe('ProjectSessionBinding relays (A0.2 item 7)', () => {
  it('should bring the session live once the views and runtime regions report ready (S7)', async () => {
    await openAndRender([projectA], { projectId: projectA });

    expect(sessionOf(projectA)?.getSnapshot().matches('live')).toBe(true);
  });

  it('should record a kernel refusal on the session and clear it when the kernel is back (S7)', async () => {
    await openAndRender([projectA], { projectId: projectA });

    act(() => {
      actorFor(`project:${projectA}`).set({ context: { kernelRefusal: { reason: 'Kernel budget reached' } } });
    });
    await flushTasks();
    expect(sessionOf(projectA)?.getSnapshot().context.failures).toEqual({ runtime: 'Kernel budget reached' });

    act(() => {
      actorFor(`project:${projectA}`).set({ context: { kernelRefusal: undefined } });
    });
    await flushTasks();
    expect(sessionOf(projectA)?.getSnapshot().context.failures).toEqual({});
  });

  it('should retry the deferred focused chat once the revision client reports chats ready (S1)', async () => {
    await openAndRender([projectA], { projectId: projectA });
    act(() => {
      actorFor(`editor:${projectA}`).set({ states: [storingIdle, focusedChatDeferred] });
    });
    await flushTasks();
    expect(sentOf(`editor:${projectA}`)).not.toContain('retryEnsureFocusedChat');

    act(() => {
      revisionClientOf(projectA).setStatus({ sync: { state: 'noRemote', pendingCount: 0, chats: 'ready' } });
    });
    await flushTasks();

    expect(sentOf(`editor:${projectA}`)).toContain('retryEnsureFocusedChat');
  });

  it('should read the file manager for the bridge and both ports when a chat connects, not when it publishes (S2)', async () => {
    await openAndRender([projectA], { projectId: projectA });
    const published = vi.mocked(chatSessions.publishProjectHostConnector).mock.calls.at(-1);
    expect(published?.[0]).toBe(projectA);
    const fileManager = fileManagerOf(projectA).fileManagerRef;
    const laterBridge = vi.fn((_root: string, _mode: string) => ({ bridge: 'later' }));
    fileManager.set({ context: { openFileSystemBridge: laterBridge } });

    const connect = published?.[1];
    await act(async () => {
      await connect?.('chat-1');
    });

    const options = browserClientOptions.at(-1) as {
      openFileSystemBridge: () => unknown;
      openRevisionsPort: () => unknown;
      openPlacementPort: () => unknown;
      openComputeStorePort: () => unknown;
    };
    expect(options.openFileSystemBridge()).toEqual({ bridge: 'later' });
    expect(laterBridge).toHaveBeenLastCalledWith(`/projects/${projectA}`, 'working-copy');
    const context = fileManager.getSnapshot().context as {
      openRevisionSessionPort: ReturnType<typeof vi.fn>;
      openComputeStorePort: ReturnType<typeof vi.fn>;
    };
    options.openRevisionsPort();
    options.openPlacementPort();
    options.openComputeStorePort();
    expect(context.openRevisionSessionPort.mock.calls).toEqual([
      ['reader', projectA],
      ['placement', projectA],
    ]);
    expect(context.openComputeStorePort).toHaveBeenCalledExactlyOnceWith(projectA);
  });

  it('should hand the next connect the choices the person changed after the connector was published (S7)', async () => {
    await openAndRender([projectA], { projectId: projectA });
    const connect = vi.mocked(chatSessions.publishProjectHostConnector).mock.calls.at(-1)?.[1];
    await act(async () => {
      await connect?.('chat-1');
    });
    /* The kernel and the model reach the host through the system prompt it is built with. */
    const promptOf = (): string =>
      String((browserClientOptions.at(-1) as { readonly systemPrompt?: string } | undefined)?.systemPrompt);
    expect(promptOf()).toContain('openscad');
    expect(promptOf()).toContain('fixture-model');
    expect(promptOf()).not.toContain('replicad');
    const publishes = vi.mocked(chatSessions.publishProjectHostConnector).mock.calls.length;

    act(() => {
      choiceStore.set({ model: 'later-model', kernel: 'replicad' });
    });
    await flushTasks();
    await act(async () => {
      await connect?.('chat-2');
    });

    /* The same connector, not a republished one, reads the new choices through the ref. */
    expect(vi.mocked(chatSessions.publishProjectHostConnector).mock.calls).toHaveLength(publishes);
    expect(promptOf()).toContain('replicad');
    expect(promptOf()).toContain('later-model');
    expect(promptOf()).not.toContain('fixture-model');
  });

  it('should retain the browser agent host once for the project and release it once with the subtree (S7)', async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    const connect = vi.mocked(chatSessions.publishProjectHostConnector).mock.calls.at(-1)?.[1];
    await act(async () => {
      await connect?.('chat-1');
      await connect?.('chat-2');
    });
    expect(browserLease).toEqual({ retained: [projectA], released: [] });

    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    expect(browserLease).toEqual({ retained: [projectA], released: [projectA] });
  });

  it("should forget the project's region reports when its subtree unmounts (S7)", async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    vi.mocked(forgetProjectRegions).mockClear();

    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    expect(vi.mocked(forgetProjectRegions).mock.calls).toEqual([[projectA]]);
  });

  it('should relay the revision facts to the session and to the chat store (S3)', async () => {
    await openAndRender([projectA], { projectId: projectA });

    act(() => {
      revisionClientOf(projectA).setStatus({
        projectDirty: true,
        line: { kind: 'branch', name: 'feature' },
        sync: { state: 'pending', pendingCount: 3 },
      });
    });
    await flushTasks();

    expect(sessionOf(projectA)?.getSnapshot().context).toMatchObject({ dirty: true, pushed: false, pending: 3 });
    expect(chatSessions.setRevisionFacts).toHaveBeenLastCalledWith(projectA, {
      dirty: true,
      sync: 'pending',
      branch: 'feature',
    });
  });

  it('should relay visibility and focus to the session, and the window hiding (S4)', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA });
    expect(sessionOf(projectA)?.getSnapshot().context).toMatchObject({ visible: true, focused: true });
    expect(sessionOf(projectB)?.getSnapshot().context).toMatchObject({ visible: false, focused: false });

    await hide();
    expect(sessionOf(projectA)?.getSnapshot().context).toMatchObject({ visible: false, focused: true });

    visibility = 'visible';
    view.rerender(tree({ projectId: projectB }));
    await flushTasks();
    expect(sessionOf(projectA)?.getSnapshot().context).toMatchObject({ visible: false, focused: false });
    expect(sessionOf(projectB)?.getSnapshot().context).toMatchObject({ visible: true, focused: true });
  });

  it('should park the runtime of a hidden project nobody is on, and resume it when focus returns (S5)', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA });
    expect(sentOf(`project:${projectB}`)).not.toContain('parkRuntime');

    await act(async () => {
      await clock.advanceAsync(projectSessionParkWindowMilliseconds);
    });
    expect(sentOf(`project:${projectB}`)).toContain('parkRuntime');
    expect(sentOf(`project:${projectA}`)).not.toContain('parkRuntime');

    view.rerender(tree({ projectId: projectB }));
    await flushTasks();
    expect(sentOf(`project:${projectB}`).at(-1)).toBe('resumeRuntime');
  });

  it("should hand the route the focused project's leave flush, which flushes its producers and editor (S6)", async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });
    const registration = flushRegistrations.findLast((entry) => entry !== undefined);
    expect(registration?.projectId).toBe(projectA);
    fixtures.order.length = 0;

    await act(async () => {
      await registration?.flush();
    });

    expect(fixtures.order).toEqual([`producer:${projectA}`, `editor:${projectA}:flushNow`]);
  });

  it('should register the close services, so a close cancels, flushes producers, cuts and releases in order (S7)', async () => {
    await openAndRender([projectA], { projectId: projectA });
    act(() => {
      sessionOf(projectA)?.send({ type: 'projectedRunsChanged', runs: [], stoppableRuns: ['chat-1'] });
    });
    fixtures.order.length = 0;

    await act(async () => {
      registry.send({ type: 'close', projectId: projectA, reason: 'user' });
      await Promise.resolve();
    });
    await flushTasks();

    expect(fixtures.order.filter((entry) => !entry.startsWith('unmount:'))).toEqual([
      'cancel:chat-1',
      `producer:${projectA}`,
      `project:${projectA}:flushNow`,
      `editor:${projectA}:flushNow`,
      `quiesce:${projectA}`,
      `project:${projectA}:closeRuntime`,
    ]);
    expect(sessionOf(projectA)).toBeUndefined();
  });

  it('should register each live session with the chat store and clear it when the subtree goes (S7)', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA });
    const sessionA = sessionOf(projectA);
    expect(vi.mocked(chatSessions.setProjectSession).mock.calls).toContainEqual([projectA, sessionA]);
    expect(vi.mocked(chatSessions.setProjectSession).mock.calls).toContainEqual([projectB, sessionOf(projectB)]);

    view.unmount();

    expect(vi.mocked(chatSessions.setProjectSession).mock.calls.at(-1)?.[1]).toBeUndefined();
    /* One clear per project from StrictMode's rehearsal cleanup, and one per project on unmount. */
    expect(
      vi.mocked(chatSessions.setProjectSession).mock.calls.filter(([, session]) => session === undefined),
    ).toHaveLength(4);
  });

  it('should name only the focused project to the chat store, and clear it when focus leaves (S7)', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA });
    expect(vi.mocked(chatSessions.setFocusedProject).mock.calls.at(-1)).toEqual([projectA]);
    expect(vi.mocked(chatSessions.setFocusedProject).mock.calls).not.toContainEqual([projectB]);

    view.rerender(tree(undefined));
    await flushTasks();

    expect(vi.mocked(chatSessions.setFocusedProject).mock.calls.at(-1)).toEqual([undefined]);
  });

  it('should hold the revision long poll for the focused project only (S7)', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA });
    expect(revisionClientOf(projectA).focus).toHaveBeenLastCalledWith(true);
    expect(revisionClientOf(projectB).focus).toHaveBeenLastCalledWith(false);

    view.rerender(tree({ projectId: projectB }));
    await flushTasks();

    expect(revisionClientOf(projectA).focus).toHaveBeenLastCalledWith(false);
    expect(revisionClientOf(projectB).focus).toHaveBeenLastCalledWith(true);
  });

  it('should publish one host connector per live project and withdraw it with the subtree (S7)', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA });
    const publishedFor = new Set(vi.mocked(chatSessions.publishProjectHostConnector).mock.calls.map(([id]) => id));
    expect(publishedFor).toEqual(new Set([projectA, projectB]));
    const withdrawnBefore = unpublishConnector.mock.calls.length;

    view.unmount();

    expect(unpublishConnector.mock.calls.length - withdrawnBefore).toBe(2);
  });

  it('should refresh a foreign chat log written for an observed chat, and ignore one it does not observe (S7)', async () => {
    await openAndRender([projectA], { projectId: projectA });
    const channel = fileManagerOf(projectA).workerChangeChannel;

    act(() => {
      channel.write(`/projects/${projectA}/.tau/chats/chat-observed/events/segment-1.jsonl`);
      channel.write(`/projects/${projectA}/.tau/chats/chat-other/events/segment-1.jsonl`);
    });
    await flushTasks();

    expect(vi.mocked(chatSessions.refreshRemoteSegments).mock.calls).toEqual([['chat-observed', projectA]]);
  });

  it('should retry the manifest observation once a cloud open has applied its remote (S7)', async () => {
    tauCloudIntent.set(projectA, 'open');
    await openAndRender([projectA], { projectId: projectA });
    expect(retrySpyOf(projectA)).not.toHaveBeenCalled();

    act(() => {
      revisionClientOf(projectA).setStatus({ sync: { state: 'noRemote', pendingCount: 0, hasAppliedRemote: true } });
    });
    await flushTasks();

    expect(retrySpyOf(projectA)).toHaveBeenCalled();
  });

  it('should mount one revision client lifecycle per live project and cut the close through it (S27)', async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });
    /* StrictMode mounts, unmounts and remounts every effect once. */
    expect(fixtures.lifecycleMounts.filter((entry) => entry === `mount:${projectA}`)).toHaveLength(2);
    expect(fixtures.lifecycleMounts.filter((entry) => entry === `mount:${projectB}`)).toHaveLength(2);

    await act(async () => {
      registry.send({ type: 'close', projectId: projectB, reason: 'user' });
      await Promise.resolve();
    });
    await flushTasks();

    expect(revisionClientOf(projectB).quiesce).toHaveBeenCalledOnce();
    expect(revisionClientOf(projectA).quiesce).not.toHaveBeenCalled();
    expect(fixtures.lifecycleMounts.at(-1)).toBe(`close:${projectB}`);
  });
});

// ===========================================================================
// I5: session facts do not depend on a mount
// ===========================================================================

describe('a live session whose binding is not mounted (A0.2 item 7, I5)', () => {
  it('should keep the session live when its binding unmounts', async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    const session = sessionOf(projectA);

    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    expect(sessionOf(projectA)).toBe(session);
    expect(session?.getSnapshot().matches('live')).toBe(true);
  });

  it.fails('I5: should still hear that the window hid after its binding unmounted', async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    await hide();

    expect(sessionOf(projectA)?.getSnapshot().context.visible).toBe(false);
  });

  it.fails('I5: should still flush its producers and take its close cut when it closes without a binding', async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();
    fixtures.order.length = 0;

    await act(async () => {
      registry.send({ type: 'close', projectId: projectA, reason: 'user' });
      await Promise.resolve();
    });
    await flushTasks();

    expect(sessionOf(projectA)).toBeUndefined();
    expect(fixtures.order).toEqual([
      `producer:${projectA}`,
      `project:${projectA}:flushNow`,
      `editor:${projectA}:flushNow`,
      `quiesce:${projectA}`,
      `project:${projectA}:closeRuntime`,
    ]);
  });
});

// ===========================================================================
// cancelRuns (D18), the chat request (S12) and the guard's walk (S40)
// ===========================================================================

describe('cancelRuns on close (A0.2 item 8, D18)', () => {
  /*
   * `chat-still` was listed stoppable and its projection never moved after that: the store's own answer for
   * a projection that has not caught up is 'absent' (`ChatSessionStore.cancelProjectedRun`). `chat-moving`
   * joins later and is stopped. The close must still ask for both and complete.
   */
  it('should cancel every stoppable chat, including one whose projection has not moved since it was listed', async () => {
    vi.mocked(chatSessions.cancelProjectedRun).mockImplementation(async (chatId) => {
      fixtures.order.push(`cancel:${chatId}`);
      return chatId === 'chat-still' ? 'absent' : 'stopped';
    });
    try {
      await openAndRender([projectA], { projectId: projectA });
      act(() => {
        sessionOf(projectA)?.send({
          type: 'projectedRunsChanged',
          runs: ['chat-still'],
          stoppableRuns: ['chat-still'],
        });
        /* Only `chat-moving` moves: it joins the projection; `chat-still` is listed as it was. */
        sessionOf(projectA)?.send({
          type: 'projectedRunsChanged',
          runs: ['chat-moving', 'chat-still'],
          stoppableRuns: ['chat-moving', 'chat-still'],
        });
      });

      await act(async () => {
        registry.send({ type: 'close', projectId: projectA, reason: 'user' });
        sessionOf(projectA)?.send({ type: 'confirmClose' });
        await Promise.resolve();
      });
      await flushTasks();

      expect(new Set(vi.mocked(chatSessions.cancelProjectedRun).mock.calls.map(([chatId]) => chatId))).toEqual(
        new Set(['chat-moving', 'chat-still']),
      );
      const answers = await Promise.all(
        vi
          .mocked(chatSessions.cancelProjectedRun)
          .mock.results.map(async ({ value }) => value as Promise<'stopped' | 'continuing' | 'absent'>),
      );
      expect(new Set(answers)).toEqual(new Set(['absent', 'stopped']));
      expect(sessionOf(projectA)).toBeUndefined();
    } finally {
      vi.mocked(chatSessions.cancelProjectedRun).mockImplementation(stopProjectedRun);
    }
  });
});

describe("the chat request after open reaches the project's editor (A0.2 item 3, S12)", () => {
  it('should send an unknown chat as setRequestedChatId and a created chat as focusKnownChat', async () => {
    const view = await openAndRender([projectA], { projectId: projectA, requestedChatId: 'chat-1' });
    const editor = actorFor(`editor:${projectA}`);
    const send = vi.spyOn(editor, 'send');

    view.rerender(tree({ projectId: projectA, requestedChatId: 'chat-2' }));
    await flushTasks();
    view.rerender(tree({ projectId: projectA, requestedChatId: 'chat-new', createdChatId: 'chat-new' }));
    await flushTasks();

    expect(send.mock.calls.map(([event]) => event)).toEqual([
      { type: 'setRequestedChatId', chatId: 'chat-2' },
      { type: 'focusKnownChat', chatId: 'chat-new' },
    ]);
  });

  it('should send a listed chat as focusKnownChat', async () => {
    queryClient.setQueryData(['chats', projectA, { includeDeleted: false }], [{ id: 'chat-listed' }]);
    const view = await openAndRender([projectA], { projectId: projectA, requestedChatId: 'chat-1' });
    const send = vi.spyOn(actorFor(`editor:${projectA}`), 'send');

    view.rerender(tree({ projectId: projectA, requestedChatId: 'chat-listed' }));
    await flushTasks();

    expect(send.mock.calls.map(([event]) => event)).toEqual([{ type: 'focusKnownChat', chatId: 'chat-listed' }]);
  });

  it('should clear the request while the project is retained, and send the chat it regains focus with', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA, requestedChatId: 'chat-1' });
    const send = vi.spyOn(actorFor(`editor:${projectA}`), 'send');

    view.rerender(tree({ projectId: projectB }));
    await flushTasks();
    view.rerender(tree({ projectId: projectA, requestedChatId: 'chat-2' }));
    await flushTasks();

    expect(send.mock.calls.map(([event]) => event)).toEqual([
      { type: 'setRequestedChatId', chatId: undefined },
      { type: 'setRequestedChatId', chatId: 'chat-2' },
    ]);
  });
});

describe("the persistence guard walks the project's producer set (A0.2 item 10, S40)", () => {
  it('should flush a producer of a live project nobody is on when the page hides', async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });
    fixtures.order.length = 0;

    await hide();

    expect(fixtures.order).toContain(`producer:${projectB}`);
    expect(fixtures.order.indexOf(`producer:${projectB}`)).toBeLessThan(
      fixtures.order.indexOf(`editor:${projectB}:flushNow`),
    );
    expect(fixtures.order).toContain(`project:${projectB}:flushNow`);
  });

  it('should hold the hidden flush of an unfocused project until its producer settles', async () => {
    const producer = Promise.withResolvers<void>();
    fixtures.chatProducers.set(projectB, async () => producer.promise);
    await openAndRender([projectA, projectB], { projectId: projectA });
    fixtures.order.length = 0;

    await hide();
    expect(fixtures.order).toContain(`producer:${projectB}`);
    expect(fixtures.order).not.toContain(`editor:${projectB}:flushNow`);

    producer.resolve();
    await flushTasks();
    expect(fixtures.order).toContain(`editor:${projectB}:flushNow`);
  });
});
