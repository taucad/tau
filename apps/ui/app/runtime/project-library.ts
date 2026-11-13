/**
 * The project library service (app state orchestration charter D9; plan § 4 A2; inventory L3, L6, S43).
 *
 * `ProjectLibrary` is a plain class in the `ChatSessionStore` pattern. The app runtime builds one with the browser
 * `QueryClient` (the same instance `root-layout.tsx` hands to `QueryClientProvider`) and starts it through its
 * `projectLibrary` child, so it survives an owner-change remount of the billing fence (B9). It owns the project-manager
 * and workspace-connection actors, publishes what React reads through {@link ProjectLibrary.subscribe} and
 * {@link ProjectLibrary.getSnapshot}, and exposes the ports the chat store and the project runtime call: the
 * chat-record methods, `touchProject`, the editor state and the two listing invalidations.
 *
 * Discovery, recovery and route access still run in `ProjectManagerProvider` in this cut, against this service's
 * actors. So do the root file facade's `recordFiles` and `watchRecordFile`, which `FileManagerScope` builds in React.
 * Both reach the ports through one transitional {@link ProjectLibraryBinding} the provider supplies in render, where
 * the chat store's per-render mirror used to run (programme-control D15 ruling, A2). A port called before the first
 * binding waits for it; a later binding replaces the earlier one, and a call that resumes reads the current one. A3b
 * deletes the discovery half of the binding; A4b builds the root file facade outside React and deletes the rest.
 */
import { createActor, waitFor } from 'xstate';
import type { Actor, ActorOptions, AnyActorLogic, SnapshotFrom } from 'xstate';
import type { QueryClient } from '@tanstack/react-query';
import { Topic } from '@taucad/events';
import type { Remote } from 'comlink';
import type { Chat, TauAgentHostId } from '@taucad/chat';
import type { ChatRecord } from '@taucad/chat/schemas';
import type { EditorState, EditorStateInput } from '@taucad/ui-core/types/editor.types';
import { projectManagerMachine } from '#hooks/project-manager.machine.js';
import type { ObjectStoreWorker } from '#hooks/object-store.worker.js';
import { selectWorkspaceConnectionState, workspaceConnectionMachine } from '#hooks/workspace-connection.machine.js';
import type { WorkspaceConnectionServices, WorkspaceConnectionState } from '#hooks/workspace-connection.machine.js';
import type { ChatSessionDeps } from '#services/chat-session-store.js';
import type { ProjectLibraryState } from '#types/project-library.types.js';
import type { CommitCancelledDraftRestoreInput } from '#types/storage.types.js';

