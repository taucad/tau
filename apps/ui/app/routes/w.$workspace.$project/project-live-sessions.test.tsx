/**
 * Every live project's resource subtree, characterised before it moves into the session (app state
 * orchestration A0.2, inventory S1 to S7, S12, S26, S27 and S40).
 *
 * The registry is real (`createSessionsActor` on a `StepClock`), and so are the unload sequencer,
 * `LiveProjectSessions`, the binding and `ProjectProvider` with its lease and the
 * runtime's producer set. Since A7b the registry carries the session wiring the app runtime composes: each
 * session's `revisions` and `hostConnector` children run the real modules, and its presence reads focus and
 * the page's visibility. Only the leaves are stand-ins: the project and editor actors (as the leased
 * project runtime spawns them, since A6b; before it, as `useActorRef` returned them), the file manager,
 * the revision client, focus, the choices and the chat store. Each row renders under StrictMode, as the app
 * does in development.
 */

import { StrictMode, createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeEnvironmentHost, startEnvironmentHost } from '#runtime/environment.fixture.js';
import type { EnvironmentHostFixture } from '#runtime/environment.fixture.js';
import { mock } from 'vitest-mock-extended';
import type { Actor } from 'xstate';
import { StepClock } from '@taucad/xstate-testing/clock';
import type * as XstateReactModule from '@xstate/react';
import type * as UseProjectModule from '#hooks/use-project.js';
import type * as ProjectRuntimeModule from '#runtime/project-runtime.js';
import type { ProjectRuntimeOptions } from '#runtime/project-runtime.js';
import { AppRuntimeProvider } from '#runtime/app-runtime-provider.js';
import { createAppRuntime } from '#runtime/app-runtime.js';
import type * as CloudProjectsModule from '#hooks/use-cloud-projects.js';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import { projectSessionParkWindowMilliseconds } from '#machines/project-session.machine.js';
import { SessionsProvider, useLiveProjectIds } from '#hooks/use-sessions.js';
import { UnloadProvider, useFlushOnClose } from '#hooks/use-flush-on-close.js';
import { createSessionsActor, selectProjectSessionRuntime } from '#services/sessions-store.js';
import type { SessionRuntimeOpener, SessionsObservable, SessionWiring } from '#services/sessions-store.js';
import { revisionClients } from '@taucad/revisions-ui/services/revision-client-registry';
import { focusedProjectStandIn } from '#services/focused-project.fixture.js';
import type { ProjectChoices } from '#runtime/choices.js';
import { openSessionProjectRuntime, sessionProjectRuntimeOf } from '#runtime/project-runtime.session.js';
import { openSessionFileManagerStandIn } from '#runtime/session-file-manager.fixture.js';
import { tauCloudIntent } from '#lib/tau-cloud-intent.js';

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
      /* A parent state matches while any of its children does, as XState's `matches` answers. */
      matches: (value) =>
        value === 'ready'
          ? active.has('ready') || [...active].some((state) => state.startsWith('{"ready":'))
          : active.has(typeof value === 'string' ? value : JSON.stringify(value)),
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
  entryManifest?: string;
}>;

/** One project's revision client: the session's close cut, the focus long poll and what the lifecycle sends it. */
type FixtureRevisionClient = Readonly<{
  focus: ReturnType<typeof vi.fn<(focused: boolean) => void>>;
  quiesce: ReturnType<typeof vi.fn<() => Promise<void>>>;
  /* The lifecycle's open and close of the client: the I5 row watches these, which outlive the binding (A7b). */
  open: ReturnType<typeof vi.fn<() => void>>;
  close: ReturnType<typeof vi.fn<() => void>>;
  send: ReturnType<typeof vi.fn<(command: unknown) => void>>;
  setUser: ReturnType<typeof vi.fn<(user: unknown) => Promise<void>>>;
  setCredential: ReturnType<typeof vi.fn<(source: unknown) => Promise<boolean>>>;
  saveRevision: ReturnType<typeof vi.fn<(trigger?: string) => Promise<void>>>;
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
    open: vi.fn<() => void>(),
    close: vi.fn<() => void>(),
    send: vi.fn<(command: unknown) => void>(),
    setUser: vi.fn(async (_user: unknown) => undefined),
    setCredential: vi.fn(async (_source: unknown) => true),
    saveRevision: vi.fn(async (_trigger?: string) => undefined),
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
  fileManagers: new Map<string, unknown>(),
  /** The file manager each project's session provider was last rendered with. */
  providedFileManagers: new Map<string, unknown>(),
  retryManifestObservation: new Map<string, unknown>(),
  chatProducers: new Map<string, () => Promise<void>>(),
  /** The S40 rows give each project a second producer; other rows keep the one. */
  secondProducer: false,
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

const fixtureWorker = { name: 'fixture-worker' } as unknown as Worker;

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
        /* A7b: the session's `revisions` and `hostConnector` children start once the file manager has a worker. */
        worker: fixtureWorker,
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
    /* A component that still builds an actor here gets its stand-in. */
    useActorRef: (logic: { readonly id: string }, options: { readonly input: { readonly projectId: string } }) =>
      actorFor(`${logic.id}:${options.input.projectId}`),
  };
});

