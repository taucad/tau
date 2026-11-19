/**
 * The app runtime's composition root (app state orchestration charter D5; MC-R4).
 *
 * {@link createAppRuntime} returns the root unstarted. The client entry creates one and holds it
 * (`app-runtime-holder.ts`); the server creates one per request and never starts it, so every reader renders the
 * initial snapshot on both sides and hydration matches. `AppRuntimeProvider` starts the client's after hydration.
 */
import { createActor, createCallbackLogic } from 'xstate';
import type {
  Actor,
  ActorOptions,
  ActorRefFrom,
  AnyActorLogic,
  EventObject,
  EventRejection,
  SnapshotFrom,
} from 'xstate';
import { hashKey } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { Topic } from '@taucad/events';
import type { HomeStorageBackend } from '@taucad/files-ui/filesystem/handle-store';
import type { Analytics } from '#hooks/use-analytics.js';
import type { FileManagerRef } from '#machines/file-manager.machine.types.js';
import type { sessionsMachine } from '#machines/sessions.machine.js';
import type { FocusMachine } from '#machines/focus.machine.js';
import { appRuntimeMachine } from '#runtime/app-runtime.machine.js';
import type { MachineActors } from '@taucad/ui-core/lib/xstate.lib';
import type { AppRuntimeEnvironment, AppRuntimeQuitHold } from '#runtime/app-runtime.machine.js';
import { createEnvironmentLogic, createUnloadSequencer } from '#runtime/environment.js';
import { owedRecordWrites } from '#workbench-records/owed-writes.js';
import type { EnvironmentDesktopQuit, EnvironmentHost, UnloadSequencer } from '#runtime/environment.js';
import { createFocusComposition } from '#runtime/app-runtime-focus.js';
import type { FocusHandle } from '#runtime/app-runtime-focus.js';
import { openProjectWorkspace } from '#lib/project-workspace-warmup.js';
import { onDesktopQuitRequested, reportDesktopQuiesced } from '@taucad/files-ui/filesystem/desktop-bridge';
import { createFileManagerHost } from '#runtime/file-manager-host.js';
import type {
  FileManagerActor,
  FileManagerBuildOptions,
  FileManagerHostRef,
  FileManagerSpec,
} from '#runtime/file-manager-host.js';
import { awaitFileManager } from '#runtime/file-manager-host.wait.js';
import type { FileManagerReadiness, FileManagerSnapshot } from '#runtime/file-manager-host.wait.js';
import { createLeaseTable } from '#runtime/leases.js';
import type { LeaseEntry, LeaseStore } from '#runtime/leases.js';
import { createRootQueryClient } from '#runtime/root-query-client.js';
import { ChatSessionStore } from '#services/chat-session-store.js';
import { chatSdkSource } from '#services/chat-sdk-loader.js';
import type { LiveProjectSessions } from '#services/chat-session-store.js';
import { selectLibraryRevision } from '@taucad/files-ui/runtime/project-library';
import { ProjectLibrary } from '#runtime/project-library.js';
import { createRootFileFacade } from '#runtime/file-manager-facade.js';
import type { RootFileFacade } from '#runtime/file-manager-facade.js';
import { buildWorkspaceTelemetry } from '#utils/workspace-telemetry.utils.js';
import { peekRevisionClient } from '@taucad/revisions-ui/services/revision-client-registry';
import {
  createSessionRootSync,
  createSessionsOpenAhead,
  createSessionsRegistryLogic,
  sessionFileManagerOpener,
  sessionsRegistryInput,
} from '#services/sessions-store.js';
import { selectFocusTarget } from '#machines/focus.route-state.js';
import {
  isPlacementOnThisDevice,
  isPlacementOnThisDeviceNow,
  namesUnhandedLoopbackHost,
  onLoopbackAgentHostsChanged,
  onPlacementReachabilityChanged,
} from '#lib/agent-host-placement.js';
import { createChoicesLogic, readChoices } from '#runtime/choices.js';
import type { ChoicesModelCatalog, ChoicesPorts, ProjectChoices } from '#runtime/choices.js';
import type {
  SessionRuntimeOpener,
  SessionWiring,
  SessionsAheadFocusView,
  SessionsAheadRegistryView,
  SessionsObservable,
  SessionsOpenAhead,
} from '#services/sessions-store.js';
import { store as preferenceStore } from '#hooks/use-cookie.js';
import { metaConfig } from '#constants/meta.constants.js';
import { getAllFlags } from '#flags/feature-flags.js';
import { subscribeFeatureFlags } from '#flags/use-feature.js';
import { modelsQueryKey } from '#lib/model-catalog.js';
import type { Model } from '#lib/model-catalog.js';
import { createDeploymentOwner, initialDeploymentMode } from '#cloud/deployment-mode.js';
import type { DeploymentModeSnapshot } from '#cloud/deployment-mode.types.js';
import { setReportedDeploymentMode } from '#lib/sentry-context.lib.js';

