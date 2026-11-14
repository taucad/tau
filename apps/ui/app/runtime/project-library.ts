/**
 * The project library service (app state orchestration charter D9, D10; plan § 4 A2, A3b; inventory L1 to L3, L5,
 * L6, L8, S43).
 *
 * `ProjectLibrary` is a plain class in the `ChatSessionStore` pattern. The app runtime builds one with the browser
 * `QueryClient` (the same instance `root-layout.tsx` hands to `QueryClientProvider`) and starts it through its
 * `projectLibrary` child, so it survives an owner-change remount of the billing fence (B9). It owns five actors and
 * publishes what React reads through {@link ProjectLibrary.subscribe} and {@link ProjectLibrary.getSnapshot}:
 *
 * - the project-manager actor (the object-store worker, row L3) and the workspace connection (row L6), since A2;
 * - since A3b, `libraryDiscovery` (the passes and their epoch, and the two filesystem observations as its children),
 *   `libraryRecovery` (the journal, its replay loop and the gate on mutations) and `libraryAccess` (route access, one
 *   id-matched query per question). The service relays each machine's facts to the ones that fence on them, as they
 *   happen: the discovery epoch, the journal's readiness, the recovery set and every row start reach access; a settled
 *   row moves the discovery epoch; and the bootstrap pass, once it has run, lets the replay loop start.
 *
 * The machines' ports are the storage calls in `project-library-storage.ts`. They run over the root file manager's
 * facade, which `FileManagerScope` still builds in React, so `ProjectManagerProvider` hands it over in render through
 * one transitional {@link ProjectLibraryBinding} (programme-control D15 ruling, A2). A3b deleted the binding's
 * discovery half: `touchProject`'s wait, the chat ports and the connection services are the service's own now, and
 * only the facade is left, which A4b builds over `rootFiles` and then deletes. A port called before the first binding
 * waits for it; a later binding replaces the earlier one, and a call that resumes reads the current one.
 */
import { createActor, waitFor } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, AnyActorRef, SnapshotFrom } from 'xstate';
import type { QueryClient } from '@tanstack/react-query';
import { Topic } from '@taucad/events';
import type { Remote } from 'comlink';
import type { Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { ProjectDiscoveryResult, ProjectLocator } from '@taucad/filesystem';
import { getChatRecencyAt } from '@taucad/chat-ui/utils/chat-recency.utils';
import type { EditorState, EditorStateInput } from '@taucad/ui-core/types/editor.types';
import { readLocalProjectOpenPerformance } from '@taucad/ui-core/lib/project-open-performance';
import { projectManagerMachine } from '#hooks/project-manager.machine.js';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';
import { selectWorkspaceConnectionState, workspaceConnectionMachine } from '#hooks/workspace-connection.machine.js';
import type {
  PreparedWorkspaceCatalog,
  RegisteredWorkspace,
  WorkspaceConnectionServices,
  WorkspaceConnectionState,
} from '#hooks/workspace-connection.machine.js';
import type { DirectoryPick } from '#constants/browser.constants.js';
import {
  checkHandlePermission,
  createNodeWorkspace,
  createWorkspace,
  isNodeWorkspace,
  subscribeProjectRootConfigurationChanges,
} from '#filesystem/handle-store.js';
import type { Workspace } from '#filesystem/handle-store.js';
import { isBuildSuperseded, subscribeBuildSkew } from '#filesystem/build-skew.js';
import { createChatFileStore } from '#db/chat-file-storage.js';
import { createLibraryDiscovery, selectEpochCurrent } from '#machines/library-discovery.machine.js';
import type { LibraryDiscoveryActor } from '#machines/library-discovery.machine.js';
import { createLibraryRecovery } from '#machines/library-recovery.machine.js';
import type { LibraryRecoveryActor, ReplayOutcome } from '#machines/library-recovery.machine.js';
import { createLibraryAccess } from '#machines/library-access.machine.js';
import type { AccessAnswer, LibraryAccessActor } from '#machines/library-access.machine.js';
import type { ChatSessionDeps } from '#services/chat-session-store.js';
import type { ProjectLibraryState } from '#types/project-library.types.js';
import type { ChatStorage, CommitCancelledDraftRestoreInput } from '#types/storage.types.js';
import type { PendingProjectOperation, PendingProjectRecovery } from '#types/pending-project-operation.types.js';
import {
  applyDiscovery,
  buildProjectListing,
  classifyMissingProject,
  commitPendingProjectOperation,
  ensureProjectLibraryState,
  planDiscovery,
  presentWorkspaceRows,
  recoveryRowOf,
  rememberChatPlacement,
  replayOutcomeOf,
  scanDiscovery,
} from '#runtime/project-library-storage.js';
import type { DiscoveryScan, ProjectLibraryFileManager, ProjectListing } from '#runtime/project-library-storage.js';
import {
  createDiscoveryObservation,
  createMetadataObservation,
  createMetadataReadOwner,
} from '#runtime/project-library-observations.js';
import type { LibraryRecords } from '#runtime/project-library-observations.js';
import { ProjectCommands } from '#runtime/project-library-commands.js';
import type { ProjectLibraryChatSessions, ProjectLibrarySessions } from '#runtime/project-library-commands.js';

/** What the library takes from the runtime's composition. @public */
export type ProjectLibraryOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    /** The browser `QueryClient`, the same instance `QueryClientProvider` hands down. */
    queryClient: QueryClient;
    /**
     * The runtime's sessions registry, read when a command needs it (row L7). The runtime builds the library before
     * the registry, so it is a getter; a library built without it refuses the commands that ask the registry.
     */
    sessions?: () => ProjectLibrarySessions | undefined;
    /** The runtime's chat store, read when a command needs it; built after the library, so a getter too. */
    chatSessions?: () => ProjectLibraryChatSessions | undefined;
  }>;

/** The root file manager's record client and watch, which the chat store reads its records through. @public */
export type ProjectLibraryFiles = Readonly<{
  client: ChatSessionDeps['client'];
  watchRecordFile: NonNullable<ChatSessionDeps['watchRecordFile']>;
}>;

/** A value that can change: the current value, and a listener called after each change. @public */
export type ProjectLibraryObservable<T> = Readonly<{
  get: () => T;
  subscribe: (listener: () => void) => () => void;
}>;

/** The chat-record ports the chat store and the project runtime call. @public */
export type ProjectLibraryChatPorts = Readonly<{
  getChat: (chatId: string, projectId?: string) => Promise<Chat | undefined>;
  patchChat: <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]) => Promise<Chat | undefined>;
  adoptLegacyChatPlacement: (
    chatId: string,
    projectId: string | undefined,
    accept: (hostId: TauAgentHostId) => Promise<boolean>,
  ) => Promise<TauAgentHostId | undefined>;
  touchChatRecency: (chatId: string, requestedAt: number) => Promise<Chat | undefined>;
  consumeChatStartupRequest: (chatId: string, requestId: string) => Promise<Chat | undefined>;
  commitCancelledDraftRestore: (chatId: string, input: CommitCancelledDraftRestoreInput) => Promise<Chat | undefined>;
  getChatRecordsForResource: (resourceId: string, options?: { includeDeleted?: boolean }) => Promise<ChatRecord[]>;
  createNavigationRepairChat: (resourceId: string) => Promise<Chat>;
}>;