/* `ProjectProvider` leases its project runtime, which spawns the project and editor actors (A6b): the stand-in
 * runtime hands the rows' stand-ins to the provider and owns the real producer set. Its start is the editor's
 * `load`, as the real root's entry is. The runtime's entries record child stands in for every record producer of a
 * live project, focused or not: it registers in the producer set when the runtime starts and leaves it when the
 * runtime stops (A9, S40). */
vi.mock('#runtime/project-runtime.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectRuntimeModule>();
  return {
    ...actual,
    createProjectRuntime: (options: ProjectRuntimeOptions) => {
      const projectRef = actorFor(`project:${options.projectId}`);
      const editorRef = actorFor(`editor:${options.projectId}`);
      const snapshot = { status: 'active', context: { projectRef, editorRef, manifestObservationError: undefined } };
      const producers = actual.createProjectRuntimeProducers();
      const { projectId } = options;
      const registrations: Array<() => void> = [];
      const actor = {
        getSnapshot: () => snapshot,
        subscribe: () => ({ unsubscribe: () => undefined }),
        send: () => undefined,
        start: () => {
          editorRef.send({ type: 'load' });
          if (options.entriesRecord !== undefined) {
            registrations.push(
              producers.register(async () => {
                fixtures.order.push(`producer:${projectId}`);
                await fixtures.chatProducers.get(projectId)?.();
              }),
            );
            /* A second member of the set, so the session's flush is seen walking every producer, not the first. */
            if (fixtures.secondProducer) {
              registrations.push(
                producers.register(async () => {
                  fixtures.order.push(`producer:${projectId}:second`);
                  await fixtures.chatProducers.get(`${projectId}:second`)?.();
                }),
              );
            }
          }
          return actor;
        },
        stop: () => {
          for (const unregister of registrations.splice(0)) {
            unregister();
          }
          return actor;
        },
      };
      return {
        actor,
        parameterService: { get: () => parameterService, subscribe: () => () => undefined },
        producers,
      };
    },
  };
});

