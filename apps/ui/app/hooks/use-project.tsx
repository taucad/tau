/* oxlint-disable typescript/no-restricted-types -- Workbench record entry paths are nullable by schema. */
import type { ReactNode } from 'react';
import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom, InputFrom } from 'xstate';
import type { QueryClient } from '@tanstack/react-query';
import type { ParameterManifest } from '@taucad/parameters';
import type { WorkbenchEntries, WorkbenchView } from '@taucad/workbench';
import type { Chat } from '@taucad/chat';
import { findEntryGraphics } from '@taucad/workbench-panes/units/geometry-units';
import type { MachineActors } from '@taucad/ui-core/lib/xstate.lib';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import { toast } from 'sonner';
import { Topic } from '@taucad/events';
import { useFileManager } from '#hooks/use-file-manager.js';
import type { ParameterFilesClient } from '#hooks/use-file-manager.js';
import type { projectMachine } from '#machines/project.machine.js';
import type { editorMachine } from '#machines/editor.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '@taucad/viewer/machines/graphics.machine';
import type { logMachine } from '#machines/logs.machine.js';
import type { modelInteractionMachine } from '@taucad/viewer/machines/model-interaction.machine';
import { inspect } from '#machines/inspector.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { EntryPathChange } from '#workbench-records/entries-store.js';
import type { ViewRecordPortsHandle } from '#workbench-records/view-record-session.js';
import { useAppRuntime } from '#runtime/app-runtime-provider.js';
import { selectRuntimeLeases, selectRuntimeProjectLibrary, selectRuntimeQueryClient } from '#runtime/app-runtime.js';
import type { LeaseEntry } from '#runtime/leases.js';
import {
  createProjectRuntime,
  selectEditorRef,
  selectManifestObservationError,
  selectProjectRef,
} from '#runtime/project-runtime.js';
import type {
  ObservablePort,
  ProjectRuntime,
  ProjectRuntimeActor,
  ProjectRuntimeProfileOptions,
} from '#runtime/project-runtime.js';
import { createProjectViewRecords } from '#runtime/project-runtime.view-records.js';
import type { ProjectViewRecords } from '#runtime/project-runtime.view-records.js';

type ProjectContextType = {
  manifestObservationError: string | undefined;
  retryManifestObservation: () => void;
  readonly profile: 'editor' | 'shared';
  projectId: string;
  projectRef: ActorRefFrom<typeof projectMachine>;
  editorRef: ActorRefFrom<typeof editorMachine>;
  /** Per-viewer-panel graphics machines, keyed by Dockview panel ID */
  viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  viewRecords: ReadonlyMap<string, WorkbenchView>;
  appliedWorkbenchRevisions: ReadonlyMap<string, `sha256:${string}`>;
  setAppliedWorkbenchRevision: (path: string, digest: `sha256:${string}` | undefined) => void;
  appliedEntryRevisions: ReadonlyMap<string, `sha256:${string}`>;
  setAppliedEntryRevision: (path: string, digest: `sha256:${string}` | undefined) => void;
  setViewRecord: (viewId: string, record: WorkbenchView | undefined) => void;
  viewEntryPaths: ReadonlyMap<string, string | null>;
  setViewEntryPath: (viewId: string, path: string | null | undefined) => void;
  entriesRecord: WorkbenchEntries | undefined;
  setEntriesRecord: (record: WorkbenchEntries | undefined) => void;
  registerEntryPathChange: (change: (operation: EntryPathChange) => Promise<boolean>) => () => void;
  changeEntryPaths: (operation: EntryPathChange) => Promise<boolean>;
  /** Add a producer to the runtime's producer set (`projectRuntime.producers`), which every flush walks (S40). */
  registerWorkbenchRecordProducer: (flush: () => Promise<void>) => () => void;
  /** Flush the runtime's producer set; rejects with every refusal. */
  flushWorkbenchRecordProducers: () => Promise<void>;
  /** The project runtime this provider is a view of (A6b): its root, parameter service and producer set. */
  projectRuntime: ProjectRuntime;
  /** The ports every view's record session shares (charter G6b): the host flushes them on close. */
  viewRecordPorts: ViewRecordPortsHandle;
  modelInteractionRef: ActorRefFrom<typeof modelInteractionMachine>;
  /** Dynamic geometry units keyed by entry path. Each is a headless CadMachine+KernelMachine. */
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>;
  /** The main entry path from project.assets.main?.entryPath. */
  mainEntryPath: string;
  logRef: ActorRefFrom<typeof logMachine>;
  resolveParameterEntry: (filePath: string, manifest: ParameterManifest) => void;
  setGeometryUnitParameters: (
    filePath: string,
    manifest: ParameterManifest,
    parameters: Record<string, unknown>,
  ) => void;
  /** Write a form edit: only the fields `values` changes from `base`, the values the form rendered. */
  editGeometryUnitParameters: (
    filePath: string,
    manifest: ParameterManifest,
    edit: Readonly<{ values: Record<string, unknown>; base: Record<string, unknown> }>,
  ) => void;
  switchParameterGroup: (filePath: string, manifest: ParameterManifest, groupName: string) => void;
  createParameterGroup: (
    filePath: string,
    manifest: ParameterManifest,
    input: Readonly<{
      groupName: string;
      values?: Record<string, unknown>;
    }>,
  ) => void;
  deleteParameterGroup: (filePath: string, manifest: ParameterManifest, groupName: string) => void;
  renameParameterGroup: (
    filePath: string,
    manifest: ParameterManifest,
    input: Readonly<{ oldName: string; newName: string }>,
  ) => void;
  parameterService: ParameterSetService;
  updateName: (name: string) => void;
  updateDescription: (description: string) => void;
  updateTags: (tags: string[]) => void;
  getMainFilename: () => Promise<string>;
  setFocusedChatId: (chatId: string | undefined) => void;
};

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Parameter operation failed.';