/** The app runtime root actor. @public */
export type AppRuntime = Actor<typeof appRuntimeMachine>;

/** What the runtime takes from its composition. Production passes none; development may pass `inspect`. @public */
export type AppRuntimeOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    /** The page `environment` listens to, read when the runtime starts; the browser's by default. */
    environment?: () => EnvironmentHost | undefined;
    /** The desktop quit seam `environment` listens to; the desktop bridge's by default. */
    desktopQuit?: EnvironmentDesktopQuit;
    /** The session module's import focus waits for; `openProjectWorkspace` by default, which warms the layout beside it. */
    loadSessionModule?: () => Promise<unknown>;
    /**
     * The product analytics client the file manager's workspace telemetry captures through (D15). The client entry
     * passes the admitted one; the server and tests get the no-op client.
     */
    analytics?: Analytics;
    /** Read Home's storage engine selection; the handle store's by default. */
    loadHomeBackend?: () => Promise<HomeStorageBackend>;
    /**
     * Leave the file managers idle: Home is never read and `rootFiles` never connects. For a page that renders no file
     * manager, such as the remote-host harness, which runs its transport check without one.
     */
    idleFileManagers?: boolean;
    /**
     * The browser `QueryClient` the library writes the listing into and `root-layout.tsx` hands down (D9). Created by
     * the runtime by default; a test passes the one it inspects.
     */
    queryClient?: QueryClient;
    /**
     * This page load was started in safe mode (`?safe=1` on the web; D0): the shell shows the safe-mode bar. It is a
     * property of one page load and is never stored.
     */
    safeMode?: boolean;
  }>;

/** The Home read of an idle runtime: it never settles, so the host stays `resolving`. */
const neverReadHome = async (): Promise<HomeStorageBackend> => Promise.withResolvers<HomeStorageBackend>().promise;

/** The no-op analytics client of the server and of tests. @public */
export const noAnalytics: Analytics = { capture: () => undefined };

/**
 * What a mount reads from the runtime's file-manager host: its builder over the lease store, its wait on the runtime's
 * clock and the shared worker. Each is a closure of the composition, never machine context (D4).
 *
 * @public
 */
export type AppRuntimeFiles = Readonly<{
  /** The lease for one mount's file manager: in render, idempotent per key, unstarted until retained (D6). */
  leaseFileManager: (key: string, spec: FileManagerSpec) => LeaseEntry<FileManagerActor>;
  /** Wait for a file manager up to the ready bound, on the runtime's clock (I15). */
  awaitFileManager: (
    fileManager: FileManagerRef,
    readiness: FileManagerReadiness,
    options: Readonly<{
      reason: 'proxy-timeout' | 'services-timeout';
      /** Aborted when the file manager's lease is dropped; `rootFiles` has none. */
      gone?: AbortSignal;
    }>,
  ) => Promise<FileManagerSnapshot>;
  /** The shared worker `rootFiles` holds, once it has one. */
  sharedWorker: () => Worker | undefined;
  /** Whether the runtime was created with idle file managers, for the remote-host harness's document. */
  idleFileManagers: boolean;
}>;

/* Each runtime's file closures, by runtime; the composition writes one per runtime it creates. */
const runtimeFiles = new WeakMap<AppRuntime, AppRuntimeFiles>();

/** The services the runtime's `projectLibrary` and `chatSessions` children hold (A2, D9), and what React fills. */
type AppRuntimeServices = Readonly<{
  queryClient: QueryClient;
  projectLibrary: ProjectLibrary;
  chatSessions: ChatSessionStore;
  /** The unload registrations `environment` sequences (D26). */
  unload: UnloadSequencer;
  /** Focus and the bindings its ports read (A5b). */
  focus: FocusHandle;
  rootFileFacade: RootFileFacade;
  /** The *Open* gesture's early open, owned by the registry's composition (STO-25 SP6). */
  openAhead: SessionsOpenAhead;
}>;

/** The desktop bridge's quit seam: a no-op outside the desktop build. Read when `environment` starts, not on import. */
const desktopBridgeQuit: EnvironmentDesktopQuit = {
  onQuitRequested: (listener) => onDesktopQuitRequested(listener),
  reportQuiesced: (attemptId, forced) => {
    reportDesktopQuiesced(attemptId, forced);
  },
};

/* Each runtime's services, by runtime; the composition writes one per runtime it creates. */
const runtimeServices = new WeakMap<AppRuntime, AppRuntimeServices>();