/**
 * The transitional binding `ProjectManagerProvider` supplies in render (D15 ruling, A2): the root file manager's
 * facade, which `FileManagerScope` builds in React. A4b builds it over `rootFiles` and deletes the binding.
 *
 * @public
 */
export type ProjectLibraryBinding = Readonly<{ fileManager: ProjectLibraryFileManager }>;

/** The route's answer about one project's access (`getProjectRouteAccess`). @public */
export type ProjectRouteAccess = Exclude<AccessAnswer, Readonly<{ status: 'error' }>>;

/** What React reads from the library. Each field keeps its identity until what it reads changes. @public */
export type ProjectLibrarySnapshot = Readonly<{
  /** The project-manager worker failed to start. */
  error: Error | undefined;
  /** The project-manager worker is not created yet. */
  isLoading: boolean;
  /** The workspace connection, as `selectWorkspaceConnectionState` reads it. */
  workspaceConnection: WorkspaceConnectionState;
  /** The rows this tab holds: waiting, replaying or failed (DF11). */
  recoveries: readonly PendingProjectRecovery[];
  /** Moves whenever a project moves in or out of the Trash (`libraryChanged`). */
  revision: number;
  /** The manifest watch's last error; absent when healthy. */
  discoveryObservationError: string | undefined;
  /** The chat-metadata watch's last error; absent when healthy. */
  metadataObservationError: string | undefined;
  /** Each project's chat-metadata watch error. */
  metadataObservationErrors: ReadonlyMap<string, string>;
}>;

/** What `libraryChanged` carries. @public */
export type LibraryChanged = Readonly<{ type: 'libraryChanged'; revision: number }>;

/** The project-manager actor's ref, which `useProject` waits on for the worker. @public */
export type ProjectManagerRef = Actor<typeof projectManagerMachine>;

/** The workspace-connection actor's ref. @public */
export type WorkspaceConnectionRef = Actor<typeof workspaceConnectionMachine>;

/** The telemetry of one workspace connection, filled in as its services run. @public */
export type WorkspaceConnectionTrace = {
  readonly operationId: string;
  startedAt: number;
  workspaceId: string | undefined;
  registeringDuration: number;
  mountingDuration: number;
  catalogDuration: number;
  publishingDuration: number;
  candidateCount: number;
  projectCount: number;
  conflictCount: number;
};

/** A mutation of one project, admitted by the recovery gate (rule 4) and accounted for until it settles. @public */
export type LibraryMutation = Readonly<{
  /** The mutation wrote its journal row: the row is held, and quarantined, until it settles. */
  journaled: (operation: PendingProjectOperation) => void;
  /** Commit the journaled operation; the row settles recovered, or failed with its reason (and the error is thrown). */
  apply: (operation: PendingProjectOperation, worker?: Remote<ObjectStoreWorker>) => Promise<void>;
  /** The mutation wrote no row. */
  abandon: () => void;
}>;

const isLoadingOf = (snapshot: SnapshotFrom<typeof projectManagerMachine>): boolean =>
  snapshot.matches('initializing') || snapshot.matches('creatingWorker');

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The library's worker-start failure. @public */
export const selectLibraryError = (snapshot: ProjectLibrarySnapshot): Error | undefined => snapshot.error;

/** Whether the library's worker is still starting. @public */
export const selectLibraryIsLoading = (snapshot: ProjectLibrarySnapshot): boolean => snapshot.isLoading;

/** The workspace connection's state. @public */
export const selectLibraryWorkspaceConnection = (snapshot: ProjectLibrarySnapshot): WorkspaceConnectionState =>
  snapshot.workspaceConnection;

/** The rows this tab holds. @public */
export const selectLibraryRecoveries = (snapshot: ProjectLibrarySnapshot): readonly PendingProjectRecovery[] =>
  snapshot.recoveries;

/** The library's revision, which moves on every `libraryChanged`. @public */
export const selectLibraryRevision = (snapshot: ProjectLibrarySnapshot): number => snapshot.revision;

/** The manifest watch's error. @public */
export const selectDiscoveryObservationError = (snapshot: ProjectLibrarySnapshot): string | undefined =>
  snapshot.discoveryObservationError;

/** The chat-metadata watch's error. @public */
export const selectMetadataObservationError = (snapshot: ProjectLibrarySnapshot): string | undefined =>
  snapshot.metadataObservationError;

/** Each project's chat-metadata watch error. @public */
export const selectMetadataObservationErrors = (snapshot: ProjectLibrarySnapshot): ReadonlyMap<string, string> =>
  snapshot.metadataObservationErrors;

/** Settles with the actor's first snapshot that satisfies `predicate`, the current one included. */
const until = async <Ref extends AnyActorRef>(
  actor: Ref,
  predicate: (snapshot: SnapshotFrom<Ref>) => boolean,
): Promise<SnapshotFrom<Ref>> => {
  const current = actor.getSnapshot() as SnapshotFrom<Ref>;
  if (predicate(current)) {
    return current;
  }
  return new Promise((resolve) => {
    const subscription = actor.subscribe((snapshot: SnapshotFrom<Ref>) => {
      if (predicate(snapshot)) {
        subscription.unsubscribe();
        resolve(snapshot);
      }
    });
  });
};

/** A rejection as an `Error`: a thrown non-error travels as its cause. */
const asError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error), { cause: error });

/**
 * The project library.
 *
 * @public
 */
export class ProjectLibrary {
  /** The browser `QueryClient`, the only writer of the project listing in the cache (D9). */
  public readonly queryClient: QueryClient;
  /** The project-manager actor: the object-store worker (row L3). */
  public readonly projectManager: ProjectManagerRef;
  /** The workspace-connection actor (row L6). */
  public readonly workspaceConnection: WorkspaceConnectionRef;
  /** The discovery passes, their epoch and the two filesystem observations (rows L1, L2, L5). */
  public readonly discovery: LibraryDiscoveryActor;
  /** The journal, its replay loop and the mutation gate (row L5). */
  public readonly recovery: LibraryRecoveryActor;
  /** Route access (row L8). */
  public readonly access: LibraryAccessActor;
  /** The root file facade's record client and watch, from the binding; `undefined` until the first one. */
  public readonly files: ProjectLibraryObservable<ProjectLibraryFiles | undefined>;
  /** The project commands (A4a): create, duplicate, delete, restore, adopt, repair and rename. */
  public readonly commands: ProjectCommands;

