/**
 * The project providers (A6b): each leases a project runtime and provides its view as `ProjectContext`. They live
 * apart from `use-project.tsx`, which holds the context and its hooks, so a surface that only reads the open project
 * (the shared composer on Home) never reaches the project runtime, the editor or the viewer (progressive loading PL1).
 */
/* oxlint-disable typescript/no-restricted-types -- Workbench record entry paths are nullable by schema. */
import type { ReactNode } from 'react';
import { useMemo, useCallback, useEffect, useLayoutEffect, useReducer, useState, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { AnyActorRef, InputFrom } from 'xstate';
import type { ParameterManifest } from '@taucad/parameters';
import type { MachineActors } from '@taucad/ui-core/lib/xstate.lib';
import type { ParameterSetService } from '@taucad/ui-core/services/parameter-set-service';
import { toast } from 'sonner';
import { Topic } from '@taucad/events';
import { useFileManager } from '#hooks/use-file-manager.js';
import type { ParameterFilesClient } from '#hooks/use-file-manager.js';
import type { projectMachine } from '#machines/project.machine.js';
import { inspect } from '#machines/inspector.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { EntryPathChange } from '#workbench-records/entries-store.js';
import { useAppRuntime } from '#runtime/app-runtime-provider.js';
import { selectRuntimeChatSessions, selectRuntimeLeases, selectRuntimeProjectLibrary } from '#runtime/app-runtime.js';
import type { LeaseEntry } from '#runtime/leases.js';
import {
  createProjectRuntime,
  selectEditorRef,
  selectManifestObservationError,
  selectProjectRef,
} from '#runtime/project-runtime.js';
import type { ObservablePort, ProjectRuntimeActor, ProjectRuntimeProfileOptions } from '#runtime/project-runtime.js';
import { createProjectViewRecords } from '#runtime/project-runtime.view-records.js';
import { createEntriesRecordSession } from '#workbench-records/entries-record-session.js';
import type { EntriesRecordSnapshot } from '#workbench-records/entries-record-session.js';
import { sessionProjectRuntimeOf } from '#runtime/project-runtime.session.js';
import type { ProjectRuntimeViewSource } from '#runtime/project-runtime.session.js';
import { standaloneProjectPortOf } from '#runtime/standalone-project-port.js';

import { ProjectContext } from '#hooks/use-project.js';
import type { ProjectContextType } from '#hooks/use-project.js';

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Parameter operation failed.';

/** The file manager's parts this provider feeds its runtime: the parameter client (A6a R-b) and the record watch. */
type ProjectProviderFiles = Readonly<{
  parameterFiles: ParameterFilesClient;
  watchRecordFile: ReturnType<typeof useFileManager>['watchRecordFile'];
}>;

/** What a lease builds with the project runtime: its view records, and the file port the provider feeds. */
type LeasedProjectRuntime = ProjectRuntimeViewSource &
  Readonly<{
    /** Hand the runtime the file manager's current parts: the parameter port and the record sessions' host follow it. */
    replaceFiles: (files: ProjectProviderFiles) => void;
  }>;

type HotData = { leasedRuntimes?: WeakMap<ProjectRuntimeActor, LeasedProjectRuntime> };

const hotData = import.meta.hot?.data as HotData | undefined;
/* What each leased root was built with, by root: the lease store holds only the actor. Kept in `import.meta.hot.data`,
 * so a Fast Refresh of this module still finds the runtimes the lease store holds (A6b risk, carried to A6d). */
const leasedRuntimes: WeakMap<ProjectRuntimeActor, LeasedProjectRuntime> = hotData?.leasedRuntimes ?? new WeakMap();
if (hotData !== undefined) {
  hotData.leasedRuntimes = leasedRuntimes;
}

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
  /* Replaces this provider's actors wholesale: a project that is not on disk loads from its own source. */
  readonly provide?: { readonly actors: Pick<MachineActors<typeof projectMachine>, 'loadProjectActor'> };
  readonly input?: Omit<
    NonNullable<InputFrom<typeof projectMachine>>,
    'projectId' | 'fileManagerRef' | 'fileSystemRoot' | 'kernelOptionsFactory'
  >;
  readonly kernelOptionsFactory?: LazyKernelOptionsFactory;
  readonly profile?: 'editor' | 'shared';
  readonly previewParameterService?: ParameterSetService;
  /** A project outside the session registry (the owned preview): published to the runtime's standalone port (A11). */
  readonly isStandalone?: boolean;
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

/* A runtime without an entries record session reads no record and changes no paths, as no host was mounted. */
const noEntriesRecord: EntriesRecordSnapshot = { entriesRecord: undefined, appliedEntryRevisions: new Map() };
const subscribeNoEntriesRecord = (): (() => void) => () => undefined;
const readNoEntriesRecord = (): EntriesRecordSnapshot => noEntriesRecord;

const leasedRuntimeOf = (actor: ProjectRuntimeActor): LeasedProjectRuntime => {
  const leased = leasedRuntimes.get(actor);
  if (leased === undefined) {
    throw new Error('A project runtime lease is read only through useLeasedProjectRuntime');
  }
  return leased;
};

/**
 * The project's actors for a standalone host: a view of a leased project runtime (plan § 4 A6b). It creates nothing.
 *
 * The runtime (`runtime/project-runtime.ts`) builds the project and editor actors, the parameter service, the parameter
 * observers, the manifest observation and the library events, and owns the producer set every flush walks. Share,
 * preview and the converter lease theirs from the app runtime, keyed by the mount (D6). The lease builds the runtime
 * once, with the props of the render that first asks for it, as `useActorRef` read its input once. A live project's
 * session builds its own runtime (A6d); {@link SessionProjectProvider} is the view of that one.
 *
 * @param props - The project, how it loads, its kernel and profile.
 * @returns The provider element.
 */
export function ProjectProvider({
  children,
  projectId,
  provide,
  input,
  kernelOptionsFactory,
  profile = 'editor',
  previewParameterService,
  isStandalone = false,
}: ProjectProviderProps): React.JSX.Element {
  const appRuntime = useAppRuntime();
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
    /* Only the editor loading from disk writes view and entries records (G6b, A9); the options' type says so. */
    const entriesRecord =
      provide === undefined && profile === 'editor'
        ? createEntriesRecordSession({ projectId, host: viewRecordHost(files), clock: appRuntime.clock })
        : undefined;
    const profileOptions: ProjectRuntimeProfileOptions =
      provide === undefined
        ? entriesRecord === undefined
          ? { profile: 'shared' }
          : { profile: 'editor', viewRecordPorts: viewRecords.ports, entriesRecord }
        : profile === 'editor'
          ? { profile, provide }
          : { profile, provide };
    const runtime = createProjectRuntime({
      projectId,
      fileManager: { fileManagerRef: fileManager.fileManagerRef, parameterFiles },
      library: selectRuntimeProjectLibrary(appRuntime),
      // A12 (I21): the repair chat it creates empty shows empty at once.
      chatSessions: selectRuntimeChatSessions(appRuntime),
      ...profileOptions,
      ...(kernelOptionsFactory === undefined ? {} : { kernelSelection: { kernelOptionsFactory } }),
      ...(input === undefined ? {} : { input }),
      ...(previewParameterService === undefined ? {} : { previewParameterService }),
      clock: appRuntime.clock,
      ...(inspect === undefined ? {} : { inspect }),
    });
    return {
      runtime,
      viewRecords,
      entriesRecord,
      replaceFiles: (next) => {
        parameterFiles.set(next.parameterFiles);
        /* The filesystem's connections can be replaced (a new worker): each session reopens its store on the new ones. */
        viewRecords.ports.replaceHost(viewRecordHost(next));
        entriesRecord?.replaceHost(viewRecordHost(next));
      },
    };
  });
  const leased = leasedRuntimeOf(lease.actor);
  const { runtime, replaceFiles } = leased;

  /* The file manager's parts reach the runtime before any passive effect of this commit reads them, as the view
   * records' host replacement did. It sends nothing to an actor. */
  useLayoutEffect(() => {
    replaceFiles(files);
    /* A preview's scope rebuilds its service when its worker opener changes; the runtime follows it, as the memo did. */
    if (previewParameterService !== undefined) {
      runtime.replacePreviewParameterService(previewParameterService);
    }
  }, [files, replaceFiles, runtime, previewParameterService]);

  /* The shell's readers (Settings) find a project outside the registry through the runtime's port, never ancestry. */
  const { fileManagerRef } = fileManager;
  useLayoutEffect(
    () =>
      isStandalone
        ? standaloneProjectPortOf(appRuntime).publish({ projectId, fileManagerRef, runtime: leased })
        : undefined,
    [isStandalone, appRuntime, projectId, fileManagerRef, leased],
  );

  return (
    <ProjectRuntimeView projectId={projectId} profile={profile} source={leased}>
      {children}
    </ProjectRuntimeView>
  );
}