/* Each runtime's lease store, by runtime; the composition writes one per runtime it creates. */
const runtimeLeases = new WeakMap<AppRuntime, LeaseStore>();

/* The runtimes created in safe mode (D0). */
const safeModeRuntimes = new WeakSet<AppRuntime>();

/* Development only: a rejected event is a machine that did not expect it (MC-R4). */
const warnRejectedChatEvent = (rejection: EventRejection): void => {
  console.warn('[ChatSessionStore] an actor rejected an event', rejection);
};

/**
 * The chat store, built with its dependencies (A2): the library's chat-record ports and its file facade, the placement
 * reachability of this tab, and the project's revision client for a pull.
 */
const createChatSessions = (
  library: ProjectLibrary,
  options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'>,
  {
    focusedProject,
    projectSessions,
  }: Readonly<{
    focusedProject: SessionsObservable<string | undefined>;
    projectSessions: SessionsObservable<LiveProjectSessions>;
  }>,
): ChatSessionStore =>
  new ChatSessionStore({
    /* A7b: the store reads the focused project from focus, not from a setter React calls. */
    focusedProject,
    /* A7c: and every live project's session from the registry, so a run reports to the project that ran it (R2). */
    projectSessions,
    /* PL1: each chat's AI SDK `Chat` loads on demand, by the chat's one dynamic import (D5's function form). */
    chatSdk: chatSdkSource,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    ...(options.onRejectedEvent === undefined
      ? import.meta.env.DEV
        ? { onRejectedEvent: warnRejectedChatEvent }
        : {}
      : { onRejectedEvent: options.onRejectedEvent }),
    dependencies: {
      getChat: library.getChat,
      patchChat: library.patchChat,
      adoptLegacyChatPlacement: library.adoptLegacyChatPlacement,
      isPlacementOnThisDevice,
      isPlacementOnThisDeviceNow,
      onPlacementReachabilityChanged,
      touchChatRecency: library.touchChatRecency,
      consumeChatStartupRequest: library.consumeChatStartupRequest,
      commitCancelledDraftRestore: library.commitCancelledDraftRestore,
      /* The project's revision client, wherever its revisions run: this tab's worker or the desktop host. */
      /* Round 27: and it answers whether this device can pull the chat, as its placement's pull does. */
      pullRemote: async (projectId, chatId) => (await peekRevisionClient(projectId)?.pullRemote(chatId)) ?? true,
    },
    /* Composer records and chat attachments are files, reached through the root that owns them. */
    files: { get: () => library.files.get(), subscribe: library.files.subscribe },
  });

/**
 * The catalog as the runtime's query cache holds it, as `useModels` reads its query: rows once they arrived, else
 * unavailable after a failed fetch, else loading.
 */
const modelsQueryHash = hashKey(modelsQueryKey);

const readCachedCatalog = (queryClient: QueryClient): ChoicesModelCatalog => {
  const state = queryClient.getQueryState<Model[]>(modelsQueryKey);
  if (state?.data !== undefined) {
    return { status: 'loaded', models: state.data };
  }
  return { status: state?.status === 'error' ? 'unavailable' : 'loading' };
};

/**
 * The four real ports of `choices` (plan § 4 A6b, D15), each a module store outside React:
 * - `cookies`: the preference store `useCookie` reads, by its storage name;
 * - `catalog`: the model catalog in the runtime's query cache, followed through the cache. It never fetches: the
 *   chat's `useModels` owns the fetch and its five-minute refetch, so attaching `choices` adds no request;
 * - `flags`: the flag store `useFeature` reads;
 * - `reachability`: this tab's loopback admissions, as `usePlaceableExecution` reads them.
 *
 * @param queryClient - The runtime's query client.
 * @returns The ports.
 */
const createChoicesPorts = (queryClient: QueryClient): ChoicesPorts => ({
  cookies: {
    read: (name) => preferenceStore.get(`${metaConfig.cookiePrefix}${name}`),
    subscribe: (name, listener) => preferenceStore.subscribe(`${metaConfig.cookiePrefix}${name}`, listener),
  },
  catalog: {
    read: () => readCachedCatalog(queryClient),
    subscribe: (listener) =>
      queryClient.getQueryCache().subscribe((event) => {
        /* Only what changes the catalog's data or status: an observer joining or leaving changes neither. */
        if (
          event.query.queryHash === modelsQueryHash &&
          (event.type === 'added' || event.type === 'removed' || event.type === 'updated')
        ) {
          listener();
        }
      }),
  },
  flags: {
    read: (flag) => getAllFlags()[flag],
    subscribe: (_flag, listener) => subscribeFeatureFlags(listener),
  },
  reachability: {
    isPlaceable: (execution) => !namesUnhandedLoopbackHost(execution),
    subscribe: onLoopbackAgentHostsChanged,
  },
});