/**
 * Whether `chatId` is a chat the client already holds — freshly created here, or
 * present in a current non-deleted chat list. Such a chat needs no async
 * ensure round trip, so the editor can focus it synchronously. Deleted-inclusive
 * and invalidated lists cannot authorize a stale route.
 *
 * @returns True when the chat is already known.
 */
export function isKnownChatId({
  chatId,
  createdChatId,
  projectId,
  queryClient,
}: {
  readonly chatId: string;
  readonly createdChatId: string | undefined;
  readonly projectId: string;
  readonly queryClient: QueryClient;
}): boolean {
  if (chatId === createdChatId) {
    return true;
  }
  const visibleChatKeys = [
    ['chats', projectId, { includeDeleted: false }],
    ['chats', projectId, 'records', { includeDeleted: false }],
  ];
  return visibleChatKeys.some((queryKey) => {
    const state = queryClient.getQueryState<Array<Pick<Chat, 'id'>>>(queryKey);
    return state !== undefined && !state.isInvalidated && state.data?.some((chat) => chat.id === chatId) === true;
  });
}

/** The file manager's parts this provider feeds its runtime: the parameter client (A6a R-b) and the record watch. */
type ProjectProviderFiles = Readonly<{
  parameterFiles: ParameterFilesClient;
  watchRecordFile: ReturnType<typeof useFileManager>['watchRecordFile'];
}>;

/** What a lease builds with the project runtime: its view records, and the file port the provider feeds. */
type LeasedProjectRuntime = Readonly<{
  runtime: ProjectRuntime;
  viewRecords: ProjectViewRecords;
  /** Hand the runtime the file manager's current parts: the parameter port and the view records' host follow it. */
  replaceFiles: (files: ProjectProviderFiles) => void;
}>;

/* What each leased root was built with, by root: the lease store holds only the actor. */
const leasedRuntimes = new WeakMap<ProjectRuntimeActor, LeasedProjectRuntime>();

/** A value the provider replaces and the runtime follows: the parameter client port of A6a (R-b). */
const createFedPort = <T,>(initial: T): ObservablePort<T> & Readonly<{ set: (next: T) => void }> => {
  let current = initial;
  const changes = new Topic<void>({ name: 'project-provider-parameter-files' });
  return {
    get: () => current,
    subscribe: (listener) => changes.subscribe(listener),
    set: (next) => {
      if (next === current) {
        return;
      }
      current = next;
      changes.emit();
    },
  };
};

type ProjectProviderProps = {
  readonly children: ReactNode;
  readonly projectId: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  /* Replaces this provider's actors wholesale: a project that is not on disk loads from its own source. */
  readonly provide?: { readonly actors: Pick<MachineActors<typeof projectMachine>, 'loadProjectActor'> };
  readonly input?: Omit<
    NonNullable<InputFrom<typeof projectMachine>>,
    'projectId' | 'fileManagerRef' | 'fileSystemRoot' | 'kernelOptionsFactory'
  >;
  readonly kernelOptionsFactory?: LazyKernelOptionsFactory;
  readonly profile?: 'editor' | 'shared';
  readonly previewParameterService?: ParameterSetService;
};