vi.mock('#hooks/use-file-manager.js', () => ({
  SessionFileManagerProvider: ({
    children,
    projectId,
    fileManagerRef,
  }: React.PropsWithChildren<{ projectId: string; fileManagerRef: unknown }>) => {
    fixtures.providedFileManagers.set(projectId, fileManagerRef);
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
  const { revisionClients } = await import('@taucad/revisions-ui/services/revision-client-registry');
  return {
    /* The project's one client, in the real table the session's close reads it from (`peekRevisionClient`). */
    getRevisionClient: ({ projectId, worker }: { readonly projectId: string; readonly worker: Worker }) => {
      const client = revisionClientOf(projectId);
      revisionClients.set(projectId, { client: client as never, worker });
      return client;
    },
    useRevisionClient: () => revisionClientOf(useProject().projectId),
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
  /* The app runtime's `choices` derives the default model with it (A6b). */
  catalogDefaultModelId: () => undefined,
  /* The session's connector resolves a chat's model against the catalog its choices hold (A7b). */
  resolveCatalogModel: (id: string) => ({
    id,
    name: id,
    isResolved: false,
    provider: { id: 'unknown', name: 'Unknown' },
  }),
  useModels: () => {
    const { model } = useSyncExternalStore(choiceStore.subscribe, choiceStore.get);
    return {
      defaultExecution: { kind: 'tau', model },
      resolveModel: (id: string) => ({ id, name: id, isResolved: false, provider: { id: 'unknown', name: 'Unknown' } }),
    };
  },
}));
vi.mock('#hooks/use-kernel.js', () => ({
  resolveRememberedKernel: () => ({ kernel: 'openscad' }),
  useKernel: () => ({ kernel: useSyncExternalStore(choiceStore.subscribe, choiceStore.get).kernel }),
}));
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
vi.mock('@taucad/files-ui/filesystem/handle-store', async (importOriginal) => ({
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
  publishProjectHostConnector: vi.fn(() => unpublishConnector),
  getChatHostSettings: vi.fn(async () => undefined),
  cancelProjectedRun: vi.fn(stopProjectedRun),
  refreshRemoteSegments: vi.fn(async () => undefined),
  observedChatIdsOf: vi.fn(() => ['chat-observed']),
});

const { LiveProjectSessions } = await import('#routes/w.$workspace.$project/project-live-sessions.js');
const sessionRevisionsModule = await import('#runtime/session-revisions.js');
const hostConnectorModule = await import('#runtime/host-connector.js');

// ===========================================================================
// Harness
// ===========================================================================

const projectA = 'proj_live_aaaaaaaaaaaaaaa';
const projectB = 'proj_live_bbbbbbbbbbbbbbb';

let visibility: DocumentVisibilityState = 'visible';
let clock: StepClock;
let registry: Actor<typeof sessionsMachine>;

/** The session runtime opener the app composes, over the rows' query cache and a local kernel. */
const sessionRuntimeOpener = (client: QueryClient): SessionRuntimeOpener => ({
  open: async (input) =>
    openSessionProjectRuntime(input, {
      library: mock(),
      chatSessions: { noteCreatedEmpty: () => undefined },
      queryClient: client,
      choices: () => ({
        computePlacement: { state: 'local' },
        computeSelectionRevision: 0,
        computeReuseMode: 'durable',
        computeReuseRevision: 0,
      }),
      awaitServices: async () => Promise.withResolvers<never>().promise,
      clock,
    }),
  onChoicesChanged: () => () => undefined,
});
let queryClient: QueryClient;
/* The app runtime `ProjectProvider` leases its project runtime from; the rows' query client is its own (A6b). */
let appRuntime: ReturnType<typeof createAppRuntime>;

type Focus = Readonly<{ projectId: string }> | undefined;

function Sessions({ focus }: { readonly focus: Focus }): React.JSX.Element {
  const liveProjectIds = useLiveProjectIds();
  return (
    <LiveProjectSessions
      focused={focus === undefined ? undefined : { projectId: focus.projectId }}
      liveProjectIds={liveProjectIds}
    />
  );
}

/** A session-stage registration of its own, so a row can see when the session stage runs. */
function SessionStageProbe(): undefined {
  useFlushOnClose(
    () => {
      fixtures.order.push('session-stage');
    },
    { stage: 'session' },
  );
  return undefined;
}

/** The project focus is on, as the route's focus says it (A7b): what the sessions and the chat store hear. */
const focusedProject = focusedProjectStandIn();

/** The page's visibility as `environment` reports it: each `visibilitychange` is a report. */
const documentVisible: SessionsObservable<boolean> = {
  get: () => visibility === 'visible',
  subscribe: (listener) => {
    document.addEventListener('visibilitychange', listener);
    return () => {
      document.removeEventListener('visibilitychange', listener);
    };
  },
};

/** The session wiring the app runtime composes (A7b), over the rows' stand-ins. */
const sessionWiring = (): SessionWiring => ({
  /* Loaded with the suite, so a row's first open does not wait on the transform the app's chunk never needs. */
  loadRevisions: async () => sessionRevisionsModule,
  loadHostConnector: async () => hostConnectorModule,
  /* `environment`'s sequencer, read when the child registers: the rows start it after the registry. */
  registerCloseCut: (cut) => unloadEnvironment?.sequencer.register('session', cut) ?? (() => undefined),
  /* A7c: each live session's producer-stage flush, on the same sequencer. */
  registerProducer: (flush) => unloadEnvironment?.sequencer.register('producer', flush) ?? (() => undefined),
  focusedProject,
  documentVisible,
  chatSessions,
  choices: () => ({
    computePlacement: { state: 'local' },
    computeSelectionRevision: 0,
    computeReuseMode: 'durable',
    computeReuseRevision: 0,
    defaultExecution: { kind: 'tau', model: choiceStore.get().model },
    modelCatalog: { status: 'loading' },
    modelPinning: true,
    defaultKernel: choiceStore.get().kernel as ProjectChoices['defaultKernel'],
    testingEnabled: true,
  }),
  rootSync: () => ({ syncProjectRoots: async () => undefined, close: () => undefined }),
});

/**
 * The app's root composition around the live sessions: app runtime, unload sequencer, query client, registry. The
 * route's focus moves with it, as the focus child moves it in the app.
 */
const tree = (focus: Focus, mounted = true, sessionProbe = false): React.JSX.Element => {
  if (focusedProject.get() !== focus?.projectId) {
    focusedProject.set(focus?.projectId);
  }
  return (
    <StrictMode>
      <AppRuntimeProvider runtime={appRuntime}>
        <UnloadProvider sequencer={unloadEnvironment?.sequencer}>
          {sessionProbe ? <SessionStageProbe /> : null}
          <QueryClientProvider client={queryClient}>
            <SessionsProvider actor={registry}>{mounted ? <Sessions focus={focus} /> : null}</SessionsProvider>
          </QueryClientProvider>
        </UnloadProvider>
      </AppRuntimeProvider>
    </StrictMode>
  );
};

const flushTasks = async (): Promise<void> => {
  await act(async () => {
    await new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, 0);
    });
  });
};

