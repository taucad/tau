/**
 * The library's project commands (app state orchestration charter D9; plan § 4 A4a; inventory L4, L7).
 *
 * Create, duplicate, delete, restore, adopt, repair and rename, and what they need to run: the creation storage, the
 * import staging, the manifest read, the create-project named lock and the delete quiescence check. They moved out of
 * `ProjectManagerProvider` unchanged, except that they read the root file manager's facade from the library's binding
 * (D15 ruling, A2) instead of the provider's render, and the quiescence check asks the registry and the chat store the
 * runtime built the library with instead of the components' hooks (row L7). `useProjectManager()` keeps its shape: its
 * commands are wrappers over these.
 */
import type { PartialDeep } from 'type-fest';
import deepmerge from 'deepmerge';
import type { Remote } from 'comlink';
import { projectIdSchema, projectToManifest, readProjectManifestBytes, serializeProjectManifest } from '@taucad/types';
import type { Project, ProjectManifest, ProjectManifestReadResult } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import type { KernelProvider } from '@taucad/runtime';
import type { ProjectDiscoveryResult, ProjectLocator, StorageRootConfig } from '@taucad/filesystem';
import type { CadAgentExecution, Chat } from '@taucad/chat';
import { uint8ArrayToBase64 } from 'uint8array-extras';
import { generatePrefixedId } from '@taucad/utils/id';
import { serializeStartRecord, startRecordPath } from '@taucad/revisions';
import type { StartOrigin } from '@taucad/revisions';
import { attachmentKind } from '@taucad/chat-ui/utils/attachment.utils';
import type { StoredAttachmentRef } from '@taucad/chat-ui/utils/attachment.utils';
import { WorkspaceDirectoryRequiredError } from '@taucad/ui-core/filesystem/workspace-errors';
import { encodeTextFile } from '@taucad/ui-core/utils/filesystem.utils';
import { defaultProjectName } from '@taucad/ui-core/constants/project-names';
import type { ProjectCreationLocation } from '@taucad/ui-core/types/project-creation-location.types';
import type { ObjectStoreWorker, InitialEditorState } from '#hooks/object-store.worker.js';
import {
  deleteProjectFileSystemConfig,
  getAllProjectFileSystemConfigs,
  getHomeStorageBackend,
  getProjectCreationLocation,
  getProjectFileSystemConfig,
  getWorkspaceMetadata,
  isNodeWorkspace,
  isNodeWorkspaceConnected,
  setProjectCreationLocation,
} from '#filesystem/handle-store.js';
import { isOrphanedProjectRoute } from '#filesystem/orphaned-project-route.js';
import { directoryPicker } from '#constants/browser.constants.js';
import { createEntrylessProject, createInitialProject } from '#constants/project.constants.js';
import { buildUserMessage } from '#utils/chat.utils.js';
import {
  getEmptyCode,
  getKernelDependencies,
  getKernelOption,
  getKernelProjectTemplate,
  getMainFile,
} from '#utils/kernel.utils.js';
import { directorySlug, homeWorkspaceSlug } from '#utils/project-url.utils.js';
import type { ProjectSlugs } from '#utils/project-url.utils.js';
import { tauCloudIntent } from '#lib/tau-cloud-intent.js';
import { withNamedLock } from '#lib/named-lock.js';
import { selectCaughtUp } from '#machines/chat-projection.logic.js';
import type { ChatSessionStore } from '#services/chat-session-store.js';
import type { ChatStorage } from '#types/storage.types.js';
import type { PendingProjectOperation, PendingProjectStorage } from '#types/pending-project-operation.types.js';
import {
  allocateProjectBasePath,
  composerAttachmentsOf,
  locatorToPendingStorage,
  pendingStorageToScope,
  persistentStorageRootKey,
  projectOccurrences,
  rememberChatPlacement,
  resolveWorkspaceForWrite,
  routeBindsLocator,
  writeProjectLibraryFile,
} from '#runtime/project-library-storage.js';
import type { PersistentStorageRoot, ProjectLibraryFileManager } from '#runtime/project-library-storage.js';

/** A draft attachment an initial message carries, already stored in its source directory. @public */
export type InitialMessageAttachment = Omit<StoredAttachmentRef, 'byteLength'>;

/**
 * Shared options for initial chat configuration.
 *
 * Note: the initial-message metadata block intentionally only carries
 * `status: pending`. Per-request configuration (kernel / model / mode /
 * toolChoice / testingEnabled / snapshot / contextPayload) is composed at
 * request time. Homepage-created chats opt into the one-shot hydration run
 * with `Chat.startupRequest`; plain pending messages are display state only.
 */