/** A value the composition fills once the root exists: its value now, and its listeners. */
type LateObservable<T> = SessionsObservable<T> & Readonly<{ set: (value: T) => void; notify: () => void }>;

const lateObservable = <T>(initial: T): LateObservable<T> => {
  let value = initial;
  const changes = new Topic<void>({ name: 'appRuntime.lateObservable' });
  const notify = (): void => {
    changes.emit(undefined);
  };
  return {
    get: () => value,
    subscribe: (listener) => changes.subscribe(listener),
    set: (next) => {
      value = next;
    },
    notify,
  };
};

/**
 * The module a session builds its project runtime with, by dynamic import (D5): the entry graph never reaches it.
 */
const loadSessionRuntimeModule = async () => import('#runtime/project-runtime.session.js');
/* The session's `revisions` module (D5): one loader for its children and the registry's early open (STO-25 SP6). */
const loadSessionRevisions = async () => import('#runtime/session-revisions.js');

/**
 * How each session builds its project runtime (A6d): the lazy module, over the library, the chat store, the query
 * cache, the device's choices and the services wait on this runtime's clock. Each is a closure, never machine context
 * (D4). The choices are the root's, as `choices` last reported them, or read now before it first reports.
 *
 * @param ports - What the composition holds.
 * @returns The opener the registry gives each session's `project` child.
 */