/**
 * The project's actors for a live project's subtree: a view of the runtime its session built (plan § 4 A6d). It creates,
 * starts and stops nothing: the session's `project` child owns the runtime, follows the session file manager's
 * connections, and asks the editor for the open request's chat. Until the child reports a runtime, and between two
 * runtimes, it renders nothing, as the session's file-manager provider does. A new runtime (a change of kernel
 * selection) remounts the subtree, as the React key on the provider did until A6e.
 *
 * @param props - The project, the root of the runtime its session built, and the subtree.
 * @returns The provider element, or nothing before the session has a runtime.
 * @public
 */
export function SessionProjectProvider({
  children,
  projectId,
  runtimeRef,
}: {
  readonly children: ReactNode;
  readonly projectId: string;
  /** The session's runtime (`selectProjectSessionRuntime`). */
  readonly runtimeRef: AnyActorRef | undefined;
}): React.ReactNode {
  const source = runtimeRef === undefined ? undefined : sessionProjectRuntimeOf(runtimeRef);
  if (source === undefined) {
    return null;
  }
  return (
    <ProjectRuntimeView key={source.key} projectId={projectId} profile='editor' source={source}>
      {children}
    </ProjectRuntimeView>
  );
}

/**
 * The context over one project runtime, whoever owns it: selectors over its actors and records, and the parameter and
 * metadata commands. It neither sends, subscribes nor times in an effect (I1, I16).
 */