/* One mount's identity, for its lease key. `useId` is the mount's tree position, which a keyed remount (a new kernel
 * selection) keeps; a remount must lease a fresh runtime, so the key is a number the mount's state keeps instead. */
let mountCount = 0;
const nextMount = (): number => {
  mountCount += 1;
  return mountCount;
};

/**
 * Lease this mount's project runtime (D6; plan § 4 A6b): read in render, idempotent per key, retained once the mount
 * commits.
 *
 * The key is the mount's own, kept across StrictMode's double render and its remount, and new for a keyed remount, so
 * a change of kernel selection still builds a new runtime, as the React key on the session's provider did. The store
 * starts the root on the first retain; a release starts the grace on the app runtime's clock, so StrictMode's remount
 * keeps the runtime and an unmount stops it after the grace (B3). The retain is the commit's passive effect, as the
 * file-manager lease's is (A1b): a context provider renders no element for a ref callback, and a layout effect is
 * cleaned up when a revealed Suspense boundary re-suspends. A render that commits after its entry's grace finds the
 * entry dropped and renders again, which leases a fresh one. It neither sends, subscribes nor times (I1, I16).
 *
 * @param projectId - The project, part of the key.
 * @param profile - The profile, part of the key.
 * @param build - Builds the runtime for a key that has none.
 * @returns The entry.
 */
function useLeasedProjectRuntime(
  projectId: string,
  profile: 'editor' | 'shared',
  build: () => LeasedProjectRuntime,
): LeaseEntry<ProjectRuntimeActor> {
  const appRuntime = useAppRuntime();
  const [mount] = useState(nextMount);
  const key = JSON.stringify(['project-runtime', mount, projectId, profile]);
  const lease = selectRuntimeLeases(appRuntime).get(key, () => {
    const leased = build();
    leasedRuntimes.set(leased.runtime.actor, leased);
    return { actor: leased.runtime.actor };
  });
  const [, renew] = useReducer((generation: number) => generation + 1, 0);
  useEffect(() => {
    const release = lease.retain();
    if (lease.isDropped()) {
      renew();
    }
    return release;
  }, [lease]);
  return lease;
}

const leasedRuntimeOf = (actor: ProjectRuntimeActor): LeasedProjectRuntime => {
  const leased = leasedRuntimes.get(actor);
  if (leased === undefined) {
    throw new Error('A project runtime lease is read only through useLeasedProjectRuntime');
  }
  return leased;
};

/**
 * The project's actors for the tree below: a view of a leased project runtime (plan § 4 A6b). It creates nothing.
 *
 * The runtime (`runtime/project-runtime.ts`) builds the project and editor actors, the parameter service, the parameter
 * observers, the manifest observation and the library events, and owns the producer set every flush walks. This
 * provider leases it from the app runtime, keyed by its mount, so share, preview and the converter acquire theirs the
 * same way (D6). The lease builds the runtime once, with the props of the render that first asks for it, as
 * `useActorRef` read its input once. Until A6d the session's provider still passes the requested chat and its kernel
 * selection as props, and the session remounts it on a new kernel selection.
 *
 * @param props - The project, the chat the route asks for, how the project loads, its kernel and profile.
 * @returns The provider element.
 */
