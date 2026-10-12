/* oxlint-disable typescript/no-restricted-types -- Workbench record entry paths are nullable by schema. */
/* oxlint-disable eslint/no-await-in-loop -- Producer flushes must finish in owner order before project close. */
import { ObservationService } from '@taucad/fs-client/observation-service';
import { findEntryGraphics } from '#routes/w.$workspace.$project/geometry-unit.utils.js';
import type { ReactNode } from 'react';
import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom, InputFrom } from 'xstate';
import type { Remote } from 'comlink';
import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  describeProjectManifestIssue,
  parameterEntryPath,
  projectToManifest,
  readProjectManifestBytes,
  serializeProjectManifest,
} from '@taucad/types';
import type { ProjectManifest, ProjectManifestParseIssue } from '@taucad/types';
import type { ParameterManifest, ParameterSetOutcome } from '@taucad/parameters';
import type { WorkbenchEntries, WorkbenchView } from '@taucad/workbench';
import type { FileContentService } from '@taucad/fs-client/file-content-service';
import { FileNotFoundError } from '@taucad/fs-client/file-content-errors';
import { fileContentBytes } from '@taucad/fs-client/file-content-service';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { MachineActors } from '#lib/xstate.lib.js';
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
import { inspect } from '#machines/inspector.js';
import { useProjectManager } from '#hooks/use-project-manager.js';
import type { LazyKernelOptionsFactory } from '#types/runtime-client.alias.js';
import type { Chat } from '@taucad/chat';
import type { ChatStorage } from '#types/storage.types.js';
import { localKernelOptions } from '#constants/local-kernel-options.js';
import { useComputeReuseMode } from '#lib/compute-reuse-preference.js';
import { createParameterSetService } from '#services/parameter-set-service.js';
import type { ParameterSetService } from '#services/parameter-set-service.js';
import { compareChatsByRecency } from '#utils/chat-recency.utils.js';
import { isNotFound } from '#db/attachment-store.js';
import { toast } from 'sonner';
import type { EntryPathChange } from '#workbench-records/entries-store.js';

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
  registerWorkbenchRecordProducer: (flush: () => Promise<boolean>) => () => void;
  flushWorkbenchRecordProducers: () => Promise<void>;
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

/** Settlements that prove this actor wrote the bytes now held in its snapshot. */
export const shouldDispatchParameterSettlement = (outcome: ParameterSetOutcome | undefined): boolean =>
  outcome?.status === 'committed' && (outcome.write === 'applied' || outcome.write === 'reconciled');

export const parameterStageForSettlement = ({
  entryPath,
  outcome,
  bytes,
}: Readonly<{
  entryPath: string;
  outcome: ParameterSetOutcome | undefined;
  bytes: Uint8Array<ArrayBuffer> | undefined;
}>): Record<string, Uint8Array<ArrayBuffer>> | undefined =>
  shouldDispatchParameterSettlement(outcome) && bytes !== undefined
    ? { [parameterEntryPath(entryPath)]: bytes }
    : undefined;

type FocusedChatWorker = Pick<ChatStorage, 'getChatRecordsForResource' | 'createNavigationRepairChat'>;

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
  const chats = await worker.getChatRecordsForResource(projectId);

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

/** What the workspace holds: the manifest it renders and why the bytes on disk are not that manifest. */
type ObservedManifestState = {
  readonly project: ProjectManifest | undefined;
  readonly issue: ProjectManifestParseIssue | undefined;
};

const manifestStateKey = ({ project, issue }: ObservedManifestState): string =>
  [
    project === undefined ? '' : new TextDecoder().decode(serializeProjectManifest(projectToManifest(project))),
    ...(issue === undefined ? [] : describeProjectManifestIssue(issue)),
  ].join('\n');

/** A present id that names another project: this route's bytes no longer describe it. */
const idMismatchIssue = (expected: string, found: string): ProjectManifestParseIssue => ({
  code: 'manifest-invalid',
  issues: [{ code: 'custom', path: ['id'], message: `Expected ${expected}, the project open here; found ${found}` }],
});

/**
 * Follow `tau.json` while its project is open, never silently (blueprint R5).
 *
 * Valid JSON that still identifies this project (strict or degraded) reloads
 * when it differs from what the workspace holds, so a degraded declaration
 * shows its issue at once. Syntax-invalid JSON retains the mounted manifest
 * and reports its issue. Bytes that no longer identify it — missing, unreadable, oversize, a
 * foreign `$schema` or another project's id — are reported instead: the
 * workspace keeps its last good manifest open so the person can fix the file.
 */
