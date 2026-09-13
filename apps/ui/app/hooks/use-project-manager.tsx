import type { ReactNode } from 'react';
import type { PartialDeep } from 'type-fest';
import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useActorRef, useSelector } from '@xstate/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Project, FileSystemBackend } from '@taucad/types';
import type { KernelProvider } from '@taucad/runtime';
import type { Chat } from '@taucad/chat';
import type { Remote } from 'comlink';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { projectManagerMachine } from '#hooks/project-manager.machine.js';
import type { ObjectStoreWorker, InitialEditorState } from '#hooks/object-store.worker.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import {
  setProjectFileSystemConfig,
  getProjectFileSystemConfig,
  getDefaultWorkspace,
  getWorkspace,
  checkHandlePermission,
} from '#filesystem/handle-store.js';
import { WorkspaceDirectoryRequiredError } from '#filesystem/workspace-errors.js';
import { isFileSystemAccessSupported } from '#constants/browser.constants.js';
import { createInitialProject } from '#constants/project.constants.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { createMessage } from '#utils/chat.utils.js';
import { getMainFile, getEmptyCode } from '#utils/kernel.utils.js';
import { encodeTextFile } from '#utils/filesystem.utils.js';
import { defaultProjectName } from '#constants/project-names.js';

/**
 * Shared options for initial chat configuration.
 *
 * Note: the initial-message metadata block intentionally only carries
 * `status: pending`. Per-request configuration (kernel / model / mode /
 * toolChoice / testingEnabled / snapshot / contextPayload) is composed by
 * the chat-client at regenerate time — the hydration-driven auto-regen on
 * pending-tail (see `chat-session-store#loadChatActor`) flows through the
 * persistence machine, and the resulting `agent` payload is supplied by
 * `useCadChatClient` from the chat row's `activeModel` / `activeKernel`
 * seeds (and the current cookie defaults).
 */
type CreateProjectChatOptions = {
  /** If provided, add to chat (triggers AI response via hydration auto-regen) */
  initialMessage?: {
    content: string;
    imageUrls?: string[];
  };
  /** Chat name (defaults to 'Initial design' with message, 'Initial chat' without) */
  chatName?: string;
  /** Initial editor state overrides (e.g., panelState for initial panel layout) */
  editorState?: InitialEditorState;
  /** Explicit backend override — takes precedence over the cookie default */
  backend?: FileSystemBackend;
  /**
   * Workspace to bind the project to when `backend === 'webaccess'`.
   * Required for explicit webaccess creation; when omitted the default
   * workspace is used. Throws `WorkspaceDirectoryRequiredError` when
   * webaccess is requested but no usable workspace can be resolved (no
   * more silent fallback to `indexeddb`).
   */
  workspaceId?: string;
  /**
   * Seed `Chat.activeModel` so the chat owns its model choice independent
   * of the cookie default. Required when `initialMessage` is supplied so the
   * pending-tail auto-regen runs with the caller's intended model rather
   * than whatever the cookie happens to hold at hydration time.
   */
  activeModel?: string;
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
  /** The kernel/language to use for the new project */
  kernel: KernelProvider;
  /** Override default project name */
  projectName?: string;
};

/**
 * Create a project from existing project data and files.
 * Use this when cloning, remixing, or importing a project.
 */
type CreateProjectFromData = CreateProjectChatOptions & {
  /** The project metadata to use */
  project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
  /** The files for the project */
  files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
};

/**
 * Options for creating a project with an associated chat.
 * Either create from a kernel template (new project) or from existing data (clone/remix).
 */
export type CreateProjectOptions = CreateProjectFromKernel | CreateProjectFromData;