const sessionOf = (projectId: string) => registry.getSnapshot().context.refs[projectId];

/** The legitimate way a subtree goes: the registry closes the project, so it leaves the live set. */
const closeThroughRegistry = async (projectIds: readonly string[]): Promise<void> => {
  await act(async () => {
    for (const projectId of projectIds) {
      registry.send({ type: 'close', projectId, reason: 'user' });
    }
    await Promise.resolve();
  });
  await flushTasks();
  for (const projectId of projectIds) {
    expect(sessionOf(projectId)).toBeUndefined();
  }
};

/** Open projects through the registry, render the subtrees and let every region report. */
const openAndRender = async (
  projectIds: readonly string[],
  focus: Focus,
  chat?: Readonly<{ chatId?: string; createdChatId?: string }>,
): Promise<ReturnType<typeof render>> => {
  for (const projectId of projectIds) {
    registry.send({
      type: 'open',
      projectId,
      ...(chat === undefined || projectId !== focus?.projectId ? {} : { request: { workspace: 'ws', ...chat } }),
    });
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
  fixtures.providedFileManagers.clear();
  /* Each session opens a stand-in file manager, ready at once, so the provider is handed a real session's ref. */
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /* A6d: each session's child builds its runtime through the real session module, over the stand-in project runtime. */
  focusedProject.set(undefined);
  revisionClients.clear();
  registry = createSessionsActor({
    clock,
    /* The stand-in's lifecycle, over the project's fixture file manager, which the binding and the session's children
     * read and a row moves. */
    openFileManager: (id) => ({
      ...openSessionFileManagerStandIn(id),
      fileManagerRef: fileManagerOf(id).fileManagerRef as never,
    }),
    openRuntime: sessionRuntimeOpener(queryClient),
    wiring: sessionWiring(),
  }).start();
  appRuntime = createAppRuntime({
    clock,
    environment: () => createFakeEnvironmentHost(),
    idleFileManagers: true,
    queryClient,
  });
  fixtures.order.length = 0;
  fixtures.actors.clear();
  fixtures.revisionClients.clear();
  fixtures.fileManagers.clear();
  fixtures.retryManifestObservation.clear();
  fixtures.chatProducers.clear();
  fixtures.secondProducer = false;
  browserClientOptions.length = 0;
  browserLease.retained.length = 0;
  browserLease.released.length = 0;
  choiceStore.reset();
  vi.clearAllMocks();
});

afterEach(() => {
  registry.stop();
  appRuntime.stop();
  tauCloudIntent.set(projectA, undefined);
});

// ===========================================================================
// The binding and, since A7b, the session's own children: one row per relay (S1 to S7, S27), under StrictMode
// ===========================================================================

/* D26: `environment` is the page's one unload listener; it drives the registrations these rows mount. */
let unloadEnvironment: EnvironmentHostFixture | undefined;
beforeEach(() => {
  unloadEnvironment = startEnvironmentHost();
});
afterEach(() => {
  unloadEnvironment?.stop();
  unloadEnvironment = undefined;
});