export const createProjectManifestChangeObserver = ({
  projectId,
  getCurrent,
  reload,
  report,
}: {
  readonly projectId: string;
  readonly getCurrent: () => ObservedManifestState;
  readonly reload: () => void;
  readonly report: (issue: ProjectManifestParseIssue) => void;
}): {
  readonly check: (input: { readonly readManifest: () => Promise<Uint8Array<ArrayBuffer>> }) => Promise<void>;
  readonly invalidate: () => void;
  readonly dispose: () => void;
} => {
  let disposed = false;
  let generation = 0;
  let lastObserved: string | undefined;

  const reportIssue = (issue: ProjectManifestParseIssue): void => {
    // A later return to the same bytes must reload to clear the report.
    lastObserved = undefined;
    report(issue);
  };

  return {
    invalidate: () => {
      generation++;
    },
    check: async ({ readManifest }) => {
      const attempt = ++generation;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await readManifest();
      } catch (error) {
        if (!disposed && attempt === generation) {
          reportIssue(
            error instanceof FileNotFoundError || isNotFound(error)
              ? { code: 'manifest-missing' }
              : { code: 'manifest-unreadable', message: errorMessage(error) },
          );
        }
        return;
      }
      if (disposed || attempt !== generation) {
        return;
      }
      const read = readProjectManifestBytes(bytes, { id: projectId });
      if (!read.success) {
        reportIssue(read.issue);
        return;
      }
      if (read.data.id !== projectId) {
        reportIssue(idMismatchIssue(projectId, read.data.id));
        return;
      }
      const current = getCurrent();
      if (current.project !== undefined && read.issue?.code === 'manifest-invalid-json') {
        reportIssue(read.issue);
        return;
      }
      const observed = manifestStateKey({ project: read.data, issue: read.issue });
      if (observed === lastObserved) {
        return;
      }
      lastObserved = observed;
      if (current.project === undefined || manifestStateKey(current) !== observed) {
        reload();
      }
    },
    dispose: () => {
      disposed = true;
    },
  };
};

/**
 * Read the open route's manifest: strict, or degraded with its issue. The
 * route's id stands in only when the bytes lost theirs (blueprint R3).
 */