const createSessionRuntimeOpener = (
  ports: Readonly<{
    projectLibrary: ProjectLibrary;
    chatSessions: ChatSessionStore;
    queryClient: QueryClient;
    choicesPorts: ChoicesPorts;
    runtime: () => AppRuntime | undefined;
    options: Pick<ActorOptions<AnyActorLogic>, 'clock' | 'onRejectedEvent'>;
  }>,
): SessionRuntimeOpener => {
  const choicesNow = (): ProjectChoices => {
    const runtime = ports.runtime();
    return (
      (runtime === undefined ? undefined : selectAppChoices(runtime.getSnapshot())) ?? readChoices(ports.choicesPorts)
    );
  };
  return {
    open: async (input) => {
      const { openSessionProjectRuntime } = await loadSessionRuntimeModule();
      return openSessionProjectRuntime(input, {
        library: ports.projectLibrary,
        chatSessions: ports.chatSessions,
        queryClient: ports.queryClient,
        choices: choicesNow,
        awaitServices: async (fileManager, gone) =>
          awaitFileManager(fileManager, 'services', {
            reason: 'services-timeout',
            gone,
            ...(ports.options.clock === undefined ? {} : { clock: ports.options.clock }),
          }),
        ...(ports.options.clock === undefined ? {} : { clock: ports.options.clock }),
        ...(ports.options.onRejectedEvent === undefined ? {} : { onRejectedEvent: ports.options.onRejectedEvent }),
      });
    },
    onChoicesChanged: (listener) => {
      const runtime = ports.runtime();
      if (runtime === undefined) {
        return () => undefined;
      }
      let last = selectAppChoices(runtime.getSnapshot());
      const subscription = runtime.subscribe((snapshot) => {
        const next = selectAppChoices(snapshot);
        if (next !== last) {
          last = next;
          listener();
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    },
  };
};

/**
 * Create the app runtime, unstarted (MC-R4).
 *
 * @param options - The clock, inspector and rejected-event hook for the whole tree, and the page to listen to.
 * @returns The root actor; its one start is `AppRuntimeProvider`'s.
 * @public
 */
// oxlint-disable-next-line max-lines-per-function -- The one composition root: every child's closure is built here.
export const createAppRuntime = ({
  environment,
  desktopQuit = desktopBridgeQuit,
  loadSessionModule = openProjectWorkspace,
  analytics = noAnalytics,
  loadHomeBackend,
  idleFileManagers = false,
  queryClient = createRootQueryClient(),
  safeMode = false,
  ...options
}: AppRuntimeOptions = {}): AppRuntime => {
  const readHome = idleFileManagers ? neverReadHome : loadHomeBackend;
  const host = createFileManagerHost({
    analytics,
    safeMode,
    ...(readHome === undefined ? {} : { loadHomeBackend: readHome }),
  });
  const table = createLeaseTable();
  /* Row L7: the library's delete asks the registry and the chat store, both built after it, so it reads them late. */
  const composed: { runtime?: AppRuntime; chatSessions?: ChatSessionStore; rootFiles?: RootFileFacade } = {};
  const workspaceTelemetry = buildWorkspaceTelemetry(analytics);
  const projectLibrary = new ProjectLibrary({
    queryClient,
    /* A4b: the root file facade over `rootFiles`, which exists once the root is created below. */
    rootFiles: () => composed.rootFiles,
    workspaceTelemetry,
    sessions: () => (composed.runtime === undefined ? undefined : selectRuntimeSessions(composed.runtime)),
    chatSessions: () => composed.chatSessions,
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.inspect === undefined ? {} : { inspect: options.inspect }),
    ...(options.onRejectedEvent === undefined ? {} : { onRejectedEvent: options.onRejectedEvent }),
  });
  /* A7b: the project focus has the person on, and whether the page is on screen, as the root's focus and `environment`
   * report them once the root exists. The sessions' `presence` and `revisions` children and the chat store read them. */
  const focusedProject = lateObservable<string | undefined>(undefined);
  const documentVisible = lateObservable(false);
  const liveSessions = lateObservable<LiveProjectSessions>({});
  const chatSessions = createChatSessions(projectLibrary, options, {
    focusedProject,
    projectSessions: liveSessions,
  });
  composed.chatSessions = chatSessions;
  const unload = createUnloadSequencer();
  /* Focus's five ports (A5b): the library's route access at its epoch, the registry, the leave flush React registers,
   * the session module and the route boundary. */
  const focusComposition = createFocusComposition({
    library: {
      routeAccess: projectLibrary.routeAccess,
      epoch: () => selectLibraryRevision(projectLibrary.getSnapshot()),
      onEpochChanged: (listener) =>
        projectLibrary.onLibraryChanged((event) => {
          listener(event.revision);
        }),
    },
    loadModule: loadSessionModule,
  });
  /* The host the sessions build their file managers through: the root spawns it with itself, so it is read once the
   * root exists, before any session can open. */
  const builtHost: { current: FileManagerHostRef | undefined } = { current: undefined };
  const choicesPorts = createChoicesPorts(queryClient);
  /* A7b: what each session's facts are wired to. Each port is a closure over the composition, never machine context. */
  const sessionWiring: SessionWiring = {
    loadRevisions: loadSessionRevisions,
    loadHostConnector: async () => import('#runtime/host-connector.js'),
    registerCloseCut: (cut) => unload.register('session', cut),
    /* A7c: each live session's runtime writes what it owes at the producer stage, before any close cut (D26). */
    registerProducer: (flush) => unload.register('producer', flush),
    focusedProject,
    documentVisible,
    chatSessions,
    choices: () => {
      const { runtime } = composed;
      return (runtime === undefined ? undefined : selectAppChoices(runtime.getSnapshot())) ?? readChoices(choicesPorts);
    },
    rootSync: (fileManagerRef, gone) =>
      createSessionRootSync({
        fileManagerRef,
        gone,
        files: {
          awaitFileManager: async (fileManager, readiness, wait) =>
            awaitFileManager(fileManager, readiness, {
              ...(options.clock === undefined ? {} : { clock: options.clock }),
              ...wait,
            }),
        },
        telemetry: workspaceTelemetry,
      }),
  };
  /* Adaptive app deployment mode D2: the display mode's owner, in an adaptive build only (I10). Its clock is the
   * runtime's, so a test's simulated time also ages the record (D5). */
  const clockNow = (options.clock as { now?: () => number } | undefined)?.now?.bind(options.clock);
  const deploymentOwner = createDeploymentOwner?.(clockNow === undefined ? {} : { now: clockNow });
  const runtimeActors = {
    /* A7c (D26 as amended): `beforeunload` runs the producer stage while a record write is owed. */
    environment: createEnvironmentLogic(environment, {
      sequencer: unload,
      owedWrites: owedRecordWrites,
      desktopQuit,
    }),
    focusLibrary: focusComposition.logics.library,
    focusRegistry: focusComposition.logics.registry,
    focusFlush: focusComposition.logics.flush,
    focusModule: focusComposition.logics.module,
    focusRoute: focusComposition.logics.route,
    /* A6b: the device's choices over their real ports. The server never starts the runtime, so it reads none. */
    choices: createChoicesLogic(choicesPorts),
    /* Row L3: the library's actors and worker start with the root. An idle runtime (the remote-host harness,
     * which mounts no `ProjectManagerProvider`) starts no worker. */
    projectLibrary: createCallbackLogic<EventObject>(() => {
      if (idleFileManagers) {
        /* Idle: nothing starts, but the root facade still follows `rootFiles` until the runtime stops. */
        return () => {
          composed.rootFiles?.close();
        };
      }
      projectLibrary.start();
      return () => {
        projectLibrary.stop();
        composed.rootFiles?.close();
      };
    }),

    fileManagerHost: host.logic,
    leases: table.logic,
    /* S28: the registry admits and releases compute on the host's shared worker. A6c: each session builds its
     * file manager through the host, and waits for it on this runtime's clock. */
    sessions: createSessionsRegistryLogic({
      sharedWorker: host.sharedWorker,
      fileManagerWorker: { current: host.sharedWorker, subscribe: host.onSharedWorker },
      openFileManager: sessionFileManagerOpener({
        build: (spec) => {
          if (builtHost.current === undefined) {
            throw new Error('A session opened its file manager before the app runtime was created');
          }
          return host.build(builtHost.current, spec, options);
        },
        awaitServices: async (fileManager, gone) =>
          awaitFileManager(fileManager, 'services', {
            reason: 'services-timeout',
            gone,
            ...(options.clock === undefined ? {} : { clock: options.clock }),
          }),
      }),
      /* A6d: each session builds its project runtime behind a dynamic import, once it has its file manager. */
      openRuntime: createSessionRuntimeOpener({
        projectLibrary,
        chatSessions,
        queryClient,
        choicesPorts,
        runtime: () => composed.runtime,
        options,
      }),
      wiring: sessionWiring,
    }),
  } satisfies Partial<MachineActors<typeof appRuntimeMachine>>;
  /* A whole map either way: `provide` rejects a slot that may be `undefined`. */
  const adaptiveActors =
    deploymentOwner === undefined
      ? undefined
      : ({ ...runtimeActors, deployment: deploymentOwner } satisfies Partial<MachineActors<typeof appRuntimeMachine>>);
  const runtime = createActor(appRuntimeMachine.provide({ actors: adaptiveActors ?? runtimeActors }), {
    ...options,
    input: {
      sessions: sessionsRegistryInput(),
      rootFiles: host.rootFilesInput({ idle: idleFileManagers }),
      focusEpoch: focusComposition.epoch(),
      deployment: initialDeploymentMode,
      safeMode,
    },
  });
  const { fileManagerHost, leases, focus } = runtime.getSnapshot().context;
  focus.subscribe((snapshot) => {
    const next = selectFocusTarget(snapshot).target;
    if (next !== focusedProject.get()) {
      focusedProject.set(next);
      focusedProject.notify();
    }
  });
  /* A7c: the live sessions reach the chat store as the registry holds them; only a change of the set is told. */
  const registry = selectSessionsRegistry(runtime.getSnapshot());
  const followLiveSessions = (sessions: LiveProjectSessions): void => {
    if (sessions !== liveSessions.get()) {
      liveSessions.set(sessions);
      liveSessions.notify();
    }
  };
  followLiveSessions(registry.getSnapshot().context.refs);
  registry.subscribe((snapshot) => {
    followLiveSessions(snapshot.context.refs);
  });
  /* Every report of the page reaches the sessions, as every `visibilitychange` reached the binding's listener. */
  documentVisible.set(selectAppEnvironment(runtime.getSnapshot()).visible === true);
  runtime.on('visibilityChanged', (event) => {
    documentVisible.set(event.visible);
    documentVisible.notify();
  });
  /* Adaptive app deployment mode W1: the mode and its basis tag every error event, from the first report on. */
  let taggedMode: DeploymentModeSnapshot | undefined;
  runtime.subscribe((snapshot) => {
    const mode = selectDeploymentMode(snapshot);
    if (mode !== taggedMode) {
      taggedMode = mode;
      setReportedDeploymentMode(describeDeploymentMode(mode));
    }
  });
  builtHost.current = fileManagerHost;
  const store: LeaseStore = table.storeFor(leases);
  const buildOptions: FileManagerBuildOptions = options;
  runtimeFiles.set(runtime, {
    leaseFileManager: (key, spec) => store.get(key, () => host.build(fileManagerHost, spec, buildOptions)),
    awaitFileManager: async (fileManager, readiness, wait) =>
      awaitFileManager(fileManager, readiness, {
        ...(options.clock === undefined ? {} : { clock: options.clock }),
        ...wait,
      }),
    sharedWorker: host.sharedWorker,
    idleFileManagers,
  });
  const rootFileFacade = createRootFileFacade({
    fileManagerRef: selectRootFiles(runtime.getSnapshot()),
    files: runtimeFiles.get(runtime)!,
    telemetry: workspaceTelemetry,
  });
  composed.rootFiles = rootFileFacade;
  projectLibrary.followRootFiles();
  runtimeServices.set(runtime, {
    queryClient,
    projectLibrary,
    chatSessions,
    unload,
    rootFileFacade,
    focus: { focus: runtime.getSnapshot().context.focus, bindings: focusComposition.bindings },
    /* STO-25 SP6: through the session module's own loader and the shared worker its sessions use. */
    openAhead: createSessionsOpenAhead({
      loadRevisions: loadSessionRevisions,
      worker: host.sharedWorker,
      ...openAheadPorts(focus, registry),
    }),
  });
  composed.runtime = runtime;
  runtimeLeases.set(runtime, store);
  if (safeMode) {
    safeModeRuntimes.add(runtime);
  }
  return runtime;
};

const servicesOf = (runtime: AppRuntime): AppRuntimeServices => {
  const services = runtimeServices.get(runtime);
  if (services === undefined) {
    throw new Error('The runtime services are read from a runtime createAppRuntime made');
  }
  return services;
};

/**
 * The runtime's browser `QueryClient` (D9): `root-layout.tsx` hands it to `QueryClientProvider`.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its query client, fixed for its life.
 * @public
 */
export const selectRuntimeQueryClient = (runtime: AppRuntime): QueryClient => servicesOf(runtime).queryClient;

/**
 * The runtime's project library (D9), which `ProjectManagerProvider` is a provider over.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its library, fixed for its life.
 * @public
 */
export const selectRuntimeProjectLibrary = (runtime: AppRuntime): ProjectLibrary => servicesOf(runtime).projectLibrary;

/**
 * The runtime's root file facade over `rootFiles` (A4b): the one the project library reads and the root layout's scope
 * views.
 *
 * @param runtime - The app runtime.
 * @returns The facade.
 * @public
 */
export const selectRuntimeRootFileFacade = (runtime: AppRuntime): RootFileFacade => servicesOf(runtime).rootFileFacade;

/**
 * The runtime's chat store, built with its dependencies (A2), which `ChatSessionStoreProvider` hands down.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its chat store, fixed for its life.
 * @public
 */
export const selectRuntimeChatSessions = (runtime: AppRuntime): ChatSessionStore => servicesOf(runtime).chatSessions;

/**
 * The runtime's unload sequencer (D26): what `UnloadProvider` hands `useFlushOnClose` and `useFlushProducers`.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its sequencer, fixed for its life.
 * @public
 */
export const selectRuntimeUnload = (runtime: AppRuntime): UnloadSequencer => servicesOf(runtime).unload;

/**
 * The runtime's focus and the bindings its ports read (A5b): the route boundary binds its sink, and each live
 * project's guard registers its leave flush.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its focus handle, fixed for its life.
 * @public
 */
export const selectRuntimeFocus = (runtime: AppRuntime): FocusHandle => servicesOf(runtime).focus;

/** The desktop quit hold, as `environment` last reported it. @public */
export const selectQuitHold = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): AppRuntimeQuitHold =>
  snapshot.context.quitHold;

/**
 * The runtime's file closures: the lease builder, the ready wait and the shared worker.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its file closures.
 * @public
 */
export const selectRuntimeFiles = (runtime: AppRuntime): AppRuntimeFiles => {
  const files = runtimeFiles.get(runtime);
  if (files === undefined) {
    throw new Error('selectRuntimeFiles takes a runtime createAppRuntime made');
  }
  return files;
};

/**
 * The runtime's lease store (D6): what a host without a session leases its actors from, in render, idempotent per key
 * and unstarted until retained. `ProjectProvider` leases its project runtime here (A6b); the file-manager leases go
 * through {@link selectRuntimeFiles}, which builds them with the host.
 *
 * @param runtime - An app runtime {@link createAppRuntime} made.
 * @returns Its lease store, fixed for its life.
 * @public
 */
export const selectRuntimeLeases = (runtime: AppRuntime): LeaseStore => {
  const leases = runtimeLeases.get(runtime);
  if (leases === undefined) {
    throw new Error('selectRuntimeLeases takes a runtime createAppRuntime made');
  }
  return leases;
};

/**
 * Whether a runtime's file managers are idle (the remote-host harness's document).
 *
 * @param runtime - An app runtime.
 * @returns Its idleness, or `undefined` for a runtime {@link createAppRuntime} did not make.
 * @public
 */
export const selectRuntimeIdleFileManagers = (runtime: AppRuntime): boolean | undefined =>
  runtimeFiles.get(runtime)?.idleFileManagers;

/**
 * Whether a runtime was created for a page load started in safe mode (D0).
 *
 * @param runtime - An app runtime.
 * @returns Whether this page load is in safe mode.
 * @public
 */
export const selectRuntimeSafeMode = (runtime: AppRuntime): boolean => safeModeRuntimes.has(runtime);

/**
 * Focus and the registry as the early open reads them (STO-25 SP6): the route's request, the project focus is focused
 * on, the project it holds on an answer that opens nothing, and the registry's sessions. Exported for the composition
 * row that drives it over a real focus and registry.
 *
 * @param focus - The runtime's focus.
 * @param registry - The runtime's sessions registry.
 * @returns The early open's focus and registry ports.
 * @public
 */
export const openAheadPorts = (
  focus: ActorRefFrom<FocusMachine>,
  registry: ActorRefFrom<typeof sessionsMachine>,
): Readonly<{
  focus: SessionsObservable<SessionsAheadFocusView>;
  registry: SessionsObservable<SessionsAheadRegistryView>;
}> => ({
  focus: {
    get: () => {
      const snapshot = focus.getSnapshot();
      const { answer, request } = snapshot.context;
      return {
        ...(request === undefined ? {} : { request }),
        ...(snapshot.hasTag('focused') && answer?.projectId !== undefined ? { focusedOn: answer.projectId } : {}),
        ...(snapshot.hasTag('held') && answer?.projectId !== undefined && answer.answer.status !== 'ready'
          ? { heldOn: answer.projectId }
          : {}),
      };
    },
    subscribe: (listener) => {
      const subscription = focus.subscribe(listener);
      return () => {
        subscription.unsubscribe();
      };
    },
  },
  registry: {
    get: () => registry.getSnapshot().context,
    subscribe: (listener) => {
      const subscription = registry.subscribe(listener);
      return () => {
        subscription.unsubscribe();
      };
    },
  },
});

/**
 * The runtime's early open for the *Open* gesture (STO-25 SP6): start a project's revision client and Tau Cloud open
 * before its route loads; its session takes them.
 *
 * @param runtime - The app runtime.
 * @returns The gesture's entry point.
 * @public
 */
export const selectRuntimeOpenAhead = (runtime: AppRuntime): SessionsOpenAhead => servicesOf(runtime).openAhead;

/** The file manager for `/`, which the root spawned with itself and never replaces. @public */
export const selectRootFiles = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): FileManagerRef =>
  snapshot.context.rootFiles;