describe('ProjectSessionBinding relays (A0.2 item 7)', () => {
  it('should bring the session live once the views and runtime regions report ready (S7)', async () => {
    await openAndRender([projectA], { projectId: projectA });

    expect(sessionOf(projectA)?.getSnapshot().matches('live')).toBe(true);
  });

  it("should render the session subtree over the file manager its session's child opened (A6c)", async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });

    const fileManagerOf = (projectId: string) => sessionOf(projectId)?.getSnapshot().context.fileManagerRef;
    expect(fileManagerOf(projectA)).toBeDefined();
    expect(fixtures.providedFileManagers.get(projectA)).toBe(fileManagerOf(projectA));
    expect(fixtures.providedFileManagers.get(projectB)).toBe(fileManagerOf(projectB));
    expect(fileManagerOf(projectA)).not.toBe(fileManagerOf(projectB));
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

  it('should retain the browser agent host once for the project and release it once when the registry closes it (S7)', async () => {
    await openAndRender([projectA], { projectId: projectA });
    const connect = vi.mocked(chatSessions.publishProjectHostConnector).mock.calls.at(-1)?.[1];
    await act(async () => {
      await connect?.('chat-1');
      await connect?.('chat-2');
    });
    expect(browserLease).toEqual({ retained: [projectA], released: [] });

    await closeThroughRegistry([projectA]);

    expect(browserLease).toEqual({ retained: [projectA], released: [projectA] });
  });

  it("should stop the project's runtime when the registry closes it (S7, A6d)", async () => {
    await openAndRender([projectA], { projectId: projectA });
    const runtimeRef = selectProjectSessionRuntime(sessionOf(projectA)!.getSnapshot());
    expect(runtimeRef === undefined ? undefined : sessionProjectRuntimeOf(runtimeRef)).toBeDefined();

    await closeThroughRegistry([projectA]);

    expect(sessionProjectRuntimeOf(runtimeRef!)).toBeUndefined();
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

  it("should flush the focused project's producers and editor when its session is asked for the leave flush (S6, A7c)", async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });
    const session = sessionOf(projectA)!;
    const settled: unknown[] = [];
    session.on('flushSettled', (event) => settled.push(event));
    fixtures.order.length = 0;

    act(() => {
      session.send({ type: 'flushAsked', requestId: 'leave:1', kind: 'leave' });
    });
    await flushTasks();

    expect(fixtures.order).toEqual([`producer:${projectA}`, `editor:${projectA}:flushNow`]);
    expect(settled).toEqual([{ type: 'flushSettled', projectId: projectA, requestId: 'leave:1', ok: true }]);
  });

  it("should close through the session's children in order: cancel, producers, stores, quiesce, runtime (S7, A7c)", async () => {
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

  /* A7c: the chat store follows the registry's live set through the app runtime, not the binding: the row lives in
   * `app-runtime.wiring.test.tsx` ("should bind each live project's session to the chat store ..."). */

  it('should hold the revision long poll for the focused project only (S7)', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA });
    expect(revisionClientOf(projectA).focus).toHaveBeenLastCalledWith(true);
    expect(revisionClientOf(projectB).focus).toHaveBeenLastCalledWith(false);

    view.rerender(tree({ projectId: projectB }));
    await flushTasks();

    expect(revisionClientOf(projectA).focus).toHaveBeenLastCalledWith(false);
    expect(revisionClientOf(projectB).focus).toHaveBeenLastCalledWith(true);
  });

  it('should publish one host connector per live project and withdraw it when the registry closes the project (S7)', async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });
    const publishedFor = new Set(vi.mocked(chatSessions.publishProjectHostConnector).mock.calls.map(([id]) => id));
    expect(publishedFor).toEqual(new Set([projectA, projectB]));
    const withdrawnBefore = unpublishConnector.mock.calls.length;

    await closeThroughRegistry([projectA, projectB]);

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

  /* STO-25: the model renders from the first view once the manifest is read again after the closure landed it. */
  it('should retry the manifest observation once a cloud open’s write names the tau.json it landed', async () => {
    tauCloudIntent.set(projectA, 'open');
    await openAndRender([projectA], { projectId: projectA });
    expect(retrySpyOf(projectA)).not.toHaveBeenCalled();

    act(() => {
      revisionClientOf(projectA).setStatus({ entryManifest: 'a'.repeat(64) });
    });
    await flushTasks();

    expect(retrySpyOf(projectA)).toHaveBeenCalledOnce();
  });

  it('should open one revision client per live project from its session, and cut the close through it (S27, A7b)', async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });
    /* The session's `revisions` child opens it, not an effect: StrictMode's remount no longer reopens it. */
    expect(revisionClientOf(projectA).open).toHaveBeenCalledOnce();
    expect(revisionClientOf(projectB).open).toHaveBeenCalledOnce();

    await act(async () => {
      registry.send({ type: 'close', projectId: projectB, reason: 'user' });
      await Promise.resolve();
    });
    await flushTasks();

    expect(revisionClientOf(projectB).quiesce).toHaveBeenCalledOnce();
    expect(revisionClientOf(projectA).quiesce).not.toHaveBeenCalled();
    expect(revisionClientOf(projectB).close).toHaveBeenCalledOnce();
    expect(revisionClientOf(projectA).close).not.toHaveBeenCalled();
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

  it('I5: should still hear that the window hid after its binding unmounted', async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    await hide();

    expect(sessionOf(projectA)?.getSnapshot().context.visible).toBe(false);
  });

  it('I5: should keep the host connector of a live session published after its binding unmounted', async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    const withdrawnBefore = unpublishConnector.mock.calls.length;

    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    expect(sessionOf(projectA)?.getSnapshot().matches('live')).toBe(true);
    expect(unpublishConnector.mock.calls.length - withdrawnBefore).toBe(0);
  });

  /* A6d: the runtime region is the session's own child, so it no longer depends on the binding being mounted. */
  it("I5: should keep a live session's runtime after its binding unmounted", async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    const runtimeRef = selectProjectSessionRuntime(sessionOf(projectA)!.getSnapshot());

    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    expect(sessionOf(projectA)?.getSnapshot().matches('live')).toBe(true);
    expect(sessionOf(projectA)?.getSnapshot().context.failures).toEqual({});
    expect(sessionProjectRuntimeOf(runtimeRef!)).toBeDefined();
  });

  /* A0.2's red row "should keep a live session registered with the chat store after its binding unmounted" passes since
   * A7c, where it moved: the app runtime binds each live session to the chat store from the registry's live set, with
   * nothing mounted (`app-runtime.wiring.test.tsx`). */

  /* A0.2 carried this row to A7a; A7b made it pass: the session's `revisions` child owns the client (row S27). */
  it('I5: should keep the revision client of a live session open after its binding unmounted', async () => {
    const view = await openAndRender([projectA], { projectId: projectA });
    const client = revisionClientOf(projectA);
    expect(client.open.mock.calls.length).toBeGreaterThan(client.close.mock.calls.length);
    const closesBefore = client.close.mock.calls.length;

    view.rerender(tree({ projectId: projectA }, false));
    await flushTasks();

    expect(sessionOf(projectA)?.getSnapshot().matches('live')).toBe(true);
    expect(client.close.mock.calls.length - closesBefore).toBe(0);
  });

  /* A0.2 carried this row red; A7c makes it pass: the session's close steps run over its own children (row S6). */
  it('I5, I6: should still flush its producers and take its close cut when it closes without a binding', async () => {
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
// cancelRuns (D18), the chat request (S12) and the session's walk of the producer set (S40)
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
  /* A6d: focus's `chatRequested` reaches the session, whose `project` child asks the editor; no prop carries it. */
  const requestChat = async (projectId: string, chatId?: string, createdChatId?: string): Promise<void> => {
    act(() => {
      registry.send({
        type: 'chatRequested',
        projectId,
        ...(chatId === undefined ? {} : { chatId }),
        ...(createdChatId === undefined ? {} : { createdChatId }),
      });
    });
    await flushTasks();
  };

  it('should send an unknown chat as setRequestedChatId and a created chat as focusKnownChat', async () => {
    await openAndRender([projectA], { projectId: projectA }, { chatId: 'chat-1' });
    const editor = actorFor(`editor:${projectA}`);
    const send = vi.spyOn(editor, 'send');

    await requestChat(projectA, 'chat-2');
    await requestChat(projectA, 'chat-new', 'chat-new');

    expect(send.mock.calls.map(([event]) => event)).toEqual([
      { type: 'setRequestedChatId', chatId: 'chat-2' },
      { type: 'focusKnownChat', chatId: 'chat-new' },
    ]);
  });

  it('should send a listed chat as focusKnownChat', async () => {
    queryClient.setQueryData(['chats', projectA, { includeDeleted: false }], [{ id: 'chat-listed' }]);
    await openAndRender([projectA], { projectId: projectA }, { chatId: 'chat-1' });
    const send = vi.spyOn(actorFor(`editor:${projectA}`), 'send');

    await requestChat(projectA, 'chat-listed');

    expect(send.mock.calls.map(([event]) => event)).toEqual([{ type: 'focusKnownChat', chatId: 'chat-listed' }]);
  });

  it('should keep the request while the project is retained (D14), and send the chat it regains focus with', async () => {
    const view = await openAndRender([projectA, projectB], { projectId: projectA }, { chatId: 'chat-1' });
    const send = vi.spyOn(actorFor(`editor:${projectA}`), 'send');

    view.rerender(tree({ projectId: projectB }));
    await flushTasks();
    view.rerender(tree({ projectId: projectA }));
    await requestChat(projectA, 'chat-2');

    expect(send.mock.calls.map(([event]) => event)).toEqual([{ type: 'setRequestedChatId', chatId: 'chat-2' }]);
  });
});