  #binding: ProjectLibraryBinding | undefined;
  #bound = Promise.withResolvers<void>();
  /** The current binding's provider disposed its reads and has not bound again. */
  #released = false;
  /** Counts releases, so a read can tell its provider released and resumed it while it ran (StrictMode). */
  #releases = 0;
  /** The chat store and its read owner over the binding's record client. */
  #records: LibraryRecords | undefined;
  readonly #changed = new Topic<void>({ name: 'project-library' });
  readonly #filesChanged = new Topic<void>({ name: 'project-library-files' });
  readonly #bindingChanged = new Topic<void>({ name: 'project-library-binding' });
  readonly #invalidateRequested = new Topic<void>({ name: 'project-library-invalidate' });
  readonly #libraryChanged = new Topic<LibraryChanged>({ name: 'project-library-changed' });
  #snapshot: ProjectLibrarySnapshot;
  #started = false;
  #recoveryStarted = false;
  readonly #subscriptions: Array<() => void> = [];
  /** Request ids for the machines' questions; they count from 0 in each life of the tab. */
  #requests = 0;
  /** What each scan read, by its pass's epoch, until that pass plans its writes. */
  readonly #scans = new Map<number, DiscoveryScan>();
  /*
   * The errors the machines carry only as messages (MC-R5 keeps them out of context): the last discovery port failure
   * with its pass's epoch, each discard's and the last journal read's, so a caller rejects with the error itself, as
   * today's direct calls did.
   */
  #passError: Readonly<{ epoch: number; error: Error }> | undefined;
  readonly #discardErrors = new Map<string, Error>();
  #journalError: Error | undefined;
  /**
   * The operations behind the journal rows, by id: host data the replay port reads, never machine context (MC-R5).
   * `fresh` while no attempt has consumed its bytes; a later attempt reads the journal again, as a retry does today.
   */
  readonly #operations = new Map<string, Readonly<{ operation: PendingProjectOperation; fresh: boolean }>>();
  /** The bootstrap pass in flight or run; dropped when it fails, so the next caller runs it again (A3a choice 4). */
  #bootstrap: Promise<void> | undefined;
  #bootstrapped = false;
  /** One workspace connection at a time, and its telemetry. */
  #connection: Promise<unknown> | undefined;
  #connectionTrace: WorkspaceConnectionTrace | undefined;