/** The file-manager host, which the root spawned with itself and never replaces. @public */
export const selectFileManagerHost = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): FileManagerHostRef =>
  snapshot.context.fileManagerHost;

/**
 * The runtime's `rootFiles`, read once: the ref is fixed for the runtime's life.
 *
 * @param runtime - The app runtime.
 * @returns The file manager for `/`.
 * @public
 */
export const selectRuntimeRootFiles = (runtime: AppRuntime): FileManagerRef => selectRootFiles(runtime.getSnapshot());

/**
 * The runtime's file-manager host, read once: the ref is fixed for the runtime's life.
 *
 * @param runtime - The app runtime.
 * @returns The host.
 * @public
 */
export const selectRuntimeFileManagerHost = (runtime: AppRuntime): FileManagerHostRef =>
  selectFileManagerHost(runtime.getSnapshot());

/** The sessions registry, which the root spawned with itself and never replaces. @public */
export const selectSessionsRegistry = (
  snapshot: SnapshotFrom<typeof appRuntimeMachine>,
): ActorRefFrom<typeof sessionsMachine> => snapshot.context.sessions;

/**
 * The runtime's registry, read once: the ref is fixed for the runtime's life, so a reader needs no subscription.
 *
 * @param runtime - The app runtime.
 * @returns Its sessions registry.
 * @public
 */