type ProjectManagerContextType = {
  isLoading: boolean;
  error: Error | undefined;
  projectManagerRef: ActorRefFrom<typeof projectManagerMachine>;
  createProject: (options: CreateProjectOptions) => Promise<Project>;
  updateProject: (
    projectId: string,
    update: PartialDeep<Project>,
    options?: {
      noUpdatedAt?: boolean;
    },
  ) => Promise<Project | undefined>;
  touchProject: (projectId: string) => Promise<Project | undefined>;
  duplicateProject: (projectId: string) => Promise<Project>;
  getProjects: (options?: { includeDeleted?: boolean }) => Promise<Project[]>;
  getProject: (projectId: string) => Promise<Project | undefined>;
  deleteProject: (projectId: string) => Promise<void>;
  // Chat methods
  createChat: (
    resourceId: string,
    chat: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & {
      id?: string;
    },
  ) => Promise<Chat>;
  updateChat: (
    chatId: string,
    update: PartialDeep<Chat>,
    options?: {
      noUpdatedAt?: boolean;
    },
  ) => Promise<Chat | undefined>;
  patchChat: <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]) => Promise<Chat | undefined>;
  setMessageEdit: (
    chatId: string,
    messageId: string,
    draft: NonNullable<Chat['messageEdits']>[string],
  ) => Promise<Chat | undefined>;
  clearMessageEdit: (chatId: string, messageId: string) => Promise<Chat | undefined>;
  softDeleteChat: (chatId: string) => Promise<Chat | undefined>;
  duplicateChat: (chatId: string) => Promise<Chat>;
  getChatsForResource: (resourceId: string, options?: { includeDeleted?: boolean }) => Promise<Chat[]>;
  getChat: (chatId: string) => Promise<Chat | undefined>;
  deleteChat: (chatId: string) => Promise<void>;
};

const ProjectManagerContext = createContext<ProjectManagerContextType | undefined>(undefined);