  public constructor({ queryClient, sessions, chatSessions, ...options }: ProjectLibraryOptions) {
    this.queryClient = queryClient;
    this.projectManager = createActor(projectManagerMachine, options);
    const connection: WorkspaceConnectionServices = {
      registerWorkspace: async (selection, signal) => this.#registerWorkspace(selection, signal),
      mountWorkspace: async (_workspace, selection, signal) => this.#mountWorkspace(selection, signal),
      prepareWorkspaceCatalog: async (workspace, signal) => this.#prepareWorkspaceCatalog(workspace, signal),
    };
    this.workspaceConnection = createActor(workspaceConnectionMachine, { ...options, input: connection });
    const host = {
      queryClient,
      /* The observations are the provider's: they read nothing while it has released its binding (B9). */
      fileManager: () => (this.#released ? undefined : this.#binding?.fileManager),
      records: () => (this.#released ? undefined : this.#records),
      subscribeBinding: (listener: () => void) => this.#bindingChanged.subscribe(listener),
      subscribeInvalidate: (listener: () => void) => this.#invalidateRequested.subscribe(listener),
      passSettled: async () => this.#passSettled(),
      publishMetadataHealth: (projectId: string, error: string | undefined) => {
        const previous = this.#snapshot.metadataObservationErrors;
        if (previous.get(projectId) === error) {
          return;
        }
        const next = new Map(previous);
        if (error === undefined) {
          next.delete(projectId);
        } else {
          next.set(projectId, error);
        }
        this.#publish({ ...this.#snapshot, metadataObservationErrors: next });
      },
      clearMetadataHealth: () => {
        if (this.#snapshot.metadataObservationErrors.size > 0) {
          this.#publish({ ...this.#snapshot, metadataObservationErrors: new Map() });
        }
      },
    };
    this.discovery = createLibraryDiscovery({
      ...options,
      ports: {
        scan: async ({ epoch }) =>
          this.#keepPassError(epoch, async () => {
            const fileManager = await this.#facade();
            const scan = await scanDiscovery(fileManager, () => this.#recoveries());
            for (const earlier of this.#scans.keys()) {
              if (earlier < epoch) {
                this.#scans.delete(earlier);
              }
            }
            this.#scans.set(epoch, scan);
            this.#syncWriteStop();
            return scan.result;
          }),
        plan: async ({ epoch, result }) =>
          this.#keepPassError(epoch, async () => {
            const scan = this.#scans.get(epoch);
            this.#scans.delete(epoch);
            const planned = await planDiscovery(
              {
                result,
                configs: scan?.configs ?? new Map(),
                quarantinedLocators: scan?.quarantinedLocators ?? new Map(),
              },
              async () => this.getReadiedWorker(),
            );
            this.#syncWriteStop();
            return planned;
          }),
        apply: async ({ epoch, writes }) =>
          this.#keepPassError(epoch, async () => {
            const fileManager = await this.#facade();
            return applyDiscovery(fileManager, async () => this.getReadiedWorker(), {
              writes,
              stopped: () => {
                this.#syncWriteStop();
                return isBuildSuperseded();
              },
            });
          }),
        discoveryObservation: createDiscoveryObservation(host),
        metadataObservation: createMetadataObservation(host),
      },
    });
    this.recovery = createLibraryRecovery({
      ...options,
      ports: {
        readJournal: async () => {
          let operations: PendingProjectOperation[];
          try {
            const worker = await this.getReadiedWorker();
            operations = await worker.getPendingProjectOperations();
            this.#journalError = undefined;
          } catch (error) {
            this.#journalError = asError(error);
            throw error;
          }
          for (const operation of operations) {
            if (!this.#operations.has(operation.operationId)) {
              this.#operations.set(operation.operationId, { operation, fresh: true });
            }
          }
          return operations.map((operation) => recoveryRowOf(operation));
        },
        replay: async ({ operationId }) => this.#replay(operationId),
        checkWorkspaces: async ({ rows }) => presentWorkspaceRows(rows),
        discard: async ({ operationId }) => {
          const worker = await this.getReadiedWorker();
          // `completePendingProjectOperation` is a plain journal-row delete, which is exactly what discarding needs.
          try {
            await worker.completePendingProjectOperation(operationId);
          } catch (error) {
            this.#discardErrors.set(operationId, asError(error));
            throw error;
          }
          this.#operations.delete(operationId);
        },
      },
    });
    this.access = createLibraryAccess({
      ...options,
      ports: {
        verifyProjectRoute: async ({ projectId }) => {
          const fileManager = await this.#facade();
          const verification = await fileManager.client.verifyProjectRoute({ projectId });
          return verification.status === 'verified'
            ? { status: 'verified', project: { ...verification.project.manifest, id: verification.project.projectId } }
            : { status: verification.status };
        },
        ensureProjectLibraryState: async ({ projectId }) => {
          const [fileManager, worker] = await Promise.all([this.#facade(), this.getReadiedWorker()]);
          return ensureProjectLibraryState(fileManager.recordFiles, worker, projectId);
        },
        discoveryPass: async ({ signal }) => this.#requestPass({ reuse: true, signal }),
        getProjectFileSystemConfig: async ({ projectId, discovery }) => classifyMissingProject(projectId, discovery),
        beginAccessSpan: () => readLocalProjectOpenPerformance()?.begin('access.check'),
      },
    });
    this.#relay();
    this.#snapshot = {
      error: this.projectManager.getSnapshot().context.error,
      isLoading: isLoadingOf(this.projectManager.getSnapshot()),
      workspaceConnection: selectWorkspaceConnectionState(this.workspaceConnection.getSnapshot()),
      recoveries: [],
      revision: 0,
      discoveryObservationError: undefined,
      metadataObservationError: undefined,
      metadataObservationErrors: new Map(),
    };
    this.projectManager.subscribe((snapshot) => {
      const { error } = snapshot.context;
      const isLoading = isLoadingOf(snapshot);
      if (error !== this.#snapshot.error || isLoading !== this.#snapshot.isLoading) {
        this.#publish({ ...this.#snapshot, error, isLoading });
      }
    });
    /* A start re-delivers the initial snapshot; only a new snapshot is a change. */
    let connectionSnapshot = this.workspaceConnection.getSnapshot();
    this.workspaceConnection.subscribe((snapshot) => {
      if (snapshot === connectionSnapshot) {
        return;
      }
      connectionSnapshot = snapshot;
      this.#publish({ ...this.#snapshot, workspaceConnection: selectWorkspaceConnectionState(snapshot) });
    });
    this.discovery.subscribe((snapshot) => {
      const { discovery: discoveryError, metadata: metadataError } = snapshot.context.observationErrors;
      if (
        discoveryError !== this.#snapshot.discoveryObservationError ||
        metadataError !== this.#snapshot.metadataObservationError
      ) {
        this.#publish({
          ...this.#snapshot,
          discoveryObservationError: discoveryError,
          metadataObservationError: metadataError,
        });
      }
    });
    this.files = {
      get: () => {
        const fileManager = this.#binding?.fileManager;
        return fileManager === undefined
          ? undefined
          : { client: fileManager.recordFiles, watchRecordFile: fileManager.watchRecordFile };
      },
      subscribe: (listener) => this.#filesChanged.subscribe(listener),
    };
    this.commands = new ProjectCommands({
      facade: async () => this.#facade(),
      chatStore: () => this.chatStore,
      readChats: async (operation, projectId) => this.readChats(operation, projectId),
      readiedWorker: async () => this.getReadiedWorker(),
      whenDiscoveryReady: async () => this.whenDiscoveryReady(),
      whenReplaysDrained: async () => this.whenReplaysDrained(),
      discover: async () => {
        const { result } = await this.discover();
        return result;
      },
      beginMutation: async (projectId, mutationOptions) => this.beginMutation(projectId, mutationOptions),
      replayForPerson: async (operation) => this.replayForPerson(operation),
      invalidateProjectListing: async () => this.invalidateProjectListing(),
      invalidateListing: () => {
        this.invalidateListing();
      },
      noteLibraryChanged: () => {
        this.noteLibraryChanged();
      },
      sessions: () => sessions?.(),
      chatSessions: () => chatSessions?.(),
    });
  }

  /**
   * Start the actors and the worker (row L3). The runtime's `projectLibrary` child calls it once, after hydration; a
   * second call does nothing. The journal is read when something first needs it, as today.
   */
  public start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.projectManager.start();
    this.workspaceConnection.start();
    this.access.start();
    this.discovery.start();
    this.projectManager.send({ type: 'initialize' });
    /* DF20: a newer build stops durable writes. The skew notice tells when it starts and ends; a port also reads the
     * flag at each gate, as today's pass did, since the flag can be set before any notice. */
    if (isBuildSuperseded()) {
      this.discovery.send({ type: 'writeStopBegan' });
    }
    this.#subscriptions.push(
      subscribeBuildSkew(() => {
        this.discovery.send({ type: isBuildSuperseded() ? 'writeStopBegan' : 'writeStopEnded' });
      }),
      subscribeProjectRootConfigurationChanges(async () => this.#rootsChanged()),
    );
  }

  /** Stop the actors; the worker is terminated by the project-manager machine's exit. */
  public stop(): void {
    for (const unsubscribe of this.#subscriptions.splice(0)) {
      unsubscribe();
    }
    this.access.stop();
    this.recovery.stop();
    this.discovery.stop();
    this.projectManager.stop();
    this.workspaceConnection.stop();
    /* `stop()` runs no `exit`: release the worker the stopped actor's context still holds, as the file-manager host
     * does for its actors. */
    const { worker } = this.projectManager.getSnapshot().context;
    worker?.terminate();
  }

  /** Subscribe to the snapshot. @returns The unsubscribe. */
  public readonly subscribe = (listener: () => void): (() => void) => this.#changed.subscribe(listener);

  /** The snapshot React reads, stable until it changes. */
  public readonly getSnapshot = (): ProjectLibrarySnapshot => this.#snapshot;

  /** Listen for `libraryChanged{revision}`: a project moved in or out of the Trash. @returns The unsubscribe. */
  public readonly onLibraryChanged = (listener: (event: LibraryChanged) => void): (() => void) =>
    this.#libraryChanged.subscribe(listener);

  /**
   * Supply the transitional binding (D15 ruling, A2). Called by `ProjectManagerProvider` in render; calling it again
   * replaces the binding. A change of the record client builds the chat store and its read owner again, and a change
   * of what the observations read rebuilds them.
   *
   * @param binding - The provider's current file manager facade.
   */
  public bind(binding: ProjectLibraryBinding): void {
    const previous = this.#binding?.fileManager;
    const { fileManager } = binding;
    const wasReleased = this.#released;
    this.#binding = binding;
    this.#released = false;
    this.#bound.resolve();
    const recordsChanged = previous?.recordFiles !== fileManager.recordFiles || this.#records === undefined;
    if (recordsChanged) {
      const chatStore = createChatFileStore({
        client: fileManager.recordFiles,
        projectIds: async () =>
          (this.queryClient.getQueryData<ProjectListing>(['projects'])?.projects ?? []).map((entry) => entry.projectId),
      });
      this.#records = { chatStore, readOwner: createMetadataReadOwner(chatStore) };
      /* Reads the old records served are disposed with them: each is asked again of the new ones. */
      this.#releases += 1;
    }
    const filesChanged =
      previous?.recordFiles !== fileManager.recordFiles || previous.watchRecordFile !== fileManager.watchRecordFile;
    if (filesChanged) {
      this.#filesChanged.emit();
    }
    if (
      wasReleased ||
      recordsChanged ||
      filesChanged ||
      previous.workerChangeChannel !== fileManager.workerChangeChannel
    ) {
      this.#bindingChanged.emit();
    }
  }

  /**
   * The provider disposed the reads its binding serves (its effect's cleanup): ports wait for it to
   * {@link ProjectLibrary.resume} or for the next {@link ProjectLibrary.bind}, and a read that failed meanwhile is
   * asked again of that binding.
   */
  public release(): void {
    if (this.#released) {
      return;
    }
    this.#released = true;
    this.#releases += 1;
    this.#bound = Promise.withResolvers<void>();
    /* The observations stop with the provider that serves them, which fails the reads they hold. */
    this.#bindingChanged.emit();
  }

  /** The provider's effect runs again over the binding it already supplied (an effect re-run, StrictMode). */
  public resume(): void {
    if (!this.#released || this.#binding === undefined) {
      return;
    }
    this.#released = false;
    this.#bound.resolve();
    this.#bindingChanged.emit();
  }

  /** The chat store over the current binding's record client; `undefined` before the first binding. */
  public get chatStore(): ChatStorage | undefined {
    return this.#records?.chatStore;
  }

  /** The worker once the project-manager actor is ready; refuses when it failed to start. */
  public readonly getReadiedWorker = async (): Promise<Remote<ObjectStoreWorker>> =>
    this.#readiedWorker('Project manager worker');

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Chat-record ports (R1-F2), over the chat store and the metadata observation's read owner. */

  /**
   * A chat-record read that waits for the metadata observation. A read its provider's release failed is asked again of
   * the records that serve next, unless `retry` is `false`: the provider's own reads end with it.
   */
  public readonly readChats = async <Value>(
    operation: (source: ChatStorage) => Promise<Value>,
    projectId?: string,
    { retry = true }: Readonly<{ retry?: boolean }> = {},
  ): Promise<Value> => {
    if (!retry) {
      // Admitted now, as the provider's read was: an unmount that follows in the same task fails it.
      const records = this.#released ? undefined : this.#records;
      return (records ?? (await this.#currentRecords())).readOwner.read(operation, projectId);
    }
    return this.#read(async ({ readOwner }) => readOwner.read(operation, projectId));
  };

  public readonly getChat: ProjectLibraryChatPorts['getChat'] = async (chatId, projectId) =>
    this.readChats(async (source) => source.getChat(chatId, projectId), projectId);

  public readonly getChatRecordsForResource: ProjectLibraryChatPorts['getChatRecordsForResource'] = async (
    resourceId,
    options,
  ) => this.readChats(async (source) => source.getChatRecordsForResource(resourceId, options), resourceId);

  public readonly patchChat: ProjectLibraryChatPorts['patchChat'] = async (chatId, key, value) => {
    const { chatStore } = await this.#currentRecords();
    const result = await chatStore.patchChat(chatId, key, value);
    if (result) {
      this.invalidateChatQueries(result.resourceId, chatId);
    }
    return result;
  };

  public readonly adoptLegacyChatPlacement: ProjectLibraryChatPorts['adoptLegacyChatPlacement'] = async (
    chatId,
    projectId,
    accept,
  ) => {
    const { chatStore } = await this.#currentRecords();
    return chatStore.adoptLegacyChatPlacement?.(chatId, projectId, accept);
  };

  public readonly touchChatRecency: ProjectLibraryChatPorts['touchChatRecency'] = async (chatId, requestedAt) => {
    const { chatStore } = await this.#currentRecords();
    const result = await chatStore.touchChatRecency(chatId, requestedAt);
    if (!result) {
      return undefined;
    }
    this.invalidateChatQueries(result.resourceId, chatId);
    await this.touchProject(result.resourceId, getChatRecencyAt(result));
    this.invalidateListing();
    return result;
  };

  public readonly consumeChatStartupRequest: ProjectLibraryChatPorts['consumeChatStartupRequest'] = async (
    chatId,
    requestId,
  ) => {
    const { chatStore } = await this.#currentRecords();
    return chatStore.consumeChatStartupRequest(chatId, requestId);
  };

  public readonly commitCancelledDraftRestore: ProjectLibraryChatPorts['commitCancelledDraftRestore'] = async (
    chatId,
    input,
  ) => {
    const { chatStore } = await this.#currentRecords();
    return chatStore.commitCancelledDraftRestore(chatId, input);
  };

  public readonly createNavigationRepairChat: ProjectLibraryChatPorts['createNavigationRepairChat'] = async (
    resourceId,
  ) => {
    const { chatStore } = await this.#currentRecords();
    return chatStore.createNavigationRepairChat(resourceId);
  };

  /** A chat changed: refetch its queries and the listings that show it. */
  public readonly invalidateChatQueries = (resourceId: string, chatId: string): void => {
    void this.queryClient.invalidateQueries({ queryKey: ['chats', resourceId] });
    void this.queryClient.invalidateQueries({ queryKey: ['all-chats'] });
    void this.queryClient.invalidateQueries({ queryKey: ['chat', chatId] });
  };

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* Projects. */

  /** Mark a project active, once the bootstrap pass has run. */
  public readonly touchProject = async (
    projectId: string,
    activityAt?: number,
  ): Promise<ProjectLibraryState | undefined> => {
    await this.whenDiscoveryReady();
    const worker = await this.getReadiedWorker();
    return worker.touchProjectActivity(projectId, activityAt);
  };

  /** A project's saved editor state, through the worker once it is ready (A6a's port; it keeps the worker wait). */
  public readonly getEditorState = async (projectId: string): Promise<EditorState | undefined> => {
    const worker = await this.#readiedWorker('Project manager worker');
    return worker.getEditorState(projectId);
  };

  /** Save a project's editor state, through the worker once it is ready. */
  public readonly updateEditorState = async (editorState: EditorStateInput): Promise<unknown> => {
    const worker = await this.#readiedWorker('Project manager worker');
    return worker.updateEditorState(editorState);
  };

  /** The project listing changed. */
  public readonly invalidateProjectListing = async (): Promise<unknown> =>
    this.queryClient.invalidateQueries({ queryKey: ['projects'] });

  /** A project's chat listing changed. */
  public readonly invalidateChatListing = async (projectId: string): Promise<unknown> =>
    this.queryClient.invalidateQueries({ queryKey: ['chats', projectId] });

  /** Storage changed under the listing: the epoch moves, the last listing is dropped and the listing refetches. */
  public readonly invalidateListing = (): void => {
    this.discovery.send({ type: 'invalidated' });
    void this.queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  /** A project moved in or out of the Trash: `libraryChanged{revision}`, so a resolved route asks again. */
  public readonly noteLibraryChanged = (): void => {
    const revision = this.#snapshot.revision + 1;
    this.#publish({ ...this.#snapshot, revision });
    this.#libraryChanged.emit({ type: 'libraryChanged', revision });
  };

  /** Ask the filesystem observations to read again: one project's chat metadata, or every watch. */
  public readonly refreshObservations = (resourceId?: string): void => {
    this.discovery.send(
      resourceId === undefined ? { type: 'refreshObservations' } : { type: 'refreshObservations', resourceId },
    );
  };

  /**
   * The bootstrap pass has run: the journal is read and one pass with its rows quarantined has settled, so the replay
   * loop may start (discovery before replay, as today). A failure rejects, and the next caller runs it again.
   */
  public readonly whenDiscoveryReady = async (): Promise<void> => this.#ensureBootstrap();

  /** The replay loop has nothing it may replay now (today's wait for the bootstrap loop). */
  public readonly whenReplaysDrained = async (): Promise<void> => {
    if (!this.#recoveryStarted) {
      return;
    }
    await until(
      this.recovery,
      (snapshot) => !snapshot.matches('ready') || snapshot.matches({ ready: { loop: 'idle' } }),
    );
  };

  /**
   * A pass's listing: the one current pass's when no pass is owed, otherwise a new one or the one in flight.
   *
   * @param options - `reuse` accepts the last listing while its epoch is current.
   * @returns The listing and the epoch it was taken at.
   */
  public readonly discover = async (
    options?: Readonly<{ reuse?: boolean }>,
  ): Promise<Readonly<{ epoch: number; result: ProjectDiscoveryResult }>> =>
    this.#requestPass({ reuse: options?.reuse ?? false });

  /** The listing the library shows: a current pass, enriched, read again whenever the epoch moved under it. */
  public readonly getProjectListing = async (options?: { includeDeleted?: boolean }): Promise<ProjectListing> => {
    // Captured before awaiting: only a caller that waited for the bootstrap pass may reuse its listing; a later
    // explicit refresh runs discovery.
    let reuse = !this.#bootstrapped;
    await this.#ensureBootstrap();
    /* oxlint-disable no-await-in-loop -- A filesystem event may invalidate the generation during listing enrichment. */
    for (;;) {
      const pass = await this.#requestPass({ reuse });
      reuse = false;
      const listing = await this.#buildListing(pass.result);
      if (!selectEpochCurrent(this.discovery.getSnapshot(), pass.epoch)) {
        continue;
      }
      return options?.includeDeleted
        ? listing
        : { ...listing, projects: listing.projects.filter((project) => project.library.deletedAt === undefined) };
    }
    /* oxlint-enable no-await-in-loop */
  };

  /**
   * The catalog a workspace connection publishes: a fresh pass after the one in flight, enriched, with counts for the
   * selected workspace. It replays a `workspace-unavailable` row whose workspace a check finds present (rule 6), and
   * publishes only while its pass's epoch is current (I7): a listing an invalidation overtook is dropped.
   *
   * @param selected - The workspace the counts are for.
   * @param signal - Aborts the preparation.
   * @returns The counts, and the publish.
   */
  public readonly prepareCurrentWorkspaceCatalog = async (
    selected?: Workspace,
    signal?: AbortSignal,
  ): Promise<PreparedWorkspaceCatalog> => {
    await this.#passSettled();
    signal?.throwIfAborted();
    await this.#retryRecoveries();
    const pass = await this.#requestPass({ reuse: false });
    const listing = await this.#buildListing(pass.result);
    signal?.throwIfAborted();
    // A node workspace is addressed by its absolute host path — the same
    // physical identity `resolveStorageRootKey` derives — where a webaccess
    // one is addressed by its retained-handle id.
    const isSelectedWorkspace = (locator: ProjectLocator): boolean => {
      if (selected === undefined) {
        return false;
      }
      return isNodeWorkspace(selected)
        ? locator.backend === 'node' && locator.path === selected.path
        : locator.backend === 'webaccess' && locator.workspaceId === selected.workspaceId;
    };
    const selectedProjects = listing.projects.filter(({ locator }) => isSelectedWorkspace(locator));
    const selectedConflicts = listing.conflicts.filter(({ locator }) => isSelectedWorkspace(locator));
    return {
      projectCount: selectedProjects.length,
      candidateCount: selectedProjects.length + selectedConflicts.length,
      conflictCount: selectedConflicts.length,
      publish: async () => {
        // The same task as the check (rule 1): a listing whose epoch moved is not the catalog any more.
        if (selectEpochCurrent(this.discovery.getSnapshot(), pass.epoch)) {
          this.queryClient.setQueryData(['projects'], listing);
        }
      },
    };
  };

  /**
   * Route access (row L8): asks `libraryAccess` with `accessAsked` and settles with its `accessAnswered`. Until A5b the
   * route awaits it through `getProjectRouteAccess`, which keeps its promise signature over that pair.
   *
   * @param projectId - The project the route opens.
   * @returns The answer; a port that rejected rejects with its message.
   */
  public readonly routeAccess = async (projectId: string): Promise<ProjectRouteAccess> => {
    this.#startRecovery();
    const requestId = this.#nextRequestId('access');
    return new Promise<ProjectRouteAccess>((resolve, reject) => {
      const subscription = this.access.on('accessAnswered', (event) => {
        if (event.requestId !== requestId) {
          return;
        }
        subscription.unsubscribe();
        if (event.answer.status === 'error') {
          reject(new Error(event.answer.message));
        } else {
          resolve(event.answer);
        }
      });
      this.access.send({ type: 'accessAsked', requestId, projectId });
    });
  };

  /**
   * Begin a mutation of `projectId` (rule 4). A gated one waits while this tab holds a waiting or replaying row for the
   * project, or another admitted mutation of it; one on a fresh id cannot be held by any row and is not gated.
   *
   * @param projectId - The project the mutation journals a row for.
   * @param options - `gated: false` for a fresh id.
   * @returns The mutation, once admitted.
   */
  public readonly beginMutation = async (
    projectId: string,
    { gated }: Readonly<{ gated: boolean }>,
  ): Promise<LibraryMutation> => {
    this.#startRecovery();
    const requestId = this.#nextRequestId('mutation');
    let journaled = false;
    if (gated) {
      await new Promise<void>((resolve, reject) => {
        const subscriptions = [
          this.recovery.on('mutationAdmitted', (event) => {
            if (event.requestId === requestId) {
              done();
              resolve();
            }
          }),
          // A gated caller asks after the journal was read; a read that fails meanwhile is its failure, not a hang.
          this.recovery.on('journalFailed', (event) => {
            done();
            this.recovery.send({ type: 'mutationAbandoned', requestId });
            reject(this.#journalError ?? new Error(event.message));
          }),
        ];
        const done = (): void => {
          for (const subscription of subscriptions) {
            subscription.unsubscribe();
          }
        };
        this.recovery.send({ type: 'mutationAsked', requestId, projectId });
      });
    }
    return {
      journaled: (operation) => {
        journaled = true;
        this.#startRecovery();
        // The mutation applies this copy itself; a later replay reads the journal again.
        this.#operations.set(operation.operationId, { operation, fresh: false });
        this.recovery.send({ type: 'mutationJournaled', requestId, row: recoveryRowOf(operation) });
      },
      apply: async (operation, worker) => {
        let outcome: ReplayOutcome = { status: 'recovered' };
        try {
          await this.#commit(operation, worker);
        } catch (error) {
          outcome = replayOutcomeOf(error);
          throw error;
        } finally {
          // Settled either way: the journal holds a row that failed, and a replay reads it again from there.
          this.#operations.delete(operation.operationId);
          this.recovery.send({ type: 'mutationSettled', operationId: operation.operationId, outcome });
        }
      },
      abandon: () => {
        if (!journaled) {
          this.recovery.send({ type: 'mutationAbandoned', requestId });
        }
      },
    };
  };

  /**
   * The person's replay of one unfinished row (`createProject(id)` under its named lock): it runs once the loop has
   * nothing to replay, through the loop.
   *
   * @param operation - The row's operation, as the journal holds it now.
   * @returns Whether the row is still held (failed, or not replayed).
   */
  public readonly replayForPerson = async (operation: PendingProjectOperation): Promise<boolean> => {
    this.#startRecovery();
    this.#operations.set(operation.operationId, { operation, fresh: true });
    const requestId = this.#nextRequestId('replay');
    return new Promise<boolean>((resolve) => {
      const subscription = this.recovery.on('replaySettled', (event) => {
        if (event.requestId === requestId) {
          subscription.unsubscribe();
          // A replay the loop skipped leaves the person's copy unread: a later one reads the journal.
          this.#operations.delete(operation.operationId);
          resolve(event.held);
        }
      });
      this.recovery.send({ type: 'replayAsked', requestId, row: recoveryRowOf(operation) });
    });
  };

  /** The person drops a failed row (DF11): its journal row is deleted. */
  public readonly discardRecovery = async (operationId: string): Promise<void> => {
    this.#startRecovery();
    const requestId = this.#nextRequestId('discard');
    const ok = await new Promise<boolean>((resolve) => {
      const subscription = this.recovery.on('discardSettled', (event) => {
        if (event.requestId === requestId) {
          subscription.unsubscribe();
          resolve(event.ok);
        }
      });
      this.recovery.send({ type: 'discardAsked', requestId, operationId });
    });
    const error = this.#discardErrors.get(operationId);
    this.#discardErrors.delete(operationId);
    if (!ok) {
      throw error ?? new Error(`The unfinished project operation could not be discarded: ${operationId}`);
    }
  };

  /* ---------------------------------------------------------------------------------------------------------------- */
  /* The workspace connection's telemetry and single flight, which `connectWorkspace` drives. */

  /** One connection at a time: a second call while one runs joins it. */
  public readonly connectOnce = async <Value>(run: () => Promise<Value>): Promise<Value> => {
    if (this.#connection !== undefined) {
      return this.#connection as Promise<Value>;
    }
    const connection = run();
    this.#connection = connection;
    try {
      return await connection;
    } finally {
      if (this.#connection === connection) {
        this.#connection = undefined;
      }
    }
  };

  /** The telemetry of the connection that runs now, which its services fill in. */
  public get connectionTrace(): WorkspaceConnectionTrace | undefined {
    return this.#connectionTrace;
  }

  public set connectionTrace(trace: WorkspaceConnectionTrace | undefined) {
    this.#connectionTrace = trace;
  }

  /* ---------------------------------------------------------------------------------------------------------------- */

  #publish(snapshot: ProjectLibrarySnapshot): void {
    this.#snapshot = snapshot;
    this.#changed.emit();
  }

  #nextRequestId(kind: string): string {
    this.#requests += 1;
    return `${kind}:${String(this.#requests)}`;
  }

  /** Relay each machine's facts to the ones that fence on them, as they happen (A3a choice 1). */
  #relay(): void {
    const { access, discovery, recovery } = this;
    discovery.on('epochMoved', (event) => {
      access.send(event);
    });
    /* DF20: a pass that skipped its writes in a stop is redone once the stop ends (rule 3). Today's skew listener
     * refetched the listing as it ran that pass, so a listing published during the stop is replaced by the redo's. */
    let { skipped } = discovery.getSnapshot().context;
    discovery.subscribe((snapshot) => {
      // Only the redo clears a skip (the redo pass may start within the same step, so `redo` is not seen).
      if (skipped && !snapshot.context.skipped) {
        void this.queryClient.invalidateQueries({ queryKey: ['projects'] });
      }
      ({ skipped } = snapshot.context);
    });
    recovery.on('journalReady', (event) => {
      access.send(event);
      // Rows are pending: they replay after the bootstrap pass, which a question then also waits for.
      if (event.pending > 0) {
        this.#bootstrapInBackground();
      }
    });
    recovery.on('journalFailed', (event) => {
      access.send(event);
    });
    recovery.on('recoveriesChanged', (event) => {
      access.send(event);
      this.#publish({ ...this.#snapshot, recoveries: event.recoveries });
    });
    recovery.on('rowStarted', (event) => {
      access.send({ type: 'recoveryStarted', projectId: event.projectId });
    });
    // A row settled or was discarded: storage may have changed, so the listing owes a pass (the model's `Bump`).
    recovery.on('rowSettled', () => {
      this.invalidateListing();
    });
    recovery.on('discoveryWanted', () => {
      this.#bootstrapInBackground();
    });
    access.on('journalWanted', () => {
      this.#startRecovery();
      recovery.send({ type: 'load' });
    });
    access.on('discoveryWanted', () => {
      this.#bootstrapInBackground();
    });
  }

  /** Start the recovery actor, which reads the journal: once, when something first needs it. */
  #startRecovery(): void {
    if (this.#recoveryStarted) {
      return;
    }
    this.#recoveryStarted = true;
    this.recovery.start();
  }

  #recoveries(): readonly PendingProjectRecovery[] {
    return this.#snapshot.recoveries;
  }

  /** Run the bootstrap pass for a caller that does not wait on it; its failure is reported to the machines. */
  #bootstrapInBackground(): void {
    // async-iife: bootstrap -- the caller does not wait; `#ensureBootstrap` reports a failure to the machines.
    void (async (): Promise<void> => {
      try {
        await this.#ensureBootstrap();
      } catch {
        /* Reported to the machines, which answer their waiters. */
      }
    })();
  }

  /** The bootstrap pass: the journal, then one pass with its rows quarantined; then the loop may replay. */
  async #ensureBootstrap(): Promise<void> {
    if (this.#bootstrap !== undefined) {
      return this.#bootstrap;
    }
    const bootstrap = (async (): Promise<void> => {
      this.#startRecovery();
      if (this.recovery.getSnapshot().matches('loadFailed')) {
        this.access.send({ type: 'journalRetrying' });
        this.recovery.send({ type: 'load' });
      }
      const read = await until(this.recovery, (snapshot) => !snapshot.matches('loading'));
      if (read.matches('loadFailed')) {
        throw (
          this.#journalError ?? new Error(read.context.loadError ?? 'The pending project operations could not be read.')
        );
      }
      try {
        await this.#requestPass({ reuse: false });
      } catch (error) {
        this.recovery.send({ type: 'discoveryFailed' });
        this.access.send({ type: 'discoveryFailed', message: messageOf(error) });
        throw error;
      }
      this.#bootstrapped = true;
      this.recovery.send({ type: 'discoveryReady' });
      this.access.send({ type: 'discoveryReady' });
    })();
    this.#bootstrap = bootstrap;
    try {
      await bootstrap;
    } catch (error) {
      if (this.#bootstrap === bootstrap) {
        this.#bootstrap = undefined;
      }
      throw error;
    }
  }

  /** Ask discovery for a pass and settle with its answer; `cached` when a current listing served it at once. */
  async #requestPass({
    reuse,
    signal,
  }: Readonly<{ reuse: boolean; signal?: AbortSignal }>): Promise<
    Readonly<{ epoch: number; result: ProjectDiscoveryResult; cached: boolean }>
  > {
    signal?.throwIfAborted();
    const requestId = this.#nextRequestId('pass');
    return new Promise((resolve, reject) => {
      let sending = true;
      const subscriptions = [
        this.discovery.on('passSettled', (event) => {
          if (event.requestId === requestId) {
            done();
            resolve({ epoch: event.epoch, result: event.result, cached: sending });
          }
        }),
        this.discovery.on('passFailed', (event) => {
          if (event.requestId === requestId) {
            done();
            const failure = this.#passError;
            reject(failure?.epoch === event.epoch ? failure.error : new Error(event.message));
          }
        }),
      ];
      /* A cancelled question stops waiting; the pass it joined still serves its other requesters (A3a risk). */
      const aborted = (): void => {
        done();
        reject(signal?.reason instanceof Error ? signal.reason : new Error('The pass is no longer wanted.'));
      };
      const done = (): void => {
        for (const subscription of subscriptions) {
          subscription.unsubscribe();
        }
        signal?.removeEventListener('abort', aborted);
      };
      signal?.addEventListener('abort', aborted, { once: true });
      this.discovery.send({ type: 'passRequested', requestId, reuse });
      sending = false;
    });
  }

  /** Run a discovery port, keeping its failure for the pass's requesters. */
  async #keepPassError<Value>(epoch: number, run: () => Promise<Value>): Promise<Value> {
    try {
      return await run();
    } catch (error) {
      this.#passError = { epoch, error: asError(error) };
      throw error;
    }
  }

  /** Settles once no discovery pass is in flight. */
  async #passSettled(): Promise<void> {
    await until(this.discovery, (snapshot) => snapshot.matches({ pass: 'idle' }));
  }

  /** DF20: tell discovery the stop began when a gate reads the flag before any notice did. */
  #syncWriteStop(): void {
    if (isBuildSuperseded() && this.discovery.getSnapshot().matches({ stop: 'running' })) {
      this.discovery.send({ type: 'writeStopBegan' });
    }
  }

  /**
   * Replay the `workspace-unavailable` rows whose workspace a check finds present (rule 6), and settle once the check
   * and the replays it re-armed have run. Before the journal was read this tab holds no row to replay.
   */
  async #retryRecoveries(): Promise<void> {
    if (!this.#recoveryStarted || !this.recovery.getSnapshot().matches('ready')) {
      return;
    }
    this.recovery.send({ type: 'retryRequested' });
    await until(
      this.recovery,
      (snapshot) =>
        !snapshot.matches('ready') ||
        (snapshot.matches({ ready: { retry: 'idle' } }) && snapshot.matches({ ready: { loop: 'idle' } })),
    );
  }

  /**
   * Another tab, or this one, changed the root configuration (row L6). The epoch moves at once; once the routes are
   * applied, rows whose workspace is back are replayed, and the manifest watch refetches the listing.
   */
  async #rootsChanged(): Promise<void> {
    this.discovery.send({ type: 'invalidated' });
    // The channel invokes this listener with nowhere to put a rejection, so the body owns its own failures (DF10).
    try {
      // Routes must be applied before any refetch reads them, so only the refetch is debounced.
      const fileManager = await this.#facade();
      await fileManager.workspace.syncProjectRoots();
      await this.#retryRecoveries();
    } catch (error) {
      console.warn('[ProjectManager] cross-tab root configuration change failed', error);
    } finally {
      this.discovery.send({ type: 'invalidated' });
      this.#invalidateRequested.emit();
    }
  }

  /**
   * Replay one row for the loop: the operation the journal read gave, or, once an attempt consumed its bytes, the
   * journal's copy read again. A row the journal no longer holds was settled by another tab.
   */
  async #replay(operationId: string): Promise<ReplayOutcome> {
    const known = this.#operations.get(operationId);
    let operation: PendingProjectOperation | undefined;
    // The copy is taken out either way: a later attempt reads the journal again, so a kept one would only hold bytes.
    this.#operations.delete(operationId);
    if (known?.fresh === true) {
      ({ operation } = known);
    } else {
      const worker = await this.getReadiedWorker();
      const journal = await worker.getPendingProjectOperations();
      operation = journal.find((candidate) => candidate.operationId === operationId);
      if (operation === undefined) {
        return { status: 'absent' };
      }
    }
    try {
      await this.#commit(operation);
      /* XD2: a replayed creation keeps its first chat's placement on this device, as the first attempt would have. */
      if (operation.kind === 'create' && operation.chat !== undefined) {
        const fileManager = await this.#facade();
        await rememberChatPlacement(fileManager.recordFiles, {
          projectId: operation.projectId,
          chatId: operation.chat.id,
          execution: operation.chat.activeExecution,
        });
      }
      return { status: 'recovered' };
    } catch (error) {
      return replayOutcomeOf(error);
    }
  }

  /** Commit an operation between passes: a pass in flight ends first, and the commit's own pass after it. */
  async #commit(operation: PendingProjectOperation, supplied?: Remote<ObjectStoreWorker>): Promise<void> {
    await this.#passSettled();
    const [fileManager, worker, { chatStore }] = await Promise.all([
      this.#facade(),
      supplied ?? this.getReadiedWorker(),
      this.#currentRecords(),
    ]);
    await commitPendingProjectOperation({ fileManager, worker, chatStore, queryClient: this.queryClient }, operation);
    await this.#passSettled();
  }

  async #buildListing(discovery: ProjectDiscoveryResult): Promise<ProjectListing> {
    const [fileManager, worker] = await Promise.all([this.#facade(), this.getReadiedWorker()]);
    return buildProjectListing({ recordFiles: fileManager.recordFiles, worker }, discovery, () => this.#recoveries());
  }

  async #registerWorkspace(selection: DirectoryPick, signal: AbortSignal) {
    const startedAt = performance.now();
    signal.throwIfAborted();
    try {
      const connection =
        selection.backend === 'webaccess'
          ? await createWorkspace(selection.handle)
          : await createNodeWorkspace(selection.path);
      signal.throwIfAborted();
      if (this.#connectionTrace) {
        this.#connectionTrace.workspaceId = connection.workspaceId;
      }
      return { workspace: connection, minted: connection.minted };
    } finally {
      if (this.#connectionTrace) {
        this.#connectionTrace.registeringDuration += performance.now() - startedAt;
      }
    }
  }

  async #mountWorkspace(selection: DirectoryPick, signal: AbortSignal): Promise<void> {
    const startedAt = performance.now();
    signal.throwIfAborted();
    try {
      // A node folder was chosen in a native dialog: the shell already holds
      // it, so the probe short-circuits to granted.
      if (selection.backend === 'webaccess' && (await checkHandlePermission(selection.handle)) !== 'granted') {
        throw new DOMException('Tau needs access to this workspace folder.', 'NotAllowedError');
      }
      const fileManager = await this.#facade();
      await fileManager.workspace.syncProjectRoots();
      signal.throwIfAborted();
    } finally {
      if (this.#connectionTrace) {
        this.#connectionTrace.mountingDuration += performance.now() - startedAt;
      }
    }
  }

  async #prepareWorkspaceCatalog(
    workspace: RegisteredWorkspace,
    signal: AbortSignal,
  ): Promise<PreparedWorkspaceCatalog> {
    const startedAt = performance.now();
    try {
      const catalog = await this.prepareCurrentWorkspaceCatalog(workspace.workspace, signal);
      const trace = this.#connectionTrace;
      if (trace) {
        trace.candidateCount = catalog.candidateCount;
        trace.projectCount = catalog.projectCount;
        trace.conflictCount = catalog.conflictCount;
      }
      return {
        ...catalog,
        publish: async () => {
          const publishStartedAt = performance.now();
          try {
            await catalog.publish();
          } finally {
            if (this.#connectionTrace) {
              this.#connectionTrace.publishingDuration += performance.now() - publishStartedAt;
            }
          }
        },
      };
    } finally {
      if (this.#connectionTrace) {
        this.#connectionTrace.catalogDuration += performance.now() - startedAt;
      }
    }
  }

  /** The current binding's facade, once there is one: a call made earlier waits, and reads the one current then. */
  async #facade(): Promise<ProjectLibraryFileManager> {
    await this.#bound.promise;
    return this.#binding!.fileManager;
  }

  async #currentRecords(): Promise<LibraryRecords> {
    await this.#bound.promise;
    return this.#records!;
  }

  /**
   * A read through the current records. A provider that unmounts disposes its reads, so a read that fails after its
   * provider released it (a billing-fence remount, B9, or an effect re-run), or after the records it ran on were
   * replaced, is asked once more of the records that serve next: the chat store outlives the provider and would
   * otherwise keep a session whose history never loaded. Only reads are asked again.
   */
  async #read<T>(call: (records: LibraryRecords) => Promise<T>): Promise<T> {
    await this.#bound.promise;
    const records = this.#records!;
    const releases = this.#releases;
    try {
      return await call(records);
    } catch (error) {
      /* No release while it ran: the read's own failure, whatever re-render rebound the same ports meanwhile. */
      if (!this.#released && this.#releases === releases) {
        throw error;
      }
      /* Released (and replaced or resumed, in any order): ask the records that serve reads next. */
      return call(await this.#currentRecords());
    }
  }

  async #readiedWorker(label: string): Promise<Remote<ObjectStoreWorker>> {
    const snapshot = await waitFor(this.projectManager, (state) => state.matches('ready') || state.matches('error'));
    if (snapshot.matches('error')) {
      throw new Error(`${label} failed to initialize`);
    }
    if (!snapshot.context.wrappedWorker) {
      throw new Error(`${label} not initialized`);
    }
    return snapshot.context.wrappedWorker;
  }
}