export const selectRuntimeSessions = (runtime: AppRuntime): ActorRefFrom<typeof sessionsMachine> =>
  selectSessionsRegistry(runtime.getSnapshot());

/** The page as `environment` last reported it. @public */
export const selectAppEnvironment = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): AppRuntimeEnvironment =>
  snapshot.context.environment;

/**
 * The device's standing choices, as `choices` last reported them; `undefined` before the runtime starts (A6b).
 *
 * @public
 */
export const selectAppChoices = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): ProjectChoices | undefined =>
  snapshot.context.choices;

/**
 * The display mode (adaptive app deployment mode D2): the pinned constant of a pinned build, else what `deployment`
 * last reported, `unknown` until it does (I13).
 *
 * @public
 */
export const selectDeploymentMode = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): DeploymentModeSnapshot =>
  snapshot.context.deployment;

/**
 * The display mode as one tag value: the state and its basis, or `unknown` and its problem.
 *
 * @param mode - The mode.
 * @returns Such as `funded/confirmed` or `unknown/unreachable`.
 * @public
 */
export const describeDeploymentMode = (mode: DeploymentModeSnapshot): string =>
  `${mode.state}/${mode.state === 'unknown' ? mode.problem : mode.basis}`;

/** The runtime root's first fault, if any (D23). @public */
export const selectAppRuntimeFault = (snapshot: SnapshotFrom<typeof appRuntimeMachine>): string | undefined =>
  snapshot.context.fault;