/** What the library takes from the runtime's composition. @public */
export type ProjectLibraryOptions = Pick<ActorOptions<AnyActorLogic>, 'clock' | 'inspect' | 'onRejectedEvent'> &
  Readonly<{
    /** The browser `QueryClient`, the same instance `QueryClientProvider` hands down. */
    queryClient: QueryClient;
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

/** The chat-record ports, as `ProjectManagerProvider` implements them today. @public */
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
 * The transitional binding `ProjectManagerProvider` supplies in render (D15 ruling, A2): what the ports need that
 * still lives in React. A3b deletes `touchProject`'s discovery wait, the chat ports' epoch bumps and the connection
 * services from it; A4b deletes `files`.
 *
 * @public
 */
export type ProjectLibraryBinding = Readonly<{
  /** The root file facade's record client and watch (`FileManagerScope`). */
  files: ProjectLibraryFiles;
  /** The chat-record methods, over the provider's chat file store and its metadata read owner. */
  chats: ProjectLibraryChatPorts;
  /** Mark a project active once discovery is ready (the provider's `touchProject`). */
  touchProject: (projectId: string, activityAt?: number) => Promise<ProjectLibraryState | undefined>;
  /** The workspace connection's services, over the provider's discovery. */
  connection: WorkspaceConnectionServices;
}>;

/** What React reads from the library. Each field keeps its identity until its actor changes. @public */
export type ProjectLibrarySnapshot = Readonly<{
  /** The project-manager worker failed to start. */
  error: Error | undefined;
  /** The project-manager worker is not created yet. */
  isLoading: boolean;
  /** The workspace connection, as `selectWorkspaceConnectionState` reads it. */
  workspaceConnection: WorkspaceConnectionState;
}>;

/** The project-manager actor's ref, which `useProject` waits on for the worker. @public */
export type ProjectManagerRef = Actor<typeof projectManagerMachine>;

/** The workspace-connection actor's ref. @public */
export type WorkspaceConnectionRef = Actor<typeof workspaceConnectionMachine>;

const isLoadingOf = (snapshot: SnapshotFrom<typeof projectManagerMachine>): boolean =>
  snapshot.matches('initializing') || snapshot.matches('creatingWorker');

/** The library's worker-start failure. @public */
export const selectLibraryError = (snapshot: ProjectLibrarySnapshot): Error | undefined => snapshot.error;

/** Whether the library's worker is still starting. @public */
export const selectLibraryIsLoading = (snapshot: ProjectLibrarySnapshot): boolean => snapshot.isLoading;

/** The workspace connection's state. @public */
export const selectLibraryWorkspaceConnection = (snapshot: ProjectLibrarySnapshot): WorkspaceConnectionState =>
  snapshot.workspaceConnection;

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
  /** The root file facade's record client and watch, from the binding; `undefined` until the first one. */
  public readonly files: ProjectLibraryObservable<ProjectLibraryFiles | undefined>;

  #binding: ProjectLibraryBinding | undefined;
  #bound = Promise.withResolvers<void>();
  /** The current binding's provider disposed its reads and has not bound again. */
  #released = false;
  /** Counts releases, so a read can tell its provider released and resumed it while it ran (StrictMode). */
  #releases = 0;
  readonly #changed = new Topic<void>({ name: 'project-library' });
  readonly #filesChanged = new Topic<void>({ name: 'project-library-files' });
  #snapshot: ProjectLibrarySnapshot;
  #started = false;

  public constructor({ queryClient, ...options }: ProjectLibraryOptions) {
    this.queryClient = queryClient;
    this.projectManager = createActor(projectManagerMachine, options);
    /* Each service resolves the current binding when the machine invokes it, so a remounted provider's is used. */
    const connection: WorkspaceConnectionServices = {
      registerWorkspace: async (selection, signal) => {
        const binding = await this.#current();
        return binding.connection.registerWorkspace(selection, signal);
      },
      mountWorkspace: async (workspace, selection, signal) => {
        const binding = await this.#current();
        return binding.connection.mountWorkspace(workspace, selection, signal);
      },
      prepareWorkspaceCatalog: async (workspace, signal) => {
        const binding = await this.#current();
        return binding.connection.prepareWorkspaceCatalog(workspace, signal);
      },
    };
    this.workspaceConnection = createActor(workspaceConnectionMachine, { ...options, input: connection });
    this.#snapshot = {
      error: this.projectManager.getSnapshot().context.error,
      isLoading: isLoadingOf(this.projectManager.getSnapshot()),
      workspaceConnection: selectWorkspaceConnectionState(this.workspaceConnection.getSnapshot()),
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
    this.files = {
      get: () => this.#binding?.files,
      subscribe: (listener) => this.#filesChanged.subscribe(listener),
    };
  }

  /**
   * Start the actors and the worker (row L3). The runtime's `projectLibrary` child calls it once, after hydration; a
   * second call does nothing.
   */
  public start(): void {
    if (this.#started) {
      return;
    }
    this.#started = true;
    this.projectManager.start();
    this.workspaceConnection.start();
    this.projectManager.send({ type: 'initialize' });
  }

  /** Stop the actors; the worker is terminated by the project-manager machine's exit. */
  public stop(): void {
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

  /**
   * Supply the transitional binding (D15 ruling, A2). Called by `ProjectManagerProvider` in render; calling it again
   * replaces the binding. A change of the file facade notifies {@link ProjectLibrary.files}.
   *
   * @param binding - The provider's current implementations.
   */
  public bind(binding: ProjectLibraryBinding): void {
    const previous = this.#binding?.files;
    this.#binding = binding;
    this.#released = false;
    this.#bound.resolve();
    if (previous?.client !== binding.files.client || previous.watchRecordFile !== binding.files.watchRecordFile) {
      this.#filesChanged.emit();
    }
  }
  /**
   * The provider disposed the reads its binding serves (its observation effect's cleanup): ports wait for it to
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
  }

  /** The provider's observation runs again over the binding it already supplied (an effect re-run, StrictMode). */
  public resume(): void {
    if (!this.#released || this.#binding === undefined) {
      return;
    }
    this.#released = false;
    this.#bound.resolve();
  }

  /** The worker once the project-manager actor is ready; refuses when it failed to start. */
  public readonly getReadiedWorker = async (): Promise<Remote<ObjectStoreWorker>> =>
    this.#readiedWorker('Projct manager worker');

  // Chat-record ports (R1-F2): the same worker-backed methods the provider implements.
  public readonly getChat: ProjectLibraryChatPorts['getChat'] = async (chatId, projectId) =>
    this.#read(async (chats) => chats.getChat(chatId, projectId));

  public readonly patchChat: ProjectLibraryChatPorts['patchChat'] = async (chatId, key, value) => {
    const { chats } = await this.#current();
    return chats.patchChat(chatId, key, value);
  };

  public readonly adoptLegacyChatPlacement: ProjectLibraryChatPorts['adoptLegacyChatPlacement'] = async (
    chatId,
    projectId,
    accept,
  ) => {
    const { chats } = await this.#current();
    return chats.adoptLegacyChatPlacement(chatId, projectId, accept);
  };

  public readonly touchChatRecency: ProjectLibraryChatPorts['touchChatRecency'] = async (chatId, requestedAt) => {
    const { chats } = await this.#current();
    return chats.touchChatRecency(chatId, requestedAt);
  };

  public readonly consumeChatStartupRequest: ProjectLibraryChatPorts['consumeChatStartupRequest'] = async (
    chatId,
    requestId,
  ) => {
    const { chats } = await this.#current();
    return chats.consumeChatStartupRequest(chatId, requestId);
  };

  public readonly commitCancelledDraftRestore: ProjectLibraryChatPorts['commitCancelledDraftRestore'] = async (
    chatId,
    input,
  ) => {
    const { chats } = await this.#current();
    return chats.commitCancelledDraftRestore(chatId, input);
  };

  public readonly getChatRecordsForResource: ProjectLibraryChatPorts['getChatRecordsForResource'] = async (
    resourceId,
    options,
  ) => this.#read(async (chats) => chats.getChatRecordsForResource(resourceId, options));

  public readonly createNavigationRepairChat: ProjectLibraryChatPorts['createNavigationRepairChat'] = async (
    resourceId,
  ) => {
    const { chats } = await this.#current();
    return chats.createNavigationRepairChat(resourceId);
  };

  /** Mark a project active, once discovery is ready. */
  public readonly touchProject = async (
    projectId: string,
    activityAt?: number,
  ): Promise<ProjectLibraryState | undefined> => {
    const binding = await this.#current();
    return binding.touchProject(projectId, activityAt);
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

  #publish(snapshot: ProjectLibrarySnapshot): void {
    this.#snapshot = snapshot;
    this.#changed.emit();
  }

  /** The current binding, once there is one: a call made earlier waits, and reads the binding current when it resumes. */
  async #current(): Promise<ProjectLibraryBinding> {
    await this.#bound.promise;
    return this.#binding!;
  }

  /**
   * A read through the current binding. A provider that unmounts disposes its reads, so a read that fails once its
   * binding was released or replaced (a billing-fence remount, B9) is asked once more of the binding that serves
   * next, whichever came first: the chat store outlives the provider and would otherwise keep a session whose
   * history never loaded. Only reads are asked again.
   */
  async #read<T>(call: (chats: ProjectLibraryChatPorts) => Promise<T>): Promise<T> {
    /* The binding and the release count, read in one step: a provider replaces its binding only around a release. */
    await this.#bound.promise;
    const binding = this.#binding!;
    const releases = this.#releases;
    try {
      return await call(binding.chats);
    } catch (error) {
      /* No release while it ran: the read's own failure, whatever re-render rebound the same ports meanwhile. */
      if (!this.#released && this.#releases === releases) {
        throw error;
      }
      /* Released (and replaced or resumed, in any order): ask the binding that serves reads next. */
      const { chats } = await this.#current();
      return call(chats);
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