/* A7c: the persistence guard is gone; each live session registers once at the producer stage, and its `project` child
 * flushes the runtime's producer set and both stores for the unload, with nothing mounted (D26). */
describe("each session's unload flush walks the project's producer set (A0.2 item 10, S40, A7c)", () => {
  beforeEach(() => {
    fixtures.secondProducer = true;
  });

  it('should flush a producer of a live project nobody is on when the page hides', async () => {
    await openAndRender([projectA, projectB], { projectId: projectA });
    fixtures.order.length = 0;

    await hide();

    expect(fixtures.order).toContain(`producer:${projectB}`);
    expect(fixtures.order).toContain(`producer:${projectB}:second`);
    expect(fixtures.order.indexOf(`producer:${projectB}`)).toBeLessThan(
      fixtures.order.indexOf(`editor:${projectB}:flushNow`),
    );
    expect(fixtures.order.indexOf(`producer:${projectB}:second`)).toBeLessThan(
      fixtures.order.indexOf(`editor:${projectB}:flushNow`),
    );
    expect(fixtures.order).toContain(`project:${projectB}:flushNow`);
  });

  it('should hold the hidden flush of an unfocused project until every producer in its set settles', async () => {
    const first = Promise.withResolvers<void>();
    const second = Promise.withResolvers<void>();
    fixtures.chatProducers.set(projectB, async () => first.promise);
    fixtures.chatProducers.set(`${projectB}:second`, async () => second.promise);
    await openAndRender([projectA, projectB], { projectId: projectA });
    fixtures.order.length = 0;

    await hide();
    expect(fixtures.order).toContain(`producer:${projectB}`);
    expect(fixtures.order).toContain(`producer:${projectB}:second`);
    expect(fixtures.order).not.toContain(`project:${projectB}:flushNow`);
    expect(fixtures.order).not.toContain(`editor:${projectB}:flushNow`);

    first.resolve();
    await flushTasks();
    expect(fixtures.order).not.toContain(`project:${projectB}:flushNow`);
    expect(fixtures.order).not.toContain(`editor:${projectB}:flushNow`);

    second.resolve();
    await flushTasks();
    expect(fixtures.order).toContain(`project:${projectB}:flushNow`);
    expect(fixtures.order).toContain(`editor:${projectB}:flushNow`);
  });

  it("should hold the session stage on hide until the session's editor flush reaches storing idle (item 9)", async () => {
    registry.send({ type: 'open', projectId: projectA });
    render(tree({ projectId: projectA }, true, true));
    await flushTasks();
    const editor = actorFor(`editor:${projectA}`);
    act(() => {
      editor.set({ states: [JSON.stringify({ ready: { storing: 'saving' } })] });
    });
    fixtures.order.length = 0;

    await hide();

    expect(fixtures.order).toContain(`editor:${projectA}:flushNow`);
    expect(fixtures.order).not.toContain('session-stage');

    act(() => {
      editor.set({ states: [storingIdle] });
    });
    await flushTasks();

    expect(fixtures.order).toContain('session-stage');
    expect(fixtures.order.at(-1)).toBe('session-stage');
  });
});