type CreateProjectChatOptions = {
  /** If provided, add to chat and seed a one-shot startup request. */
  initialMessage?: {
    content: string;
    /**
     * Draft attachments already stored in `attachmentSource`. Resume copies
     * them into the new chat before its startup request is written.
     */
    attachments?: readonly InitialMessageAttachment[];
    /** The composer directory holding those bytes. Defaults to the Home composer's. */
    attachmentSource?: string;
  };
  /** Chat name (defaults to 'Initial design' with message, 'Initial chat' without) */
  chatName?: string;
  /** Initial editor state overrides (e.g., panelState for initial panel layout) */
  editorState?: InitialEditorState;
  /** Explicit product location. Omission resolves the last successful location. */
  location?: ProjectCreationLocation;
  /**
   * Create under an id that already exists elsewhere (W18 DEF-2).
   *
   * A device opening a project from Tau Cloud that it has never held must reuse
   * the remote's id, because the id *is* the repository path there. Omitted
   * everywhere else: a new project mints its own, and an id this device already
   * holds is refused rather than duplicated.
   */
  id?: string;
  /**
   * Create the project and no chat at all (W18 DEF-2, review R5).
   *
   * Opening someone's own project from Tau Cloud must not invent a chat for
   * them: `.tau/chats` is unversioned, so the open pull cannot take one away,
   * and chats travel on their own record refs — an empty *Initial chat* minted
   * here would be offered back to the account on the next push. Mutually
   * exclusive with `initialMessage` and `chatName`, which are what a chat is
   * *for*; every other caller leaves it out and gets the chat it always got.
   */
  chat?: false;
  /**
   * Seed `Chat.activeExecution` so the chat owns its execution choice independent
   * of the cookie default. Required when `initialMessage` is supplied so the
   * one-shot startup request runs with the caller's intended model rather
   * than whatever the cookie happens to hold at hydration time.
   */
  activeExecution?: CadAgentExecution;
  /**
   * Seed `Chat.activeKernel`. Defaults to the project's `kernel` field when
   * the project is created from a kernel template, otherwise undefined.
   */
  activeKernel?: KernelProvider;
};

/**
 * Create a new empty project from a kernel template.
 * Use this when starting a fresh project from scratch.
 */
type CreateProjectFromKernel = CreateProjectChatOptions & {
  /**
   * The kernel/language to use for the new project, or `auto` (automatic kernel selection blueprint D3): a project
   * with a name and a manifest and no model file, whose first chat starts on Auto; the first model the agent writes
   * and evaluates becomes main.
   */
  kernel: KernelProvider | 'auto';
  /** Override default project name */
  projectName?: string;
};

/**
 * Create a project from existing project data and files.
 * Use this when cloning, remixing, or importing a project.
 */
