import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Remote } from 'comlink';
import { useQueryClient } from '@tanstack/react-query';
import {
  getActiveGroupValues,
  parseProjectManifestBytes,
  projectToManifest,
  serializeProjectManifest,
} from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';
import type { ParameterManifest } from '@taucad/parameters';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';
import { projectMachine } from '#machines/project.machine.js';
import type { ProjectLoadInput, ProjectRetrievedEvent } from '#machines/project.machine.js';
import { editorMachine } from '#machines/editor.machine.js';
import { disposeCadRuntime } from '#machines/cad.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { logMachine } from '#machines/logs.machine.js';
import type { modelInteractionMachine } from '#machines/model-interaction.machine.js';
import { serializeModelComponentDisplayState } from '#machines/model-interaction.machine.js';
import { inspect } from '#machines/inspector.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { ChatStorage } from '#types/storage.types.js';
import { localKernelOptions } from '#constants/local-kernel-options.js';
import { useComputeReuseMode } from '#lib/compute-reuse-preference.js';
import { createParameterSetService } from '#services/parameter-set-service.js';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { compareChatsByRecency } from '#utils/chat-recency.utils.js';
import { toast } from 'sonner';

type ProjectContextType = {
  projectId: string;
  projectRef: ActorRefFrom<typeof projectMachine>;
  editorRef: ActorRefFrom<typeof editorMachine>;
  /** Per-viewer-panel graphics machines, keyed by Dockview panel ID */
  viewGraphics: Map<string, ActorRefFrom<typeof graphicsMachine>>;
  modelInteractionRef: ActorRefFrom<typeof modelInteractionMachine>;
  /** Dynamic geometry units keyed by entry path. Each is a headless CadMachine+KernelMachine. */
  geometryUnits: Map<string, ActorRefFrom<typeof cadMachine>>;
  /** The main entry path from project.assets.main.entryPath. */
  mainEntryPath: string;
  logRef: ActorRefFrom<typeof logMachine>;
  resolveParameterEntry: (filePath: string, manifest: ParameterManifest) => void;
  setGeometryUnitParameters: (
    filePath: string,
    manifest: ParameterManifest,
    parameters: Record<string, unknown>,
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

type FocusedChatWorker = Pick<ChatStorage, 'getChatsForResource' | 'createNavigationRepairChat'>;

export async function ensureFocusedChatForProject({
  projectId,
  requestedChatId,
  persistedChatId,
  worker,
  onCreatedChat,
}: {
  readonly projectId: string;
  readonly requestedChatId: string | undefined;
  readonly persistedChatId: string | undefined;
  readonly worker: FocusedChatWorker;
  readonly onCreatedChat?: () => void;
}): Promise<{ type: 'focusedChatEnsured'; focusedChatId: string }> {
  const chats = await worker.getChatsForResource(projectId);

  for (const candidateChatId of [requestedChatId, persistedChatId]) {
    const match = chats.find((chat) => chat.id === candidateChatId);
    if (match) {
      return { type: 'focusedChatEnsured', focusedChatId: match.id };
    }
  }

  if (chats.length > 0) {
    let mostRecent = chats[0]!;
    for (const candidate of chats) {
      if (compareChatsByRecency(candidate, mostRecent) < 0) {
        mostRecent = candidate;
      }
    }
    return { type: 'focusedChatEnsured', focusedChatId: mostRecent.id };
  }

  const created = await worker.createNavigationRepairChat(projectId);
  onCreatedChat?.();
  return { type: 'focusedChatEnsured', focusedChatId: created.id };
}

export const createProjectManifestChangeObserver = ({
  readManifest,
  getCurrentProject,
  reload,
}: {
  readonly readManifest: () => Promise<Uint8Array<ArrayBuffer>>;
  readonly getCurrentProject: () => ProjectManifest | undefined;
  readonly reload: () => void;
}): { readonly check: () => Promise<void>; readonly dispose: () => void } => {
  let disposed = false;
  let lastObserved = '';

  return {
    check: async () => {
      try {
        const parsed = parseProjectManifestBytes(await readManifest());
        if (!parsed.success || disposed) {
          return;
        }
        const serialized = new TextDecoder().decode(serializeProjectManifest(parsed.data));
        if (serialized === lastObserved) {
          return;
        }
        lastObserved = serialized;
        const current = getCurrentProject();
        if (!current || new TextDecoder().decode(serializeProjectManifest(projectToManifest(current))) !== serialized) {
          reload();
        }
      } catch {
        // Invalid/inaccessible external manifests remain visible through discovery conflicts.
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};

export async function resolveScopedProjectManifest({
  contentService,
  projectId,
}: {
  readonly contentService: FileContentService;
  readonly projectId: string;
}): Promise<ProjectManifest> {
  const outcome = await contentService.resolve('tau.json', { forceText: true });
  if (outcome.kind !== 'text') {
    throw new Error(`Cannot read tau.json for ${projectId}: ${outcome.kind}`);
  }

  const parsed = parseProjectManifestBytes(outcome.content);
  if (!parsed.success) {
    throw new Error(`Invalid tau.json for ${projectId}: ${parsed.issue.code}`);
  }
  if (parsed.data.id !== projectId) {
    throw new Error(`Scoped tau.json project ID mismatch: expected ${projectId}, received ${parsed.data.id}`);
  }
  return parsed.data;
}

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
}: {
  readonly children: ReactNode;
  readonly projectId: string;
  readonly requestedChatId?: string;
  readonly createdChatId?: string;
  readonly onFocusedChatResolved?: (chatId: string) => void;
  readonly provide?: Parameters<typeof projectMachine.provide>[0];
  readonly input?: Omit<
    Parameters<typeof useActorRef<typeof projectMachine>>[1]['input'],
    'projectId' | 'fileManagerRef' | 'fileSystemRoot' | 'kernelOptionsFactory'
  >;
  readonly kernelOptionsFactory?: LazyKernelOptionsFactory;
  readonly profile?: 'editor' | 'shared';
}): React.JSX.Element {
  // The shared-project workbench passes no factory, so this default is a real
  // product path: it reads the same preference the focused workbench does
  // instead of silently opting into durable reuse (charter D3).
  const computeMode = useComputeReuseMode();
  const resolvedKernelOptionsFactory = kernelOptionsFactory ?? localKernelOptions(projectId, undefined, computeMode);
  const queryClient = useQueryClient();
  // Create the project machine actor - it will auto-load based on projectId
  const fileManager = useFileManager();
  const projectManager = useProjectManager();
  const fileSystemRoot = useSelector(fileManager.fileManagerRef, (state) => state.context.rootDirectory);
  const parameterService = useMemo(
    () =>
      createParameterSetService({
        rootDirectory: fileSystemRoot,
        client: fileManager.client,
        subscribe: (path, listener) => fileManager.contentService?.subscribe(path, listener) ?? (() => undefined),
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      }),
    [fileManager.client, fileManager.contentService, fileSystemRoot],
  );
  /* A re-memoed service replaces the previous one; close the one it replaced. Never close on unmount:
   * the project session owns the final close and Strict Mode would close a live service. */
  const previousParameterService = useRef(parameterService);
  useEffect(() => {
    const previous = previousParameterService.current;
    previousParameterService.current = parameterService;
    if (previous === parameterService) {
      return;
    }
    // async-iife: bootstrap -- an effect cannot await the replaced service's close.
    void (async () => {
      try {
        await previous.close();
      } catch (error) {
        toast.error(errorMessage(error));
      }
    })();
  }, [parameterService]);

  const actorRef = useActorRef(
    projectMachine.provide({
      actors: {
        loadProjectActor: fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async ({ input }) => {
          const readySnapshot = await waitFor(fileManager.fileManagerRef, (state) => state.matches('ready'));

          const { contentService } = readySnapshot.context;
          if (!contentService) {
            throw new Error(`Project content service is unavailable for ${input.projectId}`);
          }
          const project = await resolveScopedProjectManifest({
            contentService,
            projectId: input.projectId,
          });
          return {
            type: 'projectRetrieved',
            project,
          };
        }),
        writeProjectActor: fromSafeAsync(async ({ input }) => {
          const { contentService } = fileManager.fileManagerRef.getSnapshot().context;
          if (!contentService) {
            throw new Error('File manager content service is not ready');
          }
          await contentService.write('tau.json', serializeProjectManifest(projectToManifest(input.project)), 'machine');
        }),
      },
      ...provide,
    }),
    {
      input: {
        projectId,
        fileManagerRef: fileManager.fileManagerRef,
        fileSystemRoot,
        kernelOptionsFactory: resolvedKernelOptionsFactory,
        ...input,
      },
      inspect,
    },
  );

  useEffect(
    () => () => {
      /* XState root stops do not run machine exit actions. This provider is
       * the project resource boundary, so release each child runtime before
       * React drops the actor tree. The helper is idempotent with the machine's
       * normal `destroyKernel` path. */
      for (const unit of actorRef.getSnapshot().context.geometryUnits.values()) {
        disposeCadRuntime(unit.getSnapshot().context);
      }
    },
    [actorRef],
  );

  // Get the worker for Editor state persistence
  const getReadiedWorker = useCallback(async (): Promise<Remote<ObjectStoreWorker>> => {
    const snapshot = await waitFor(
      projectManager.projectManagerRef,
      (state) => state.matches('ready') || state.matches('error'),
    );
    if (snapshot.matches('error')) {
      throw new Error('Project manager worker failed to initialize');
    }

    if (!snapshot.context.wrappedWorker) {
      throw new Error('Project manager worker not initialized');
    }

    return snapshot.context.wrappedWorker;
  }, [projectManager.projectManagerRef]);

  const editorRef = useActorRef(
    editorMachine.provide({
      actors: {
        loadEditorStateActor: fromSafeAsync(async ({ input }) => {
          if (profile === 'shared') {
            return { type: 'editorStateRetrieved', state: undefined };
          }
          const worker = await getReadiedWorker();
          const state = await worker.getEditorState(input.projectId);
          return { type: 'editorStateRetrieved', state };
        }),
        saveEditorStateActor: fromSafeAsync(async ({ input }) => {
          if (profile === 'shared') {
            return;
          }
          const worker = await getReadiedWorker();
          await worker.updateEditorState(input.editorState);
        }),
        ensureFocusedChatActor: fromSafeAsync(async ({ input }) => {
          if (profile === 'shared') {
            return {
              type: 'focusedChatEnsured',
              focusedChatId: `shared:${input.projectId}`,
            };
          }
          return ensureFocusedChatForProject({
            projectId: input.projectId,
            requestedChatId: input.requestedChatId,
            persistedChatId: input.persistedChatId,
            /* Chats are files now (W17): the project manager owns the store,
             * and the object-store worker knows nothing about them. */
            worker: projectManager,
            onCreatedChat: () => {
              // Surface the new chat through TanStack Query so `useChats`
              // refetches and the history selector picks it up immediately.
              void queryClient.invalidateQueries({
                queryKey: ['chats', input.projectId],
              });
            },
          });
        }),
      },
    }),
    {
      input: { projectId, requestedChatId },
      inspect,
    },
  );

  useEffect(() => {
    editorRef.send(
      createdChatId === requestedChatId && createdChatId !== undefined
        ? { type: 'focusCreatedChat', chatId: createdChatId }
        : { type: 'setRequestedChatId', chatId: requestedChatId },
    );
  }, [createdChatId, editorRef, requestedChatId]);

  // Select state from the machine
  const viewGraphics = useSelector(actorRef, (state) => state.context.viewGraphics);
  const modelInteractionRef = useSelector(actorRef, (state) => state.context.modelInteractionRef);
  const geometryUnits = useSelector(actorRef, (state) => state.context.geometryUnits);
  const mainEntryPath = useSelector(
    actorRef,

    (state) => state.context.mainEntryPath,
  );
  const logRef = useSelector(actorRef, (state) => state.context.logRef);
  const appliedParameterValues = useRef(new Map<string, string>());
  /* Keyed by entry path but bound to one actor: a retired and re-created set actor at the same path
   * (move rollback, delete and recreate, retried close) gets a fresh subscription. */
  const parameterObservers = useRef(new Map<string, Readonly<{ actor: unknown; unsubscribe: () => void }>>());

  /* The kernel learns a committed value from the set actor's own notification, which runs in the
   * same synchronous turn as the checked write — ahead of React's render of this provider. */
  const dispatchParameters = useCallback(
    (entryPath: string): void => {
      const cadRef = actorRef.getSnapshot().context.geometryUnits.get(entryPath);
      const current = parameterService.snapshot(entryPath);
      if (cadRef === undefined || current === undefined) {
        return;
      }
      const parameters = getActiveGroupValues(current.entry);
      const fingerprint = JSON.stringify(parameters);
      const appliedFingerprint =
        appliedParameterValues.current.get(entryPath) ?? JSON.stringify(cadRef.getSnapshot().context.parameters);
      if (appliedFingerprint !== fingerprint) {
        cadRef.send({ type: 'setParameters', parameters });
      }
      appliedParameterValues.current.set(entryPath, fingerprint);
    },
    [actorRef, parameterService],
  );

  const observeParameters = useCallback(
    (entryPath: string): void => {
      const actor = parameterService.actor(entryPath);
      const existing = parameterObservers.current.get(entryPath);
      if (actor === undefined || existing?.actor === actor) {
        return;
      }
      existing?.unsubscribe();
      let last: unknown;
      const subscription = actor.subscribe((snapshot) => {
        const { current } = snapshot.context;
        if (current !== undefined && current !== last) {
          last = current;
          dispatchParameters(entryPath);
        }
      });
      parameterObservers.current.set(entryPath, {
        actor,
        unsubscribe: () => {
          subscription.unsubscribe();
        },
      });
      dispatchParameters(entryPath);
    },
    [dispatchParameters, parameterService],
  );

  useEffect(() => {
    const observers = parameterObservers.current;
    const observeAll = (): void => {
      for (const entryPath of geometryUnits.keys()) {
        observeParameters(entryPath);
      }
    };
    observeAll();
    const unsubscribeActors = parameterService.subscribeActors(observeAll);
    for (const [entryPath, { unsubscribe }] of observers) {
      if (!geometryUnits.has(entryPath)) {
        unsubscribe();
        observers.delete(entryPath);
        appliedParameterValues.current.delete(entryPath);
      }
    }
    return () => {
      unsubscribeActors();
      for (const { unsubscribe } of observers.values()) {
        unsubscribe();
      }
      observers.clear();
    };
  }, [geometryUnits, observeParameters, parameterService]);
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const resolvedRequestedChatId = useSelector(editorRef, (state) => state.context.requestedChatId);
  const focusedChatResolved = useSelector(editorRef, (state) => state.matches({ ready: { operation: 'idle' } }));
  const modelComponentDisplay = useSelector(editorRef, (state) => state.context.modelComponentDisplay);
  const needsModelComponentDisplayMigration = useSelector(
    editorRef,
    (state) => state.context.needsModelComponentDisplayMigration,
  );
  const modelDisplayRevision = useSelector(modelInteractionRef, (state) => state.context.displayRevision);
  const restoredModelInteractionRef = useRef<ActorRefFrom<typeof modelInteractionMachine> | undefined>(undefined);

  useEffect(() => {
    editorRef.send({ type: 'load' });
  }, [editorRef]);

  useEffect(() => {
    if (!focusedChatResolved || restoredModelInteractionRef.current === modelInteractionRef) {
      return;
    }
    modelInteractionRef.send({
      type: 'restoreComponentDisplay',
      componentDisplay: modelComponentDisplay,
    });
    restoredModelInteractionRef.current = modelInteractionRef;
  }, [focusedChatResolved, modelComponentDisplay, modelInteractionRef]);

  useEffect(() => {
    if (!focusedChatResolved || restoredModelInteractionRef.current !== modelInteractionRef) {
      return;
    }
    const snapshot = modelInteractionRef.getSnapshot();
    if (snapshot.context.displayRevision !== modelDisplayRevision) {
      return;
    }
    const componentDisplay = serializeModelComponentDisplayState(snapshot.context);
    if (
      !needsModelComponentDisplayMigration &&
      JSON.stringify(componentDisplay) === JSON.stringify(modelComponentDisplay)
    ) {
      return;
    }
    editorRef.send({ type: 'setModelComponentDisplay', componentDisplay });
  }, [
    editorRef,
    focusedChatResolved,
    modelComponentDisplay,
    modelDisplayRevision,
    modelInteractionRef,
    needsModelComponentDisplayMigration,
  ]);

  useEffect(() => {
    if (focusedChatResolved && focusedChatId !== undefined && resolvedRequestedChatId === requestedChatId) {
      onFocusedChatResolved?.(focusedChatId);
    }
  }, [focusedChatId, focusedChatResolved, onFocusedChatResolved, requestedChatId, resolvedRequestedChatId]);

  useEffect(() => {
    if (profile === 'shared') {
      return;
    }
    const subscription = actorRef.on('projectUpdated', () => {
      void queryClient.invalidateQueries({ queryKey: ['projects'] });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [actorRef, profile, queryClient]);

  useEffect(() => {
    if (profile === 'shared') {
      return;
    }
    const activity = actorRef.on('projectActivity', async () => {
      await projectManager.touchProject(projectId);
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    });
    return () => {
      activity.unsubscribe();
    };
  }, [actorRef, profile, projectId, projectManager, queryClient]);

  useEffect(() => {
    const { contentService } = fileManager;
    if (!contentService) {
      return;
    }

    const observer = createProjectManifestChangeObserver({
      readManifest: async () => fileManager.readFile('tau.json'),
      getCurrentProject: () => actorRef.getSnapshot().context.project,
      reload: () => {
        actorRef.send({ type: 'reloadProject' });
      },
    });
    const unsubscribe = contentService.subscribe('tau.json', () => {
      void observer.check();
    });
    return () => {
      observer.dispose();
      unsubscribe();
    };
  }, [actorRef, fileManager]);

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
      // `resolve` creates the set actor synchronously, so the geometry observer can attach before
      // the load settles and will dispatch the first loaded snapshot.
      const operation = parameterService.resolve(filePath, manifest);
      observeParameters(filePath);
      // A failed load is shown in the panel with its recovery action, so it is not also a toast.
      const settle = async (): Promise<void> => {
        try {
          await operation;
        } catch {
          // The set actor holds the typed diagnostic.
        }
      };
      // async-iife: bootstrap -- resolution is observed through the set actor, not this promise.
      void settle();
    },
    [observeParameters, parameterService],
  );

  const setGeometryUnitParameters = useCallback(
    (filePath: string, manifest: ParameterManifest, parameters: Record<string, unknown>) => {
      reportParameterOperation(parameterService.replaceValues(filePath, manifest, parameters));
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
    const snapshot = await waitFor(actorRef, (state) => Boolean(state.context.project?.assets.main.entryPath));

    if (!snapshot.context.project?.assets.main.entryPath) {
      throw new Error('Main file not found');
    }

    return snapshot.context.project.assets.main.entryPath;
  }, [actorRef]);

  const value = useMemo<ProjectContextType>(() => {
    return {
      projectId,
      projectRef: actorRef,
      editorRef,
      viewGraphics,
      modelInteractionRef,
      geometryUnits,
      mainEntryPath,
      logRef,
      parameterService,
      resolveParameterEntry,
      setGeometryUnitParameters,
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
    actorRef,
    editorRef,
    viewGraphics,
    modelInteractionRef,
    geometryUnits,
    mainEntryPath,
    logRef,
    parameterService,
    resolveParameterEntry,
    setGeometryUnitParameters,
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
 * Falls back to the first available graphics actor from viewGraphics.
 * Returns undefined when no viewGraphics exist (e.g. before any viewer panel mounts).
 * Used by external consumers (headless capture, RPC handlers, parameters) that are NOT inside a GraphicsProvider.
 */
export function useMainGraphics(): ActorRefFrom<typeof graphicsMachine> | undefined {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useMainGraphics must be used within a ProjectProvider');
  }

  const { viewGraphics, editorRef, mainEntryPath } = context;

  const viewSettings = useSelector(editorRef, (state) => state.context.viewSettings);

  // Find a viewer panel showing mainEntryPath
  for (const [viewId, graphicsRef] of viewGraphics) {
    const settings = viewSettings[viewId];
    if (settings?.entryPath === mainEntryPath) {
      return graphicsRef;
    }
  }

  // Fallback: return the first available graphics actor from viewGraphics
  const firstViewGraphics = viewGraphics.values().next().value;
  if (firstViewGraphics) {
    return firstViewGraphics;
  }

  return undefined;
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