export async function resolveScopedProjectManifest({
  contentService,
  projectId,
}: {
  readonly contentService: FileContentService;
  readonly projectId: string;
}): Promise<{ readonly project: ProjectManifest; readonly issue?: ProjectManifestParseIssue }> {
  const outcome = await contentService.resolve('tau.json', { forceText: true });
  if (outcome.kind !== 'text') {
    throw new Error(`Cannot read tau.json for ${projectId}: ${outcome.kind}`);
  }

  const read = readProjectManifestBytes(outcome.content, { id: projectId });
  if (!read.success) {
    throw new Error(`Invalid tau.json for ${projectId}: ${describeProjectManifestIssue(read.issue).join(' ')}`);
  }
  if (read.data.id !== projectId) {
    throw new Error(`Scoped tau.json project ID mismatch: expected ${projectId}, received ${read.data.id}`);
  }
  return read.issue === undefined ? { project: read.data } : { project: read.data, issue: read.issue };
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
  /* Replaces this provider's actors wholesale: a project that is not on disk loads from its own source. */
  readonly provide?: { readonly actors: Pick<MachineActors<typeof projectMachine>, 'loadProjectActor'> };
  readonly input?: Omit<
    NonNullable<InputFrom<typeof projectMachine>>,
    'projectId' | 'fileManagerRef' | 'fileSystemRoot' | 'kernelOptionsFactory'
  >;
  readonly kernelOptionsFactory?: LazyKernelOptionsFactory;
  readonly profile?: 'editor' | 'shared';
}): React.JSX.Element {
  // A caller without a factory (the converter route) gets the local kernel, which
  // reads the same preference the focused workbench does instead of silently
  // opting into durable reuse (charter D3).
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
        client: fileManager.parameterFiles,
        watchReady: (request, onEvent) => {
          const content = fileManager.contentService;
          if (!content) {
            throw new Error('The parameter filesystem is not ready.');
          }
          const watch = content.watchReady(request, onEvent);
          return {
            ready: watch.ready,
            closed: (async () => {
              await watch.closed;
            })(),
            unsubscribe: watch.dispose,
          };
        },
        onError: (error) => {
          toast.error(errorMessage(error));
        },
      }),
    [fileManager.parameterFiles, fileManager.contentService, fileSystemRoot],
  );
  const workbenchRecordProducers = useRef(new Set<() => Promise<boolean>>());
  const registerWorkbenchRecordProducer = useCallback((flush: () => Promise<boolean>) => {
    workbenchRecordProducers.current.add(flush);
    return () => {
      workbenchRecordProducers.current.delete(flush);
    };
  }, []);
  const flushWorkbenchRecordProducers = useCallback(async (): Promise<void> => {
    for (const flush of workbenchRecordProducers.current) {
      if (!(await flush())) {
        throw new Error('Workbench records could not be saved.');
      }
    }
  }, []);
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

  const projectActors = {
    loadProjectActor: fromSafeAsync<ProjectRetrievedEvent, ProjectLoadInput>(async ({ input }) => {
      const readySnapshot = await waitFor(fileManager.fileManagerRef, (state) => state.matches('ready'));

      const { contentService } = readySnapshot.context;
      if (!contentService) {
        throw new Error(`Project content service is unavailable for ${input.projectId}`);
      }
      const { project, issue } = await resolveScopedProjectManifest({
        contentService,
        projectId: input.projectId,
      });
      return {
        type: 'projectRetrieved',
        project,
        ...(issue === undefined ? {} : { issue }),
      };
    }),
    writeProjectActor: fromSafeAsync(async ({ input }) => {
      const { contentService } = fileManager.fileManagerRef.getSnapshot().context;
      if (!contentService) {
        throw new Error('File manager content service is not ready');
      }
      if (!input.repair) {
        // Re-read: the bytes may have degraded since this workspace loaded them,
        // and an implicit write must never replace a degraded manifest (R4).
        const current = await contentService.resolve('tau.json', { forceText: true });
        if (current.kind === 'text') {
          const read = readProjectManifestBytes(current.content, { id: projectId });
          if (!read.success || read.issue !== undefined || read.data.id !== projectId) {
            throw new Error('tau.json needs repair before Tau can change it. Repair it, or fix it in the editor.');
          }
        }
      }
      await contentService.write('tau.json', serializeProjectManifest(projectToManifest(input.project)), 'machine');
    }),
  } satisfies Partial<MachineActors<typeof projectMachine>>;

  const actorRef = useActorRef(projectMachine.provide({ actors: provide?.actors ?? projectActors }), {
    input: {
      projectId,
      fileManagerRef: fileManager.fileManagerRef,
      fileSystemRoot,
      kernelOptionsFactory: resolvedKernelOptionsFactory,
      ...input,
    },
    inspect,
  });

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
      } satisfies Partial<MachineActors<typeof editorMachine>>,
    }),
    {
      input: { projectId, requestedChatId },
      inspect,
    },
  );

  /* A chat we already hold is focused synchronously. `setRequestedChatId` re-enters
   * `ensuringFocusedChat` for an async chat-list round trip, which flashes the chat
   * pane's skeleton — correct for an unknown/absent id, a visible flicker for every
   * switch between chats the sidebar just listed. */
  useEffect(() => {
    editorRef.send(
      requestedChatId !== undefined && isKnownChatId({ chatId: requestedChatId, createdChatId, projectId, queryClient })
        ? { type: 'focusKnownChat', chatId: requestedChatId }
        : { type: 'setRequestedChatId', chatId: requestedChatId },
    );
  }, [createdChatId, editorRef, projectId, queryClient, requestedChatId]);

  // Select state from the machine
  const viewGraphics = useSelector(actorRef, (state) => state.context.viewGraphics);
  const [viewRecords, setViewRecords] = useState<ReadonlyMap<string, WorkbenchView>>(() => new Map());
  const [appliedWorkbenchRevisions, setAppliedWorkbenchRevisions] = useState<ReadonlyMap<string, `sha256:${string}`>>(
    () => new Map(),
  );
  const [appliedEntryRevisions, setAppliedEntryRevisions] = useState<ReadonlyMap<string, `sha256:${string}`>>(
    () => new Map(),
  );
  const setAppliedWorkbenchRevision = useCallback((path: string, digest: `sha256:${string}` | undefined) => {
    setAppliedWorkbenchRevisions((current) => {
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
  const [viewEntryPaths, setViewEntryPaths] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  const setViewEntryPath = useCallback((viewId: string, path: string | null | undefined) => {
    setViewEntryPaths((current) => {
      if (current.get(viewId) === path) {
        return current;
      }
      const next = new Map(current);
      if (path === undefined) {
        next.delete(viewId);
      } else {
        next.set(viewId, path);
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
  const setViewRecord = useCallback((viewId: string, record: WorkbenchView | undefined) => {
    setViewRecords((current) => {
      if (current.get(viewId) === record) {
        return current;
      }
      const next = new Map(current);
      if (record) {
        next.set(viewId, record);
      } else {
        next.delete(viewId);
      }
      return next;
    });
  }, []);
  const modelInteractionRef = useSelector(actorRef, (state) => state.context.modelInteractionRef);
  const geometryUnits = useSelector(actorRef, (state) => state.context.geometryUnits);
  const mainEntryPath = useSelector(
    actorRef,

    (state) => state.context.mainEntryPath,
  );
  const logRef = useSelector(actorRef, (state) => state.context.logRef);
  /* Keyed by entry path but bound to one actor: a retired and re-created set actor at the same path
   * (move rollback, delete and recreate, retried close) gets a fresh subscription. */
  const parameterObservers = useRef(new Map<string, Readonly<{ actor: unknown; unsubscribe: () => void }>>());

  const observeParameters = useCallback(
    (entryPath: string): void => {
      const actor = parameterService.actor(entryPath);
      const existing = parameterObservers.current.get(entryPath);
      if (actor === undefined || existing?.actor === actor) {
        return;
      }
      existing?.unsubscribe();
      const subscription = actor.on('settled', ({ outcome }) => {
        performance.mark('tau:parameter-settled', { detail: { entryPath } });
        const cadRef = actorRef.getSnapshot().context.geometryUnits.get(entryPath);
        const current = parameterService.snapshot(entryPath);
        if (cadRef === undefined || current === undefined) {
          return;
        }
        const stage = parameterStageForSettlement({ entryPath, outcome, bytes: current.bytes ?? undefined });
        if (stage !== undefined) {
          /* Only the bytes the authority just persisted travel: the runtime resolves the values from
           * them and observes that revision itself, so the sidecar's own watch event has nothing left
           * to re-render, and this machine keeps no second copy of the stored values. */
          performance.mark('tau:parameter-dispatch', { detail: { entryPath } });
          cadRef.send({ type: 'commitParameters', stage });
        }
      });
      parameterObservers.current.set(entryPath, {
        actor,
        unsubscribe: () => {
          subscription.unsubscribe();
        },
      });
    },
    [actorRef, parameterService],
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
  useEffect(() => {
    editorRef.send({ type: 'load' });
  }, [editorRef]);

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

  const projectIsReady = useSelector(actorRef, (state) => state.matches('ready'));
  const manifestObservationRef = useRef<ObservationService<void> | undefined>(undefined);
  const [manifestObservationError, setManifestObservationError] = useState<string>();
  const retryManifestObservation = useCallback(() => {
    manifestObservationRef.current?.refresh();
  }, []);
  useEffect(() => {
    if (!projectIsReady) {
      return;
    }
    const { contentService } = fileManager;
    if (!contentService) {
      return;
    }

    const observer = createProjectManifestChangeObserver({
      projectId,
      getCurrent: () => {
        const { project, manifestIssue } = actorRef.getSnapshot().context;
        return { project, issue: manifestIssue };
      },
      reload: () => {
        actorRef.send({ type: 'reloadProject' });
      },
      report: (issue) => {
        actorRef.send({ type: 'manifestIssueObserved', issue });
      },
    });
    const observation = new ObservationService({
      resource: 'tau.json',
      invalidate: observer.invalidate,
      read: async (read) =>
        observer.check({
          readManifest: async () => {
            return fileContentBytes({
              path: 'tau.json',
              result: await read.observe(contentService.observeContent('tau.json')),
            });
          },
        }),
    });
    manifestObservationRef.current = observation;
    const updateHealth = (): void => {
      const snapshot = observation.getSnapshot();
      if (snapshot.status === 'ready') {
        setManifestObservationError(undefined);
      } else if (snapshot.status === 'closed' || snapshot.status === 'error') {
        setManifestObservationError(snapshot.error);
      }
    };
    const unsubscribe = observation.subscribe(updateHealth);
    const lease = observation.acquire();
    return () => {
      unsubscribe();
      if (manifestObservationRef.current === observation) {
        manifestObservationRef.current = undefined;
      }
      observer.dispose();
      lease.release();
    };
  }, [actorRef, fileManager, projectId, projectIsReady]);

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
        } catch {
          // The set actor holds the typed diagnostic.
        }
      };
      // async-iife: bootstrap -- resolution is observed through the set actor, not this promise.
      void settle();
    },
    [parameterService],
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
      profile,
      manifestObservationError,
      retryManifestObservation,
      projectRef: actorRef,
      editorRef,
      viewGraphics,
      viewRecords,
      appliedWorkbenchRevisions,
      setAppliedWorkbenchRevision,
      appliedEntryRevisions,
      setAppliedEntryRevision,
      setViewRecord,
      viewEntryPaths,
      setViewEntryPath,
      entriesRecord,
      setEntriesRecord,
      registerEntryPathChange,
      changeEntryPaths,
      registerWorkbenchRecordProducer,
      flushWorkbenchRecordProducers,
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
    profile,
    manifestObservationError,
    retryManifestObservation,
    actorRef,
    editorRef,
    viewGraphics,
    viewRecords,
    appliedWorkbenchRevisions,
    setAppliedWorkbenchRevision,
    appliedEntryRevisions,
    setAppliedEntryRevision,
    setViewRecord,
    viewEntryPaths,
    setViewEntryPath,
    entriesRecord,
    setEntriesRecord,
    registerEntryPathChange,
    changeEntryPaths,
    registerWorkbenchRecordProducer,
    flushWorkbenchRecordProducers,
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