export function ProjectProvider({
  children,
  projectId,
  requestedChatId,
  createdChatId,
  onFocusedChatResolved,
  provide,
  input,
  kernelOptionsFactory,
  profile = 'editor',
  previewParameterService,
}: ProjectProviderProps): React.JSX.Element {
  const appRuntime = useAppRuntime();
  const queryClient = selectRuntimeQueryClient(appRuntime);
  const fileManager = useFileManager();
  const files = useMemo<ProjectProviderFiles>(
    () => ({ parameterFiles: fileManager.parameterFiles, watchRecordFile: fileManager.watchRecordFile }),
    [fileManager.parameterFiles, fileManager.watchRecordFile],
  );

  const lease = useLeasedProjectRuntime(projectId, profile, () => {
    const parameterFiles = createFedPort(files.parameterFiles);
    const viewRecordHost = (current: ProjectProviderFiles) => ({
      files: current.parameterFiles,
      watch: current.watchRecordFile,
    });
    const viewRecords = createProjectViewRecords({ projectId, host: viewRecordHost(files) });
    /* Only the editor loading from disk writes view records (G6b); the options' type says so. */
    const profileOptions: ProjectRuntimeProfileOptions =
      provide === undefined
        ? profile === 'editor'
          ? { profile, viewRecordPorts: viewRecords.ports }
          : { profile }
        : profile === 'editor'
          ? { profile, provide }
          : { profile, provide };
    const runtime = createProjectRuntime({
      projectId,
      fileManager: { fileManagerRef: fileManager.fileManagerRef, parameterFiles },
      library: selectRuntimeProjectLibrary(appRuntime),
      ...profileOptions,
      ...(kernelOptionsFactory === undefined ? {} : { kernelSelection: { kernelOptionsFactory } }),
      ...(input === undefined ? {} : { input }),
      ...(requestedChatId === undefined ? {} : { requestedChatId }),
      ...(previewParameterService === undefined ? {} : { previewParameterService }),
      clock: appRuntime.clock,
      ...(inspect === undefined ? {} : { inspect }),
    });
    return {
      runtime,
      viewRecords,
      replaceFiles: (next) => {
        parameterFiles.set(next.parameterFiles);
        /* The filesystem's connections can be replaced (a new worker): each session reopens its store on the new ones. */
        viewRecords.ports.replaceHost(viewRecordHost(next));
      },
    };
  });
  const { runtime, viewRecords, replaceFiles } = leasedRuntimeOf(lease.actor);
  const { actor } = runtime;
  /* The root spawned both with itself and never replaces them, so one read is enough. */
  const actorRef = selectProjectRef(actor.getSnapshot());
  const editorRef = selectEditorRef(actor.getSnapshot());

  /* The file manager's parts reach the runtime before any passive effect of this commit reads them, as the view
   * records' host replacement did. It sends nothing to an actor. */
  useLayoutEffect(() => {
    replaceFiles(files);
  }, [files, replaceFiles]);

  const parameterService = useSyncExternalStore(
    runtime.parameterService.subscribe,
    runtime.parameterService.get,
    runtime.parameterService.get,
  );
  const manifestObservationError = useSelector(actor, selectManifestObservationError);
  const retryManifestObservation = useCallback(() => {
    actor.send({ type: 'retryManifestObservation' });
  }, [actor]);
  const {
    viewRecords: viewRecordMap,
    viewEntryPaths,
    appliedWorkbenchRevisions,
  } = useSyncExternalStore(viewRecords.subscribe, viewRecords.getSnapshot, viewRecords.getSnapshot);

  /* A chat we already hold is focused synchronously. `setRequestedChatId` re-enters
   * `ensuringFocusedChat` for an async chat-list round trip, which flashes the chat
   * pane's skeleton — correct for an unknown/absent id, a visible flicker for every
   * switch between chats the sidebar just listed. A6d moves this into the session's open request. */
  useEffect(() => {
    editorRef.send(
      requestedChatId !== undefined && isKnownChatId({ chatId: requestedChatId, createdChatId, projectId, queryClient })
        ? { type: 'focusKnownChat', chatId: requestedChatId }
        : { type: 'setRequestedChatId', chatId: requestedChatId },
    );
  }, [createdChatId, editorRef, projectId, queryClient, requestedChatId]);

  const viewGraphics = useSelector(actorRef, (state) => state.context.viewGraphics);
  const [appliedEntryRevisions, setAppliedEntryRevisions] = useState<ReadonlyMap<string, `sha256:${string}`>>(
    () => new Map(),
  );
  const setAppliedEntryRevision = useCallback((path: string, digest: `sha256:${string}` | undefined) => {
    setAppliedEntryRevisions((current) => {
      if (current.get(path) === digest) {
        return current;
      }
      const next = new Map(current);
      if (digest === undefined) {
        next.delete(path);
      } else {
        next.set(path, digest);
      }
      return next;
    });
  }, []);
  const [entriesRecord, setEntriesRecord] = useState<WorkbenchEntries>();
  const entryPathChangeRef = useRef<((operation: EntryPathChange) => Promise<boolean>) | undefined>(undefined);
  const registerEntryPathChange = useCallback((change: (operation: EntryPathChange) => Promise<boolean>) => {
    entryPathChangeRef.current = change;
    return () => {
      if (entryPathChangeRef.current === change) {
        entryPathChangeRef.current = undefined;
      }
    };
  }, []);
  const changeEntryPaths = useCallback(
    async (operation: EntryPathChange) => (entryPathChangeRef.current ? entryPathChangeRef.current(operation) : false),
    [],
  );
  const modelInteractionRef = useSelector(actorRef, (state) => state.context.modelInteractionRef);
  const geometryUnits = useSelector(actorRef, (state) => state.context.geometryUnits);
  const mainEntryPath = useSelector(actorRef, (state) => state.context.mainEntryPath);
  const logRef = useSelector(actorRef, (state) => state.context.logRef);

  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const resolvedRequestedChatId = useSelector(editorRef, (state) => state.context.requestedChatId);
  const focusedChatResolved = useSelector(editorRef, (state) => state.matches({ ready: { operation: 'idle' } }));
  useEffect(() => {
    if (focusedChatResolved && focusedChatId !== undefined && resolvedRequestedChatId === requestedChatId) {
      onFocusedChatResolved?.(focusedChatId);
    }
  }, [focusedChatId, focusedChatResolved, onFocusedChatResolved, requestedChatId, resolvedRequestedChatId]);

  const reportParameterOperation = useCallback((operation: Promise<unknown>): void => {
    const report = async (): Promise<void> => {
      try {
        await operation;
      } catch (error) {
        toast.error(errorMessage(error));
      }
    };
    // async-iife: bootstrap -- UI event callbacks cannot return the operation promise.
    void report();
  }, []);

  const resolveParameterEntry = useCallback(
    (filePath: string, manifest: ParameterManifest) => {
      /* `resolve` creates the set actor synchronously. Nothing forwards its values to the kernel:
       * the runtime watches the sidecar itself, so the checked write is the only render trigger. */
      const operation = parameterService.resolve(filePath, manifest);
      // A failed load is shown in the panel with its recovery action, so it is not also a toast.
      const settle = async (): Promise<void> => {
        try {
          await operation;
          /* A preview's resolved values reach its kernel through the runtime's parameter observers. */
          actor.send({ type: 'parameterEntryResolved', entryPath: filePath });
        } catch {
          // The set actor holds the typed diagnostic.
        }
      };
      // async-iife: bootstrap -- resolution is observed through the set actor, not this promise.
      void settle();
    },
    [actor, parameterService],
  );

  const setGeometryUnitParameters = useCallback(
    (filePath: string, manifest: ParameterManifest, parameters: Record<string, unknown>) => {
      reportParameterOperation(parameterService.replaceValues(filePath, manifest, parameters));
    },
    [parameterService, reportParameterOperation],
  );

  const editGeometryUnitParameters = useCallback(
    (
      filePath: string,
      manifest: ParameterManifest,
      edit: Readonly<{ values: Record<string, unknown>; base: Record<string, unknown> }>,
    ) => {
      reportParameterOperation(parameterService.editValues(filePath, manifest, edit));
    },
    [parameterService, reportParameterOperation],
  );

  const switchParameterGroup = useCallback(
    (filePath: string, manifest: ParameterManifest, groupName: string) => {
      reportParameterOperation(parameterService.selectGroup(filePath, manifest, groupName));
    },
    [parameterService, reportParameterOperation],
  );

  const createParameterGroup = useCallback(
    (
      filePath: string,
      manifest: ParameterManifest,
      {
        groupName,
        values,
      }: Readonly<{
        groupName: string;
        values?: Record<string, unknown>;
      }>,
    ) => {
      reportParameterOperation(
        parameterService.createGroup(filePath, manifest, {
          group: groupName,
          ...(values === undefined ? {} : { values }),
        }),
      );
    },
    [parameterService, reportParameterOperation],
  );

  const deleteParameterGroup = useCallback(
    (filePath: string, manifest: ParameterManifest, groupName: string) => {
      reportParameterOperation(parameterService.deleteGroup(filePath, manifest, groupName));
    },
    [parameterService, reportParameterOperation],
  );

  const renameParameterGroup = useCallback(
    (
      filePath: string,
      manifest: ParameterManifest,
      { oldName, newName }: Readonly<{ oldName: string; newName: string }>,
    ) => {
      reportParameterOperation(
        parameterService.renameGroup(filePath, manifest, {
          group: oldName,
          nextGroup: newName,
        }),
      );
    },
    [parameterService, reportParameterOperation],
  );

  const updateName = useCallback(
    (name: string) => {
      actorRef.send({ type: 'updateName', name });
    },
    [actorRef],
  );

  const updateDescription = useCallback(
    (description: string) => {
      actorRef.send({ type: 'updateDescription', description });
    },
    [actorRef],
  );

  const updateTags = useCallback(
    (tags: string[]) => {
      actorRef.send({ type: 'updateTags', tags });
    },
    [actorRef],
  );

  const setFocusedChatId = useCallback(
    (chatId: string | undefined) => {
      editorRef.send({ type: 'setFocusedChatId', chatId });
    },
    [editorRef],
  );

  const getMainFilename = useCallback(async () => {
    const snapshot = await waitFor(actorRef, (state) => Boolean(state.context.project?.assets.main?.entryPath));

    if (!snapshot.context.project?.assets.main?.entryPath) {
      throw new Error('Main file not found');
    }

    return snapshot.context.project.assets.main.entryPath;
  }, [actorRef]);

  const value = useMemo<ProjectContextType>(() => {
    return {
      projectId,
      profile,
      manifestObservationError,
      retryManifestObservation,
      projectRef: actorRef,
      editorRef,
      viewGraphics,
      viewRecords: viewRecordMap,
      appliedWorkbenchRevisions,
      setAppliedWorkbenchRevision: viewRecords.setAppliedWorkbenchRevision,
      appliedEntryRevisions,
      setAppliedEntryRevision,
      setViewRecord: viewRecords.setViewRecord,
      viewEntryPaths,
      setViewEntryPath: viewRecords.setViewEntryPath,
      entriesRecord,
      setEntriesRecord,
      registerEntryPathChange,
      changeEntryPaths,
      registerWorkbenchRecordProducer: runtime.producers.register,
      flushWorkbenchRecordProducers: runtime.producers.flushAll,
      projectRuntime: runtime,
      viewRecordPorts: viewRecords.ports,
      modelInteractionRef,
      geometryUnits,
      mainEntryPath,
      logRef,
      parameterService,
      resolveParameterEntry,
      setGeometryUnitParameters,
      editGeometryUnitParameters,
      switchParameterGroup,
      createParameterGroup,
      deleteParameterGroup,
      renameParameterGroup,
      updateName,
      updateDescription,
      updateTags,
      setFocusedChatId,
      getMainFilename,
    };
  }, [
    projectId,
    profile,
    manifestObservationError,
    retryManifestObservation,
    actorRef,
    editorRef,
    viewGraphics,
    viewRecords,
    viewRecordMap,
    appliedWorkbenchRevisions,
    appliedEntryRevisions,
    setAppliedEntryRevision,
    viewEntryPaths,
    entriesRecord,
    setEntriesRecord,
    registerEntryPathChange,
    changeEntryPaths,
    runtime,
    modelInteractionRef,
    geometryUnits,
    mainEntryPath,
    logRef,
    parameterService,
    resolveParameterEntry,
    setGeometryUnitParameters,
    editGeometryUnitParameters,
    switchParameterGroup,
    createParameterGroup,
    deleteParameterGroup,
    renameParameterGroup,
    updateName,
    updateDescription,
    updateTags,
    setFocusedChatId,
    getMainFilename,
  ]);

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/**
 * Find the graphics actor for the viewer panel displaying the main entry path.
 * Returns undefined when the main entry has no live viewer.
 * Used by external consumers (headless capture, RPC handlers, parameters) that are NOT inside a GraphicsProvider.
 */
export function useMainGraphics(): ActorRefFrom<typeof graphicsMachine> | undefined {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useMainGraphics must be used within a ProjectProvider');
  }

  return findEntryGraphics(context.viewGraphics, context.viewEntryPaths, context.mainEntryPath);
}

/**
 * The live parameter-set actor for an entry, re-read whenever the service creates or retires one.
 * @param entryPath - The geometry entry whose parameters the actor owns.
 * @returns The actor, or `undefined` before the entry has been resolved.
 */
export function useParameterSetActor(
  entryPath: string | undefined,
): ReturnType<ProjectContextType['parameterService']['actor']> {
  const { parameterService } = useProject();
  return useSyncExternalStore(
    parameterService.subscribeActors,
    () => (entryPath === undefined ? undefined : parameterService.actor(entryPath)),
    () => undefined,
  );
}

export function useProject<T extends ProjectContextType = ProjectContextType>(options?: {
  readonly enableNoContext?: false;
}): T;
export function useProject<T extends ProjectContextType = ProjectContextType>(options: {
  readonly enableNoContext: true;
}): T | undefined;
export function useProject({ enableNoContext = false }: { readonly enableNoContext?: boolean } = {}):
  | ProjectContextType
  | undefined {
  const context = useContext(ProjectContext);
  if (context === undefined && !enableNoContext) {
    throw new Error('useProject must be used within a ProjectProvider');
  }

  return context;
}