type CreateProjectFromData = CreateProjectChatOptions & {
  /** Wait for the remote manifest before choosing the first view. */
  deferInitialView?: boolean;
  /** The project metadata to use */
  project: Omit<ProjectManifest, '$schema'>;
  /** The files for the project */
  files: Record<string, { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' }>;
  /**
   * Where the files came from, for the project's Start version (A6): History
   * reads "imported from GitHub", "a folder" or "a zip". Absent, the project
   * reads "project created" (a fork, a remix, a template).
   */
  origin?: Exclude<StartOrigin, 'created'>;
  /**
   * An import already staged on the creation location's storage root (W7,
   * charter D12): its files move into the project at commit, so the journal
   * holds this locator instead of their bytes. `files` then holds only what
   * the create adds. Pass the `location` the staging was prepared for.
   */
  staging?: Readonly<{
    operationId: string;
    /** The import carries its own workbench layout, so none is seeded beside it. */
    carriesWorkbenchLayout?: boolean;
    /**
     * The `tau.json` bytes to commit, when they declare `project` exactly: a
     * linked repository's own, kept as authored so no setup revision rewrites
     * them. Bytes that declare anything else are not committed.
     */
    manifestBytes?: Uint8Array<ArrayBuffer>;
    /**
     * The project directory the entries were written straight into (where
     * the root's rename copies): the create commits there instead of
     * allocating another.
     */
    providerBasePath?: string;
  }>;
};

/**
 * Where an import stages before its project is created (W7): the location,
 * its storage root, the project directory a create there would take, and the
 * stagings the journal already owns on this device, which a sweep keeps.
 *
 * @public
 */
export type ImportStagingTarget = Readonly<{
  location: ProjectCreationLocation;
  scope: StorageRootConfig;
  providerBasePath: string;
  owned: readonly string[];
}>;

/**
 * Options for creating a project with an associated chat.
 * Either create from a kernel template (new project) or from existing data (clone/remix).
 *
 * @public
 */
export type CreateProjectOptions = CreateProjectFromKernel | CreateProjectFromData;

/**
 * A freshly minted project plus the slugs of the location it was allocated at.
 * Creation flows navigate straight to `projectUrl(result.slugs)` — the legacy
 * id-addressed URL is gone (blueprint L1/L2).
 *
 * @public
 */
export type CreatedProject = Project & { readonly slugs: ProjectSlugs };

/** A routed project's manifest: strict, or degraded with the issue that write-protects it (blueprint R3/R4). */
type ManifestRead = Extract<ProjectManifestReadResult, { success: true }>;

/**
 * The project-name profile a create from an initial message asks for a name (the caller's `useProjectNameClient`).
 *
 * @public
 */
export type ProjectNaming = Readonly<{
  generate: (input: Readonly<{ projectId: string; text: string; imageUrls?: readonly string[] }>) => Promise<string>;
}>;

/**
 * The registry, as the delete quiescence check and the session close read it (row L7): its live sessions, and the
 * `close` a person's delete sends. The runtime's sessions registry satisfies it.
 *
 * @public
 */
export type ProjectLibrarySessions = Readonly<{
  getSnapshot: () => Readonly<{ context: Readonly<{ refs: Readonly<Record<string, unknown>> }> }>;
  subscribe: (
    listener: (snapshot: Readonly<{ context: Readonly<{ refs: Readonly<Record<string, unknown>> }> }>) => void,
  ) => {
    unsubscribe: () => void;
  };
  send: (event: Readonly<{ type: 'close'; projectId: string; reason: 'user' }>) => void;
}>;

/**
 * What the commands read of the chat store (A12's created-empty note; row L7's quiescence check).
 *
 * @public
 */
export type ProjectLibraryChatSessions = Pick<
  ChatSessionStore,
  'noteCreatedEmpty' | 'observedChatIdsOf' | 'getProjection' | 'getProjectClosePlan'
>;

/** What the commands take from the library: its binding, worker, discovery, journal and listing. */
export type ProjectCommandsHost = Readonly<{
  facade: () => Promise<ProjectLibraryFileManager>;
  chatStore: () => ChatStorage | undefined;
  readChats: <Value>(
    operation: (source: ChatStorage) => Promise<Value>,
    projectId: string | undefined,
    options: Readonly<{ retry: boolean }>,
  ) => Promise<Value>;
  readiedWorker: () => Promise<Remote<ObjectStoreWorker>>;
  whenDiscoveryReady: () => Promise<void>;
  whenReplaysDrained: () => Promise<void>;
  discover: () => Promise<ProjectDiscoveryResult>;
  beginMutation: (
    projectId: string,
    options: Readonly<{ gated: boolean }>,
  ) => Promise<
    Readonly<{
      journaled: (operation: PendingProjectOperation) => void;
      apply: (operation: PendingProjectOperation, worker: Remote<ObjectStoreWorker>) => Promise<void>;
      abandon: () => void;
    }>
  >;
  replayForPerson: (operation: PendingProjectOperation) => Promise<boolean>;
  invalidateProjectListing: () => Promise<unknown>;
  invalidateListing: () => void;
  noteLibraryChanged: () => void;
  sessions: () => ProjectLibrarySessions | undefined;
  chatSessions: () => ProjectLibraryChatSessions | undefined;
  /** One project's own queries changed (D9: the library writes the cache, A4b). */
  invalidateProject: (projectId: string) => void;
  /** A project is gone for good: its own queries are dropped. */
  forgetProject: (projectId: string) => void;
}>;

/** The operation field naming where a created chat's attachments are copied from, when not Home. */
const attachmentSourceOf = (options: CreateProjectChatOptions): { attachmentSource?: string } => {
  const source = options.initialMessage?.attachmentSource;
  return source === undefined ? {} : { attachmentSource: source };
};

/** Whether the registry holds a live session for the project. */
const selectProjectLive = (snapshot: ReturnType<ProjectLibrarySessions['getSnapshot']>, projectId: string): boolean =>
  snapshot.context.refs[projectId] !== undefined;

/**
 * Where a new project is created: the explicit location, or the last
 * successful one, and the storage root it names. The workspace is resolved
 * here, so a create can carry the canonical URL its caller navigates to
 * instead of riding an id-addressed redirect.
 */
const resolveCreationStorage = async (
  explicitLocation: ProjectCreationLocation | undefined,
): Promise<{ location: ProjectCreationLocation; storageRoot: PersistentStorageRoot; workspaceSlug: string }> => {
  let location = explicitLocation;
  if (!location) {
    const { location: preferredLocation } = await getProjectCreationLocation({
      webAccessSupported: directoryPicker().available,
    });
    location = preferredLocation;
  }
  if (location.kind === 'workspace') {
    const picked = await getWorkspaceMetadata(location.workspaceId);
    if (picked && isNodeWorkspace(picked)) {
      if (!(await isNodeWorkspaceConnected(picked))) {
        throw new WorkspaceDirectoryRequiredError('disconnected', { workspaceId: picked.workspaceId });
      }
      return { location, storageRoot: { backend: 'node', path: picked.path }, workspaceSlug: picked.slug };
    }
    const entry = await resolveWorkspaceForWrite(location.workspaceId);
    return {
      location,
      storageRoot: { backend: 'webaccess', workspaceId: entry.workspace.workspaceId },
      workspaceSlug: entry.workspace.slug,
    };
  }
  return { location, storageRoot: { backend: await getHomeStorageBackend() }, workspaceSlug: homeWorkspaceSlug };
};

/**
 * The library's project commands. `ProjectLibrary` builds one over itself; every member is a bound arrow function,
 * so a caller may hold it.
 *
 * @public
 */
export class ProjectCommands {
  readonly #host: ProjectCommandsHost;

  public constructor(host: ProjectCommandsHost) {
    this.#host = host;
  }

  /**
   * Create a project. A supplied id is checked and then written, so two creations of it — an *Open* racing
   * materialize on sign-in, or two tabs — hold one lock per id across the check and the write; the second sees the
   * first's project and is refused. A minted id cannot collide, so it takes no lock.
   *
   * An earlier creation of the id that never finished — a reload, a re-init or a tab closed between its directory
   * commit and its route config (R2) — is finished here rather than repeated: this page's own recovery first, then any
   * journal row another tab left since. Its directory is quarantined from the library meanwhile, so a caller asking
   * again cannot tell it is there.
   *
   * @param options - What to create.
   * @param naming - The project-name profile, asked when an initial message comes without a name.
   * @returns The created project and its slugs.
   */
  public readonly createProject = async (
    options: CreateProjectOptions,
    naming?: ProjectNaming,
  ): Promise<CreatedProject> => {
    const { id } = options;
    if (id === undefined) {
      return this.#createProjectOnce(options, naming);
    }
    return withNamedLock(`tau:create-project:${id}`, async () => {
      await this.#host.whenDiscoveryReady();
      await this.#host.whenReplaysDrained();
      const worker = await this.#host.readiedWorker();
      const operations = await worker.getPendingProjectOperations();
      const unfinished = operations.find(
        (operation) => operation.kind !== 'permanent-delete' && operation.projectId === id,
      );
      if (unfinished !== undefined) {
        if (await this.#host.replayForPerson(unfinished)) {
          throw new Error(`An earlier creation of this project has not finished on this device: ${id}`);
        }
      } else if (!operations.some((operation) => operation.kind === 'permanent-delete' && operation.projectId === id)) {
        await this.#releaseOrphanedProjectRoute(id, worker);
      }
      return this.#createProjectOnce(options, naming);
    });
  };

  /**
   * Resolve where a new project named `name` would be created, so an import can stage on that storage root first
   * (W7). Resolved the way a create resolves it, so the staging lands on the storage root the commit moves it from.
   *
   * @param name - The project's name.
   * @param requested - The explicit location, if any.
   * @returns The staging target.
   */
  public readonly prepareImportStaging = async (
    name: string,
    requested?: ProjectCreationLocation,
  ): Promise<ImportStagingTarget> => {
    const { location, storageRoot } = await resolveCreationStorage(requested);
    const fileManager = await this.#host.facade();
    const [providerBasePath, owned] = await Promise.all([
      allocateProjectBasePath(fileManager.client, storageRoot, name),
      this.#importStagingOwners(),
    ]);
    return {
      location,
      scope: await pendingStorageToScope({ ...storageRoot, providerBasePath: '' }),
      providerBasePath,
      owned,
    };
  };

  /**
   * Whether a journal row owns an import staging, so a failed create must leave it for its recovery (W7).
   *
   * @param operationId - The staging's operation.
   * @returns Whether the journal owns it.
   */
  public readonly ownsImportStaging = async (operationId: string): Promise<boolean> => {
    const owners = await this.#importStagingOwners();
    return owners.includes(operationId);
  };

  /**
   * The routed project's manifest: strict, or degraded with the issue that write-protects it (blueprint R3/R4).
   * Identity comes from the established route binding.
   *
   * @param projectId - The project.
   * @returns The read, or `undefined` when there is no readable manifest.
   */
  public readonly readProjectManifest = async (projectId: string): Promise<ManifestRead | undefined> => {
    await this.#host.whenDiscoveryReady();
    const fileManager = await this.#host.facade();
    const read = async (): Promise<ManifestRead | undefined> => {
      try {
        const result = readProjectManifestBytes(
          await fileManager.recordFiles.readFile(`/projects/${projectId}/tau.json`),
        );
        return result.success ? result : undefined;
      } catch {
        return undefined;
      }
    };
    const current = await read();
    if (current) {
      return current;
    }
    await this.#host.whenReplaysDrained();
    await this.#host.discover();
    return read();
  };

  /**
   * The project's manifest with its id.
   *
   * @param projectId - The project.
   * @returns The project, or `undefined`.
   */
  public readonly getProject = async (projectId: string): Promise<Project | undefined> => {
    const read = await this.readProjectManifest(projectId);
    return read === undefined ? undefined : { ...read.data, id: projectId };
  };

  /**
   * Merge an update into `tau.json`. Rejects while it is degraded: the normalized view is lossy (blueprint R4).
   *
   * @param projectId - The project.
   * @param update - The fields to merge.
   * @returns The updated project, or `undefined` when there is no manifest.
   */
  public readonly updateProject = async (
    projectId: string,
    update: PartialDeep<ProjectManifest>,
  ): Promise<Project | undefined> => {
    const project = await this.readProjectManifest(projectId);
    if (!project) {
      return undefined;
    }
    // A degraded view is lossy (dropped keys, clamped text), so writing it
    // back would erase what a person or a newer build wrote (blueprint R4).
    if (project.issue) {
      throw new Error('tau.json needs repair before Tau can change it. Repair it, or fix it in the editor.');
    }
    const updated = deepmerge(project.data, update) as ProjectManifest;
    const fileManager = await this.#host.facade();
    await fileManager.recordFiles.writeFile(
      `/projects/${projectId}/tau.json`,
      serializeProjectManifest(projectToManifest(updated)),
    );
    this.#projectChanged(projectId);
    return { ...updated, id: projectId };
  };

  /**
   * Rewrite a degraded `tau.json` as its normalized strict manifest; refuses a JSON syntax error.
   *
   * @param projectId - The project.
   * @returns The project, or `undefined` when there is no manifest.
   */
  public readonly repairProject = async (projectId: string): Promise<Project | undefined> => {
    const project = await this.readProjectManifest(projectId);
    if (!project?.issue) {
      return project === undefined ? undefined : { ...project.data, id: projectId };
    }
    // Defaults would erase text a person can still fix by hand.
    if (project.issue.code === 'manifest-invalid-json') {
      throw new Error('tau.json is not valid JSON. Fix it in the editor; Repair would discard its text.');
    }
    const fileManager = await this.#host.facade();
    await fileManager.recordFiles.writeFile(`/projects/${projectId}/tau.json`, serializeProjectManifest(project.data));
    this.#host.invalidateListing();
    this.#host.invalidateProject(projectId);
    return { ...project.data, id: projectId };
  };

  /**
   * Copy a project under a fresh id, beside its source.
   *
   * @param projectId - The source project.
   * @returns The copy and its slugs.
   */
  public readonly duplicateProject = async (projectId: string): Promise<CreatedProject> => {
    await this.#host.whenDiscoveryReady();
    const worker = await this.#host.readiedWorker();
    const sourceProject = await this.getProject(projectId);
    if (!sourceProject) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const sourceConfig = await getProjectFileSystemConfig(projectId);
    if (!sourceConfig) {
      throw new Error(`Project locator not found: ${projectId}`);
    }
    if (sourceConfig.backend === 'memory') {
      throw new WorkspaceDirectoryRequiredError('unsupported');
    }
    const fileManager = await this.#host.facade();

    let storage: PendingProjectStorage;
    let workspaceSlug: string;
    const targetId = generatePrefixedId(idPrefix.project);
    const targetManifest = projectToManifest({
      ...sourceProject,
      name: `${sourceProject.name} (Copy)`,
    });
    const providerBasePath = await allocateProjectBasePath(fileManager.client, sourceConfig, targetManifest.name);
    if (sourceConfig.backend === 'webaccess') {
      const entry = await resolveWorkspaceForWrite(sourceConfig.workspaceId);
      storage = {
        backend: 'webaccess',
        workspaceId: entry.workspace.workspaceId,
        providerBasePath,
      };
      workspaceSlug = entry.workspace.slug;
    } else {
      storage = { backend: sourceConfig.backend, providerBasePath };
      workspaceSlug = homeWorkspaceSlug;
    }

    /* The source's own composed view supplies authored files and the
       registry-selected writable records. The fresh manifest is written by
       the commit, so the source's own `tau.json` is dropped. */
    const sourceFiles = Object.fromEntries(
      Object.entries(await fileManager.readDuplicateProjectFiles(`/projects/${projectId}`))
        .filter(([path]) => path !== 'tau.json')
        .map(([path, content]) => [path, { content }]),
    );
    const chatStore = this.#host.chatStore();
    if (chatStore === undefined) {
      throw new Error('The project library has no chat store before its binding');
    }
    const sourceChats = await chatStore.getChatsForResource(projectId);
    /* A copy journals a row for its fresh id, which no row can hold (rule 4). */
    const mutation = await this.#host.beginMutation(targetId, { gated: false });
    const operation = await worker
      .prepareProjectDuplicate({
        sourceProjectId: projectId,
        targetProjectId: targetId,
        targetManifest,
        files: sourceFiles,
        storage,
        sourceChats,
      })
      .catch((error: unknown) => {
        mutation.abandon();
        throw error;
      });
    mutation.journaled(operation);
    await mutation.apply(operation, worker);
    /* D19: a copy has no remote of its own, so it backs up by default too. */
    tauCloudIntent.set(targetId, 'default');
    void this.#host.invalidateProjectListing();
    return {
      ...operation.manifest,
      id: operation.projectId,
      slugs: { workspaceSlug, projectSlug: directorySlug(providerBasePath) },
    };
  };

  /**
   * Move a project to the Trash.
   *
   * @param projectId - The project.
   * @returns Whether a library row was actually trashed — a vanished row is not a success (DF3).
   */
  public readonly trashProject = async (projectId: string): Promise<boolean> => {
    await this.#host.whenDiscoveryReady();
    const worker = await this.#host.readiedWorker();
    const trashed = await worker.trashProject(projectId);
    if (trashed?.deletedAt === undefined) {
      this.#projectChanged(projectId);
      return false;
    }
    const fileManager = await this.#host.facade();
    await writeProjectLibraryFile(fileManager.recordFiles, projectId, { deletedAt: trashed.deletedAt });
    this.#host.noteLibraryChanged();
    this.#projectChanged(projectId);
    return true;
  };

  /**
   * Bring a project back from the Trash.
   *
   * @param projectId - The project.
   * @returns Whether a library row was restored.
   */
  public readonly restoreProject = async (projectId: string): Promise<boolean> => {
    await this.#host.whenDiscoveryReady();
    const worker = await this.#host.readiedWorker();
    const restored = await worker.restoreProject(projectId);
    if (!restored) {
      this.#projectChanged(projectId);
      return false;
    }
    const fileManager = await this.#host.facade();
    await writeProjectLibraryFile(fileManager.recordFiles, projectId, {});
    this.#host.noteLibraryChanged();
    this.#projectChanged(projectId);
    return true;
  };

  /**
   * Delete a project and its directory for good, through a journaled operation.
   *
   * @param projectId - The project.
   */
  public readonly permanentlyDeleteProject = async (projectId: string): Promise<void> => {
    await this.#host.whenDiscoveryReady();
    const worker = await this.#host.readiedWorker();
    /* Rule 4: a row this tab replays for the project settles first, so the locator is read after it. */
    const mutation = await this.#host.beginMutation(projectId, { gated: true });
    let operation: PendingProjectOperation | undefined;
    try {
      const storage = await this.#discoverPermanentDeleteStorage(projectId);
      const operationId = await worker.beginPermanentDeleteProject(projectId, storage);
      const pendingOperations = await worker.getPendingProjectOperations();
      operation = pendingOperations.find((candidate) => candidate.operationId === operationId);
      if (!operation) {
        throw new Error(`Pending project operation not found: ${operationId}`);
      }
    } catch (error) {
      mutation.abandon();
      throw error;
    }
    mutation.journaled(operation);
    await mutation.apply(operation, worker);
    this.#host.noteLibraryChanged();
    void this.#host.invalidateProjectListing();
    this.#host.forgetProject(projectId);
  };

  /**
   * Give an `adoption-required` directory an identity so it becomes a real project (R11): the id its route last bound
   * when no other directory claims it, otherwise a fresh one.
   *
   * @param locator - The directory.
   * @returns The adopted project.
   */
  public readonly adoptProject = async (locator: ProjectLocator): Promise<Project> => {
    await this.#host.whenDiscoveryReady();
    // The route that last bound this directory keys its chats, library row and
    // editor state: restore that id unless another directory now claims it (R6).
    const [configs, discovery] = await Promise.all([getAllProjectFileSystemConfigs(), this.#host.discover()]);
    const remembered = configs.find((config) => routeBindsLocator(config, locator))?.projectId;
    const claimed = discovery.entries.some((entry) => 'projectId' in entry && entry.projectId === remembered);
    const fileManager = await this.#host.facade();
    const manifest = await fileManager.client.adoptProjectDirectory(
      locator,
      remembered === undefined || claimed ? undefined : { id: remembered },
    );
    // The next discovery pass reconciles the route config from the manifest
    // now on disk, so nothing else has to be written here.
    this.#host.invalidateListing();
    return { ...manifest.manifest, id: manifest.projectId };
  };

  /**
   * Refuse a delete while the project is not quiescent (row L7): a stored chat whose history no live session has
   * caught up on, or running work. A project with stored chats must be open, so its chats can be verified.
   *
   * @param projectId - The project.
   */
  public readonly verifyProjectQuiescent = async (projectId: string): Promise<void> => {
    const sessions = this.#sessions();
    const chatSessions = this.#chatSessions();
    const chats = await this.#host.readChats(
      async (source) => source.getChatsForResource(projectId, { includeDeleted: true }),
      projectId,
      /* The person's read is not asked again when its records are replaced, as the hook's own read was not. */
      { retry: false },
    );
    if (chats.length > 0) {
      if (!selectProjectLive(sessions.getSnapshot(), projectId)) {
        throw new Error('Restore and open this project to verify its chats before deleting it.');
      }
      const observed = new Set(chatSessions.observedChatIdsOf(projectId));
      if (
        chats.some((chat: Chat) => {
          const projection = chatSessions.getProjection(chat.id);
          return !observed.has(chat.id) || projection === undefined || !selectCaughtUp(projection);
        })
      ) {
        throw new Error('Wait for every chat history to load before deleting this project.');
      }
    }
    const plan = await chatSessions.getProjectClosePlan(projectId);
    if (plan.liveChatIds.length > 0) {
      throw new Error('This project has running work. Stop it and wait for the chat log to settle before deleting.');
    }
  };

  /**
   * Close the project's live session, for a person's delete or directory change: resolves once the registry has
   * dropped it, at once when it holds none.
   *
   * @param projectId - The project.
   */
  public readonly closeProjectSession = async (projectId: string): Promise<void> => {
    const sessions = this.#sessions();
    if (!selectProjectLive(sessions.getSnapshot(), projectId)) {
      return;
    }
    await new Promise<void>((resolve) => {
      const subscription = sessions.subscribe((snapshot) => {
        if (!selectProjectLive(snapshot, projectId)) {
          subscription.unsubscribe();
          resolve();
        }
      });
      sessions.send({ type: 'close', projectId, reason: 'user' });
    });
  };

  #sessions(): ProjectLibrarySessions {
    const sessions = this.#host.sessions();
    if (sessions === undefined) {
      throw new Error('The project library was built without the sessions registry');
    }
    return sessions;
  }

  #chatSessions(): ProjectLibraryChatSessions {
    const chatSessions = this.#host.chatSessions();
    if (chatSessions === undefined) {
      throw new Error('The project library was built without the chat store');
    }
    return chatSessions;
  }

  /** The listing and the project's own queries are read again (D9: only the library writes them). */
  #projectChanged(projectId: string): void {
    void this.#host.invalidateProjectListing();
    this.#host.invalidateProject(projectId);
  }

  async #importStagingOwners(): Promise<string[]> {
    const worker = await this.#host.readiedWorker();
    const operations = await worker.getPendingProjectOperations();
    return operations.flatMap((operation) =>
      operation.kind === 'create' && operation.staging !== undefined ? [operation.staging.operationId] : [],
    );
  }

  /**
   * Images for the naming profile, which needs bytes over HTTP. Documents are
   * not sent to it (blueprint §Legacy arms).
   */
  async #namingImageUrls(message: NonNullable<CreateProjectChatOptions['initialMessage']>): Promise<string[]> {
    const fileManager = await this.#host.facade();
    const source = composerAttachmentsOf(fileManager.recordFiles, message.attachmentSource);
    const urls = await Promise.all(
      (message.attachments ?? [])
        .filter((attachment) => attachmentKind(attachment.mediaType) === 'image')
        .map(async (attachment) => {
          const bytes = await source.read(attachment);
          return bytes && `data:${attachment.mediaType};base64,${uint8ArrayToBase64(bytes)}`;
        }),
    );
    return urls.filter((url) => url !== undefined);
  }

  async #discoverPermanentDeleteStorage(projectId: string): Promise<PendingProjectStorage> {
    const configured = await getProjectFileSystemConfig(projectId);
    if (configured === undefined || configured.backend === 'memory') {
      throw new Error(`Project locator unavailable: ${projectId}`);
    }
    const fileManager = await this.#host.facade();
    const discovery = await fileManager.client.listProjectManifests();
    const configuredRoot = persistentStorageRootKey(configured);
    const configuredRootStatus = discovery.roots.find((root) => persistentStorageRootKey(root.root) === configuredRoot);
    if (configuredRootStatus?.status !== 'complete' || discovery.roots.some((root) => root.status === 'inaccessible')) {
      throw new Error(`Project storage is not completely observable: ${projectId}`);
    }
    const occurrences = projectOccurrences(discovery, projectId);
    if (occurrences.length !== 1 || occurrences[0]?.status !== 'valid') {
      throw new Error(`Project must have exactly one current occurrence: ${projectId}`);
    }
    return locatorToPendingStorage(occurrences[0].locator);
  }

  /**
   * Release the rows a cleared browser left behind for a project id (R14).
   *
   * The route config, editor layout and library state are keyed by the id and
   * survive the browser deleting every file, so re-importing the same project
   * met "already on this device" with nothing in the library to open. Only a
   * Home route whose folder is proven to hold no file is released; its rows go
   * the way the discovery sweep removes an orphan's, and the import proceeds.
   * Folders on disk, unreadable folders and folders with any file left keep
   * the refusal.
   */
  async #releaseOrphanedProjectRoute(projectId: string, worker: Remote<ObjectStoreWorker>): Promise<void> {
    const config = await getProjectFileSystemConfig(projectId);
    const fileManager = await this.#host.facade();
    if (config === undefined || !(await isOrphanedProjectRoute(config, fileManager.scopedStorage))) {
      return;
    }
    /* A discovered identity naming the project elsewhere is not an orphan:
     * releasing its route would let this import create a second copy. */
    const { entries } = await this.#host.discover();
    if (entries.some((entry) => 'projectId' in entry && entry.projectId === projectId)) {
      return;
    }
    await worker.deleteProjectResources(projectId);
    await deleteProjectFileSystemConfig(projectId);
    await fileManager.workspace.syncProjectRoots();
  }

  /** The manifest, files and kernel a create starts from: a kernel template, or the caller's own data. */
  async #projectSource(
    options: CreateProjectOptions,
    projectId: string,
    naming: ProjectNaming | undefined,
  ): Promise<
    Readonly<{
      projectData: Omit<ProjectManifest, '$schema'>;
      files: Record<string, { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' }>;
      kernel: KernelProvider | undefined;
    }>
  > {
    // Determine project data and files based on pattern
    let projectData: Omit<ProjectManifest, '$schema'>;
    let files: Record<string, { content: Uint8Array<ArrayBuffer>; mode?: '100644' | '100755' }>;
    let kernel: KernelProvider | undefined;

    if ('kernel' in options) {
      // CreateProjectFromKernel: Generate from kernel template
      const { projectName: requestedProjectName } = options;
      let projectName = requestedProjectName;
      if (!projectName && options.initialMessage) {
        const generated =
          naming === undefined
            ? ''
            : await naming
                .generate({
                  projectId,
                  text: options.initialMessage.content,
                  imageUrls: await this.#namingImageUrls(options.initialMessage),
                })
                /* Naming is a courtesy from the API, not a prerequisite: with the
                 * API unreachable (a daemon-served page, desktop offline) the
                 * project is still created, under the same default an empty
                 * suggestion gets. */
                .catch((): string => '');
        projectName = generated.trim() || defaultProjectName;
      }
      if (options.kernel === 'auto') {
        projectData = createEntrylessProject(projectName ?? defaultProjectName);
        files = {};
      } else {
        kernel = options.kernel;
        const mainFileName = getMainFile(options.kernel);
        const emptyCode = getEmptyCode(options.kernel);
        const result = createInitialProject({
          projectName: projectName ?? defaultProjectName,
          mainFileName,
          emptyCodeContent: encodeTextFile(emptyCode),
          ecosystem: getKernelOption(options.kernel).ecosystem,
          dependencies: await getKernelDependencies(options.kernel),
          template: await getKernelProjectTemplate(options.kernel),
        });
        projectData = result.projectData;
        files = result.files;
      }
    } else {
      // CreateProjectFromData: Use provided project data and files
      projectData = options.project;
      files = options.files;
    }
    return { projectData, files, kernel };
  }

  async #createProjectOnce(options: CreateProjectOptions, naming: ProjectNaming | undefined): Promise<CreatedProject> {
    /* The id is a directory here and a repository name on the Tau Hosted
       Remote, so a supplied one is checked against the same rule a minted one
       satisfies — before anything is readied, allocated or written (W18 DEF-2). */
    if (options.id !== undefined && !projectIdSchema.safeParse(options.id).success) {
      throw new Error(`Not a project id: ${options.id}`);
    }
    /* One id is one local project (review R4). The *From Tau Cloud* row is
       offered from a cached listing against an asynchronous discovery pass, so
       the same row can be clicked twice — and two directories under one id is
       a `duplicate-id` conflict neither of them recovers from. The route
       config is the durable record of what this device holds. */
    if (options.id !== undefined && (await getProjectFileSystemConfig(options.id)) !== undefined) {
      throw new Error(`That project is already on this device: ${options.id}`);
    }
    const worker = await this.#host.readiedWorker();

    const { location, storageRoot, workspaceSlug } = await resolveCreationStorage(options.location);

    const projectId = options.id ?? generatePrefixedId(idPrefix.project);

    const source = await this.#projectSource(options, projectId, naming);
    const { projectData, kernel } = source;
    let { files } = source;

    /* A6: a project born here, with no remote of its own, asks its first open to mint the Start version, V1. A
       caller that supplies the id brings history of its own (a Tau Cloud open, a linked GitHub import). */
    if (options.id === undefined) {
      files = {
        ...files,
        [startRecordPath]: {
          content: serializeStartRecord('kernel' in options ? 'created' : (options.origin ?? 'created')),
        },
      };
    }

    const manifest = projectToManifest(projectData);
    const fileManager = await this.#host.facade();
    /* An import written straight into its project directory commits there; anything else allocates now. */
    const stagedBasePath = 'staging' in options ? options.staging?.providerBasePath : undefined;
    const providerBasePath =
      stagedBasePath ?? (await allocateProjectBasePath(fileManager.client, storageRoot, manifest.name));
    const pendingStorage: PendingProjectStorage = { ...storageRoot, providerBasePath };

    // The initial homepage prompt remains a normal pending user message
    // for display purposes. The permission to run it automatically after
    // route hydration is separate one-shot command state on the chat row.
    const initialUserMessage = options.initialMessage
      ? buildUserMessage({
          text: options.initialMessage.content,
          attachments: options.initialMessage.attachments,
        })
      : undefined;
    const chatMessages = initialUserMessage ? [initialUserMessage] : [];
    const startupRequest: Chat['startupRequest'] | undefined = initialUserMessage
      ? {
          id: generatePrefixedId(idPrefix.request),
          kind: 'regenerate-tail',
          messageId: initialUserMessage.id,
          message: initialUserMessage,
          source: 'homepage-initial-message',
          createdAt: Date.now(),
        }
      : undefined;

    const chatName = options.chatName ?? (options.initialMessage ? 'Initial design' : 'Initial chat');

    // Seed the chat row with chat-scoped active model + kernel so a
    // cookie change in another tab does not mutate the active selection
    // for this freshly-created chat. Defaults to the kernel chosen by
    // the creation flow when not explicitly supplied. The chat store keeps
    // only the portable execution; a device-relative placement is kept for
    // this device below (XD2).
    const seededActiveExecution = options.activeExecution;
    const seededActiveKernel = options.activeKernel ?? kernel;

    /* Rule 4: a supplied id waits while this tab replays a row of it; a minted one cannot be held by any row. */
    const mutation = await this.#host.beginMutation(projectId, { gated: options.id !== undefined });
    // Single atomic call to create project + chat + Editor state
    const operation = await worker
      .prepareProjectCreation({
        manifest,
        projectId,
        ...(options.chat === false
          ? {}
          : {
              chat: {
                name: chatName,
                messages: chatMessages,
                activeExecution: seededActiveExecution,
                activeKernel: seededActiveKernel,
                /* A project created under Auto seeds its first chat with `auto` (blueprint D2). */
                ...('kernel' in options && options.kernel === 'auto' ? { kernelPreference: 'auto' } : {}),
                ...(startupRequest ? { startupRequest } : {}),
              },
              ...attachmentSourceOf(options),
            }),
        editorState: options.editorState,
        deferInitialView: 'project' in options && options.deferInitialView,
        files,
        ...('staging' in options && options.staging !== undefined
          ? {
              staging: { operationId: options.staging.operationId },
              seedWorkbench: options.staging.carriesWorkbenchLayout !== true,
              ...(options.staging.manifestBytes === undefined ? {} : { manifestBytes: options.staging.manifestBytes }),
            }
          : {}),
        storage: pendingStorage,
      })
      .catch((error: unknown) => {
        mutation.abandon();
        throw error;
      });
    mutation.journaled(operation);
    await mutation.apply(operation, worker);
    if (operation.chat !== undefined) {
      await rememberChatPlacement(fileManager.recordFiles, {
        projectId: operation.projectId,
        chatId: operation.chat.id,
        execution: seededActiveExecution,
      });
      if (chatMessages.length === 0) {
        // Created empty here: its lane shows the empty state at once, not after its log answers (A12, I21).
        this.#host.chatSessions()?.noteCreatedEmpty(operation.chat.id);
      }
    }
    /* D19: a project born with no remote backs up to Tau Cloud from its first
       revision — a template, a fork, a file or zip import. A caller that
       supplies the id is adopting an identity that has a remote of its own (a
       Tau Cloud open, a materialized project, a linked GitHub import), so it
       is left alone. The session decides once it knows the account (W11). */
    if (options.id === undefined) {
      tauCloudIntent.set(projectId, 'default');
    }
    /* Route callers navigate with the returned slugs immediately. Publish
     * the completed filesystem commit to every active project-list query
     * before that navigation can ask the sole slug resolver for its id. */
    /* The row's settle moved the epoch and started the pass after the commit; this refetch joins it. */
    await this.#host.invalidateProjectListing();
    try {
      await setProjectCreationLocation(location);
    } catch (error) {
      console.warn('[ProjectManager] failed to persist project creation location', error);
    }

    return {
      ...operation.manifest,
      id: operation.projectId,
      slugs: { workspaceSlug, projectSlug: directorySlug(providerBasePath) },
    };
  }
}