export function ProjectManagerProvider({ children }: { readonly children: ReactNode }): React.JSX.Element {
  const actorRef = useActorRef(projectManagerMachine);
  const fileManager = useFileManager();
  const queryClient = useQueryClient();
  const [defaultBackend] = useCookie(cookieName.filesystemBackend, 'indexeddb' as FileSystemBackend);

  const invalidateProjectsList = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient]);

  // Select state from the machine
  const error = useSelector(actorRef, (state) => state.context.error);
  const isLoading = useSelector(actorRef, (state) => {
    return state.matches('initializing') || state.matches('creatingWorker');
  });

  useEffect(() => {
    // Initialize the machine on mount
    actorRef.send({ type: 'initialize' });
  }, [actorRef]);

  const getReadiedWorker = useCallback(async (): Promise<Remote<ObjectStoreWorker>> => {
    const snapshot = await waitFor(actorRef, (state) => state.matches('ready') || state.matches('error'));
    if (snapshot.matches('error')) {
      throw new Error('Projct manager worker failed to initialize');
    }

    if (!snapshot.context.wrappedWorker) {
      throw new Error('Projct manager worker not initialized');
    }

    return snapshot.context.wrappedWorker;
  }, [actorRef]);

  const createProject = useCallback(
    async (options: CreateProjectOptions): Promise<Project> => {
      const worker = await getReadiedWorker();

      // Determine project data and files based on pattern
      let projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>;
      let files: Record<string, { content: Uint8Array<ArrayBuffer> }>;
      let kernel: KernelProvider | undefined;

      if ('kernel' in options) {
        // CreateProjectFromKernel: Generate from kernel template
        kernel = options.kernel;
        const mainFileName = getMainFile(options.kernel);
        const emptyCode = getEmptyCode(options.kernel);
        const result = createInitialProject({
          projectName: options.projectName ?? defaultProjectName,
          mainFileName,
          emptyCodeContent: encodeTextFile(emptyCode),
        });
        projectData = result.projectData;
        files = result.files;
      } else {
        // CreateProjectFromData: Use provided project data and files
        projectData = options.project;
        files = options.files;
      }

      // Seed only the pending-status flag on the initial user message. The
      // per-request `agent` payload (kernel / model / mode / toolChoice /
      // testingEnabled / snapshot / contextPayload) is composed by the
      // chat-client at regenerate time — the hydration auto-regen on
      // pending-tail dispatches through `useCadChatClient.regenerateTail()`
      // which sources the agent from the chat row's seeded active values
      // plus the current cookie defaults.
      const chatMessages = options.initialMessage
        ? [
            createMessage({
              content: options.initialMessage.content,
              role: messageRole.user,
              metadata: {
                status: messageStatus.pending,
              },
              imageUrls: options.initialMessage.imageUrls,
            }),
          ]
        : [];

      const chatName = options.chatName ?? (options.initialMessage ? 'Initial design' : 'Initial chat');

      // Seed the chat row with chat-scoped active model + kernel so a
      // cookie change in another tab does not mutate the active selection
      // for this freshly-created chat. Defaults to the kernel chosen by
      // the creation flow when not explicitly supplied.
      const seededActiveModel = options.activeModel;
      const seededActiveKernel = options.activeKernel ?? kernel;

      // Single atomic call to create project + chat + Editor state
      const { project } = await worker.createProjectWithResources({
        project: projectData,
        chat: {
          name: chatName,
          messages: chatMessages,
          activeModel: seededActiveModel,
          activeKernel: seededActiveKernel,
        },
        editorState: options.editorState,
      });

      // Persist the per-project filesystem config. Webaccess projects bind
      // to a specific workspace at creation time so the FM machine resolves
      // the correct handle on every subsequent open (closes Finding 15:
      // workspace identity is immutable once a project is bound). Failures
      // now surface as `WorkspaceDirectoryRequiredError` instead of falling
      // back to `indexeddb` — callers route the structured code to a toast
      // / banner that walks the user through recovery (R3 / R2).
      const resolvedBackend: FileSystemBackend = options.backend ?? defaultBackend;

      // `memory` cannot persist project state across a tab reload —
      // creation must always commit to a durable backend. Reject upfront
      // with a structured `unsupported` code (Audit R9) so the UI can
      // surface a "memory backend not allowed for projects" toast
      // instead of writing files into a volatile mount.
      if (resolvedBackend === 'memory') {
        throw new WorkspaceDirectoryRequiredError('unsupported');
      }

      // Resolve the webaccess handle + workspaceId pair atomically with
      // the mount call below — Audit R3 / Finding 2 require the worker
      // to receive `(handle, workspaceId)` together, never via a
      // separate `setDirectoryHandle` round-trip.
      let webaccessEntry:
        | {
            readonly handle: FileSystemDirectoryHandle;
            readonly workspaceId: string;
          }
        | undefined;

      if (resolvedBackend === 'webaccess') {
        if (!isFileSystemAccessSupported) {
          throw new WorkspaceDirectoryRequiredError('unsupported');
        }
        const entry = options.workspaceId ? await getWorkspace(options.workspaceId) : await getDefaultWorkspace();
        if (!entry) {
          throw new WorkspaceDirectoryRequiredError('missing', {
            workspaceId: options.workspaceId,
          });
        }
        const permission = await checkHandlePermission(entry.handle);
        if (permission !== 'granted') {
          throw new WorkspaceDirectoryRequiredError('permission', {
            workspaceId: entry.workspace.workspaceId,
          });
        }
        webaccessEntry = {
          handle: entry.handle,
          workspaceId: entry.workspace.workspaceId,
        };
      }

      if (resolvedBackend === 'webaccess') {
        await setProjectFileSystemConfig({
          projectId: project.id,
          backend: 'webaccess',
          workspaceId: webaccessEntry!.workspaceId,
        });
      } else {
        await setProjectFileSystemConfig({
          projectId: project.id,
          backend: resolvedBackend,
        });
      }

      const projectPrefix = `/projects/${project.id}`;

      // Atomic mount → write → unmount transaction. The discriminated
      // `MountConfig` makes it impossible to mount webaccess without an
      // explicit handle + workspaceId pair (Audit R3 / Finding 1).
      if (resolvedBackend === 'webaccess') {
        await fileManager.workspace.mount(projectPrefix, {
          backend: 'webaccess',
          directoryHandle: webaccessEntry!.handle,
          workspaceId: webaccessEntry!.workspaceId,
          preservePath: true,
        });
      } else {
        await fileManager.workspace.mount(projectPrefix, {
          backend: resolvedBackend,
          preservePath: true,
        });
      }

      const projectFiles: Record<string, { content: Uint8Array<ArrayBuffer> }> = {};
      for (const [path, file] of Object.entries(files)) {
        projectFiles[`${projectPrefix}/${path}`] = file;
      }

      // Cross-workspace bootstrap: keys are filesystem-absolute paths under
      // `/projects/<id>` that the worker mount table routes to the freshly
      // mounted backend. The root FileManagerProvider is scoped to `/`, so
      // routing through its `FileContentService` would emit a `batchWritten`
      // event with foreign keys and trip `WorkspacePathEscapeError` in the
      // root FM's tree service. `client.writeFiles` is the documented escape
      // hatch for worker-namespace writes.
      try {
        await fileManager.client.writeFiles(projectFiles);
      } finally {
        fileManager.workspace.unmount(projectPrefix);
      }

      return project;
    },
    [getReadiedWorker, fileManager, defaultBackend],
  );

  const updateProject = useCallback(
    async (
      projectId: string,
      update: PartialDeep<Project>,
      options?: {
        noUpdatedAt?: boolean;
      },
    ): Promise<Project | undefined> => {
      const worker = await getReadiedWorker();
      return worker.updateProject(projectId, update, options);
    },
    [getReadiedWorker],
  );

  const touchProject = useCallback(
    async (projectId: string): Promise<Project | undefined> => {
      const worker = await getReadiedWorker();
      return worker.touchProject(projectId);
    },
    [getReadiedWorker],
  );

  const duplicateProject = useCallback(
    async (projectId: string): Promise<Project> => {
      const worker = await getReadiedWorker();

      // Source-project filesystem config drives the duplicate's backend
      // (Audit R8 / Finding 5). Without an existing config we cannot
      // honour the same-workspace contract, so fall through to whatever
      // the FM is configured with — which for non-webaccess is the
      // root indexeddb mount.
      const sourceConfig = await getProjectFileSystemConfig(projectId);
      const project = await worker.duplicateProject(projectId);
      const sourcePrefix = `/projects/${projectId}`;
      const destinationPrefix = `/projects/${project.id}`;

      if (sourceConfig?.backend === 'webaccess') {
        // Same-workspace, same-backend: bind the duplicate to the same
        // webaccess workspace and mount it explicitly. Cross-workspace
        // duplication is rejected with a structured `unsupported` code
        // — copying webaccess bytes into a different workspace is a
        // user-driven export, not a duplicate.
        const entry = await getWorkspace(sourceConfig.workspaceId);
        if (!entry) {
          throw new WorkspaceDirectoryRequiredError('missing', {
            workspaceId: sourceConfig.workspaceId,
          });
        }
        const permission = await checkHandlePermission(entry.handle);
        if (permission !== 'granted') {
          throw new WorkspaceDirectoryRequiredError('permission', {
            workspaceId: entry.workspace.workspaceId,
          });
        }

        await setProjectFileSystemConfig({
          projectId: project.id,
          backend: 'webaccess',
          workspaceId: entry.workspace.workspaceId,
        });

        // Mount the workspace's `/projects` parent once — both source
        // and destination resolve through the single provider with
        // `preservePath: true`, avoiding two separate webaccess mounts
        // for the same workspace handle.
        const workspaceProjectsPrefix = '/projects';
        await fileManager.workspace.mount(workspaceProjectsPrefix, {
          backend: 'webaccess',
          directoryHandle: entry.handle,
          workspaceId: entry.workspace.workspaceId,
          preservePath: true,
        });
        try {
          await fileManager.copyDirectory(sourcePrefix, destinationPrefix);
        } finally {
          fileManager.workspace.unmount(workspaceProjectsPrefix);
        }
        return project;
      }

      // Non-webaccess source: reuse the existing root mount via the
      // facade. `memory` is not a legal source for duplication because
      // memory-backed projects shouldn't exist post-creation hardening
      // (R9), but we surface a structured code rather than allow the
      // copy to silently succeed against a volatile mount.
      if (sourceConfig?.backend === 'memory') {
        throw new WorkspaceDirectoryRequiredError('unsupported');
      }

      // For indexeddb / opfs / legacy-no-config, the root mount already
      // covers `/projects/*` so a direct copyDirectory is the same-
      // backend operation requested by R8.
      if (sourceConfig) {
        await setProjectFileSystemConfig({
          projectId: project.id,
          backend: sourceConfig.backend,
        });
      }
      await fileManager.copyDirectory(sourcePrefix, destinationPrefix);
      return project;
    },
    [getReadiedWorker, fileManager],
  );
  // (getProjectFileSystemConfig / getWorkspace are stable module-level
  // bindings — intentionally omitted from the dep array.)

  const getProjects = useCallback(
    async (options?: { includeDeleted?: boolean }): Promise<Project[]> => {
      const worker = await getReadiedWorker();
      return worker.getProjects(options);
    },
    [getReadiedWorker],
  );

  const getProject = useCallback(
    async (projectId: string): Promise<Project | undefined> => {
      const worker = await getReadiedWorker();

      return worker.getProject(projectId);
    },
    [getReadiedWorker],
  );

  const deleteProject = useCallback(
    async (projectId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      await worker.deleteProject(projectId);
      // No file deletion - so that the project can be restored in it's entirety (the project is only soft-deleted)
    },
    [getReadiedWorker],
  );

  // ============================================================================
  // Chat Methods
  // ============================================================================

  const createChat = useCallback(
    async (
      resourceId: string,
      chatData: Omit<Chat, 'id' | 'resourceId' | 'createdAt' | 'updatedAt'> & {
        id?: string;
      },
    ): Promise<Chat> => {
      const worker = await getReadiedWorker();
      const chat = await worker.createChat(resourceId, chatData);
      invalidateProjectsList();
      return chat;
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const updateChat = useCallback(
    async (
      chatId: string,
      update: PartialDeep<Chat>,
      options?: {
        noUpdatedAt?: boolean;
      },
    ): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.updateChat(chatId, update, options);
      if (result) {
        invalidateProjectsList();
      }

      return result;
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const patchChat = useCallback(
    async <K extends keyof Chat>(chatId: string, key: K, value: Chat[K]): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.patchChat(chatId, key, value);
      if (result) {
        invalidateProjectsList();
      }

      return result;
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const setMessageEdit = useCallback(
    async (
      chatId: string,
      messageId: string,
      draft: NonNullable<Chat['messageEdits']>[string],
    ): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.setMessageEdit(chatId, messageId, draft);
      if (result) {
        invalidateProjectsList();
      }

      return result;
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const clearMessageEdit = useCallback(
    async (chatId: string, messageId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.clearMessageEdit(chatId, messageId);
      if (result) {
        invalidateProjectsList();
      }

      return result;
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const softDeleteChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      const result = await worker.softDeleteChat(chatId);
      if (result) {
        invalidateProjectsList();
      }

      return result;
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const duplicateChat = useCallback(
    async (chatId: string): Promise<Chat> => {
      const worker = await getReadiedWorker();
      const chat = await worker.duplicateChat(chatId);
      invalidateProjectsList();
      return chat;
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const getChatsForResource = useCallback(
    async (resourceId: string, options?: { includeDeleted?: boolean }): Promise<Chat[]> => {
      const worker = await getReadiedWorker();
      return worker.getChatsForResource(resourceId, options);
    },
    [getReadiedWorker],
  );

  const getChat = useCallback(
    async (chatId: string): Promise<Chat | undefined> => {
      const worker = await getReadiedWorker();
      return worker.getChat(chatId);
    },
    [getReadiedWorker],
  );

  const deleteChat = useCallback(
    async (chatId: string): Promise<void> => {
      const worker = await getReadiedWorker();
      await worker.deleteChat(chatId);
      invalidateProjectsList();
    },
    [getReadiedWorker, invalidateProjectsList],
  );

  const value = useMemo<ProjectManagerContextType>(() => {
    return {
      isLoading,
      error,
      projectManagerRef: actorRef,
      createProject,
      updateProject,
      touchProject,
      duplicateProject,
      getProjects,
      getProject,
      deleteProject,
      createChat,
      updateChat,
      patchChat,
      setMessageEdit,
      clearMessageEdit,
      softDeleteChat,
      duplicateChat,
      getChatsForResource,
      getChat,
      deleteChat,
    };
  }, [
    isLoading,
    error,
    actorRef,
    createProject,
    updateProject,
    touchProject,
    duplicateProject,
    getProjects,
    getProject,
    deleteProject,
    createChat,
    updateChat,
    patchChat,
    setMessageEdit,
    clearMessageEdit,
    softDeleteChat,
    duplicateChat,
    getChatsForResource,
    getChat,
    deleteChat,
  ]);

  return <ProjectManagerContext.Provider value={value}>{children}</ProjectManagerContext.Provider>;
}

export function useProjectManager(): ProjectManagerContextType {
  const context = useContext(ProjectManagerContext);

  if (context === undefined) {
    throw new Error('useProjectManager must be used within a ProjectManagerProvider');
  }

  return context;
}