function ProjectRuntimeView({
  children,
  projectId,
  profile,
  source,
}: {
  readonly children: ReactNode;
  readonly projectId: string;
  readonly profile: 'editor' | 'shared';
  readonly source: ProjectRuntimeViewSource;
}): React.JSX.Element {
  const { runtime, viewRecords, entriesRecord: entriesRecordSession } = source;
  const { actor } = runtime;
  /* The root spawned both with itself and never replaces them. */
  const actorRef = useSelector(actor, selectProjectRef);
  const editorRef = useSelector(actor, selectEditorRef);

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

  const viewGraphics = useSelector(actorRef, (state) => state.context.viewGraphics);
  /* The entries record session's record and acknowledgements (A9); it runs as a child of the runtime. */
  const { entriesRecord, appliedEntryRevisions } = useSyncExternalStore(
    entriesRecordSession?.subscribe ?? subscribeNoEntriesRecord,
    entriesRecordSession?.getSnapshot ?? readNoEntriesRecord,
    entriesRecordSession?.getSnapshot ?? readNoEntriesRecord,
  );
  const changeEntryPaths = useCallback(
    async (operation: EntryPathChange) => (entriesRecordSession ? entriesRecordSession.changePaths(operation) : false),
    [entriesRecordSession],
  );
  const modelInteractionRef = useSelector(actorRef, (state) => state.context.modelInteractionRef);
  const geometryUnits = useSelector(actorRef, (state) => state.context.geometryUnits);
  const mainEntryPath = useSelector(actorRef, (state) => state.context.mainEntryPath);
  const logRef = useSelector(actorRef, (state) => state.context.logRef);

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
      setViewRecord: viewRecords.setViewRecord,
      viewEntryPaths,
      setViewEntryPath: viewRecords.setViewEntryPath,
      entriesRecord,
      changeEntryPaths,
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
    viewEntryPaths,
    entriesRecord,
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
