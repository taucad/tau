import { assign, assertEvent, setup, fromPromise, emit, enqueueActions } from 'xstate';
import type { ActorRefFrom, OutputFrom, DoneActorEvent } from 'xstate';
import type { Message } from '@ai-sdk/react';
import type { Build, Chat } from '@taucad/types';
import { idPrefix, languageFromKernel } from '@taucad/types/constants';
import { storage } from '#db/storage.js';
import { generatePrefixedId } from '#utils/id.utils.js';
import { isBrowser } from '#constants/browser.constants.js';
import { filesystemMachine } from '#machines/filesystem.machine.js';
import { gitMachine } from '#machines/git.machine.js';
import { fileExplorerMachine } from '#machines/file-explorer.machine.js';
import { cadMachine } from '#machines/cad.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { screenshotCapabilityMachine } from '#machines/screenshot-capability.machine.js';
import { cameraCapabilityMachine } from '#machines/camera-capability.machine.js';
import { assertActorDoneEvent } from '#lib/xstate.js';

/**
 * Build Machine Context
 */
export type BuildContext = {
  buildId: string;
  build: Build | undefined;
  error: Error | undefined;
  isLoading: boolean;
  enableFilePreview: boolean;
  shouldLoadModelOnStart: boolean;
  filesystemRef: ActorRefFrom<typeof filesystemMachine>;
  gitRef: ActorRefFrom<typeof gitMachine>;
  fileExplorerRef: ActorRefFrom<typeof fileExplorerMachine>;
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  cadRef: ActorRefFrom<typeof cadMachine>;
  screenshotRef: ActorRefFrom<typeof screenshotCapabilityMachine>;
  cameraRef: ActorRefFrom<typeof cameraCapabilityMachine>;
};

/**
 * Build Machine Input
 */
type BuildInput = {
  buildId: string;
  shouldLoadModelOnStart?: boolean;
};

// Define the actors that the machine can invoke
const loadBuildActor = fromPromise<Build, { buildId: string }>(async ({ input }) => {
  const build = await storage.getBuild(input.buildId);
  if (!build) {
    throw new Error(`Build not found: ${input.buildId}`);
  }

  return build;
});

const createBuildActor = fromPromise<Build, { build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'> }>(
  async ({ input }) => {
    return storage.createBuild(input.build);
  },
);

const updateBuildActor = fromPromise<
  Build,
  { buildId: string; updates: Partial<Build>; options?: { ignoreKeys?: string[]; noUpdatedAt?: boolean } }
>(async ({ input }) => {
  const updated = await storage.updateBuild(input.buildId, input.updates, input.options ?? {});
  if (!updated) {
    throw new Error(`Build not found: ${input.buildId}`);
  }

  return updated;
});

const deleteBuildActor = fromPromise<string, { buildId: string }>(async ({ input }) => {
  await storage.deleteBuild(input.buildId);
  return input.buildId;
});

const duplicateBuildActor = fromPromise<Build, { buildId: string }>(async ({ input }) => {
  const sourceBuild = await storage.getBuild(input.buildId);
  if (!sourceBuild) {
    throw new Error(`Build not found: ${input.buildId}`);
  }

  const newBuild = await storage.createBuild({
    name: `${sourceBuild.name} (Copy)`,
    description: sourceBuild.description,
    thumbnail: sourceBuild.thumbnail,
    stars: 0,
    forks: 0,
    author: sourceBuild.author,
    tags: sourceBuild.tags,
    assets: sourceBuild.assets,
    chats: sourceBuild.chats,
    lastChatId: sourceBuild.lastChatId,
  });

  return newBuild;
});

const addChatActor = fromPromise<Chat, { buildId: string; initialMessages?: Message[] }>(async ({ input }) => {
  const build = await storage.getBuild(input.buildId);
  if (!build) {
    throw new Error(`Build not found: ${input.buildId}`);
  }

  const chatId = generatePrefixedId(idPrefix.chat);
  const timestamp = Date.now();
  const newChat: Chat = {
    id: chatId,
    name: 'New Chat',
    messages: input.initialMessages ?? [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const updatedChats = [...build.chats, newChat];
  await storage.updateBuild(
    input.buildId,
    {
      chats: updatedChats,
      lastChatId: chatId,
    },
    { ignoreKeys: ['chats', 'lastChatId'] },
  );

  return newChat;
});

const updateChatMessagesActor = fromPromise<string, { buildId: string; chatId: string; messages: Message[] }>(
  async ({ input }) => {
    const build = await storage.getBuild(input.buildId);
    if (!build) {
      throw new Error(`Build not found: ${input.buildId}`);
    }

    const updatedChats = build.chats.map((chat) =>
      chat.id === input.chatId ? { ...chat, messages: input.messages, updatedAt: Date.now() } : chat,
    );

    await storage.updateBuild(input.buildId, { chats: updatedChats }, { ignoreKeys: ['chats'] });
    return input.chatId;
  },
);

const updateChatNameActor = fromPromise<
  { chatId: string; name: string },
  { buildId: string; chatId: string; name: string }
>(async ({ input }) => {
  const build = await storage.getBuild(input.buildId);
  if (!build) {
    throw new Error(`Build not found: ${input.buildId}`);
  }

  const updatedChats = build.chats.map((chat) =>
    chat.id === input.chatId ? { ...chat, name: input.name, updatedAt: Date.now() } : chat,
  );

  await storage.updateBuild(input.buildId, { chats: updatedChats }, { ignoreKeys: ['chats'] });
  return { chatId: input.chatId, name: input.name };
});

const setActiveChatActor = fromPromise<string, { buildId: string; chatId: string }>(async ({ input }) => {
  await storage.updateBuild(input.buildId, { lastChatId: input.chatId }, {});
  return input.chatId;
});

const deleteChatActor = fromPromise<string, { buildId: string; chatId: string }>(async ({ input }) => {
  const build = await storage.getBuild(input.buildId);
  if (!build) {
    throw new Error(`Build not found: ${input.buildId}`);
  }

  const updatedChats = build.chats.filter((chat) => chat.id !== input.chatId);
  const newLastChatId = build.lastChatId === input.chatId ? updatedChats.at(-1)?.id : build.lastChatId;

  await storage.updateBuild(
    input.buildId,
    {
      chats: updatedChats,
      lastChatId: newLastChatId,
    },
    { ignoreKeys: ['chats', 'lastChatId'] },
  );

  return input.chatId;
});

const updateCodeParametersActor = fromPromise<
  { files: Record<string, { content: string }>; parameters: Record<string, unknown> },
  {
    buildId: string;
    files: Record<string, { content: string }>;
    parameters: Record<string, unknown>;
  }
>(async ({ input }) => {
  const build = await storage.getBuild(input.buildId);
  if (!build) {
    throw new Error(`Build not found: ${input.buildId}`);
  }

  // Update the mechanical asset with new files and parameters
  const updatedAssets = {
    ...build.assets,
    mechanical: {
      ...build.assets.mechanical,
      files: input.files,
      parameters: input.parameters,
    },
  };

  await storage.updateBuild(input.buildId, { assets: updatedAssets }, { ignoreKeys: ['parameters'] });
  return { files: input.files, parameters: input.parameters };
});

const buildActors = {
  loadBuildActor,
  createBuildActor,
  updateBuildActor,
  deleteBuildActor,
  duplicateBuildActor,
  addChatActor,
  updateChatMessagesActor,
  updateChatNameActor,
  setActiveChatActor,
  deleteChatActor,
  updateCodeParametersActor,
  filesystem: filesystemMachine,
  git: gitMachine,
  fileExplorer: fileExplorerMachine,
  graphics: graphicsMachine,
  cad: cadMachine,
  screenshot: screenshotCapabilityMachine,
  camera: cameraCapabilityMachine,
} as const;

type BuildActorNames = keyof typeof buildActors;

/**
 * Build Machine Events
 */
type BuildEventInternal =
  | { type: 'loadBuild'; buildId: string }
  | { type: 'createBuild'; build: Omit<Build, 'id' | 'createdAt' | 'updatedAt'> }
  | {
      type: 'updateBuild';
      buildId: string;
      updates: Partial<Build>;
      options?: { ignoreKeys?: string[]; noUpdatedAt?: boolean };
    }
  | { type: 'deleteBuild'; buildId: string }
  | { type: 'duplicateBuild'; buildId: string }
  | { type: 'addChat'; buildId: string; initialMessages?: Message[] }
  | { type: 'updateChatMessages'; buildId: string; chatId: string; messages: Message[] }
  | { type: 'updateChatName'; buildId: string; chatId: string; name: string }
  | { type: 'setActiveChat'; buildId: string; chatId: string }
  | { type: 'deleteChat'; buildId: string; chatId: string }
  | {
      type: 'updateCodeParameters';
      buildId: string;
      files: Record<string, { content: string }>;
      parameters: Record<string, unknown>;
    }
  | { type: 'setEnableFilePreview'; enabled: boolean }
  | { type: 'loadModel' };

export type BuildEventExternal = OutputFrom<(typeof buildActors)[BuildActorNames]>;
type BuildEventExternalDone = DoneActorEvent<BuildEventExternal, BuildActorNames>;

type BuildEvent = BuildEventExternalDone | BuildEventInternal;

/**
 * Build Machine Emitted Events
 */
type BuildEmitted =
  | { type: 'buildLoaded'; build: Build }
  | { type: 'buildCreated'; build: Build }
  | { type: 'buildUpdated'; build: Build }
  | { type: 'buildDeleted'; buildId: string }
  | { type: 'buildDuplicated'; build: Build }
  | { type: 'chatAdded'; chat: Chat }
  | { type: 'chatMessagesUpdated'; chatId: string }
  | { type: 'chatNameUpdated'; chatId: string; name: string }
  | { type: 'activeChatSet'; chatId: string }
  | { type: 'chatDeleted'; chatId: string }
  | { type: 'codeParametersUpdated'; files: Record<string, { content: string }>; parameters: Record<string, unknown> }
  | { type: 'error'; error: Error };

/**
 * Build Machine
 *
 * Manages build lifecycle, storage operations, and filesystem coordination.
 *
 * States:
 * - idle: No build loaded
 * - loading: Loading build from storage
 * - ready: Build loaded and ready
 * - updating: Updating build metadata
 * - creating: Creating a new build
 * - deleting: Deleting a build
 * - error: An error occurred
 */
export const buildMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as BuildContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as BuildEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as BuildEmitted,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as BuildInput,
  },
  actors: buildActors,
  actions: {
    setError: assign({
      error({ event }) {
        if ('error' in event && event.error instanceof Error) {
          return event.error;
        }

        return new Error('Unknown error');
      },
      isLoading: false,
    }),
    clearError: assign({
      error: undefined,
    }),
    setLoading: assign({
      isLoading: true,
    }),
    clearLoading: assign({
      isLoading: false,
    }),
    updateBuildId: assign({
      buildId({ event }) {
        assertEvent(event, 'loadBuild');
        return event.buildId;
      },
    }),
    setBuild: assign({
      build({ event }) {
        assertActorDoneEvent(event);
        return event.output as Build;
      },
      isLoading: false,
    }),
    clearBuild: assign({
      build: undefined,
    }),
    stopStatefulActors: enqueueActions(({ enqueue, context }) => {
      // Stop the old stateful actors (they'll be garbage collected)
      enqueue.stopChild(context.filesystemRef);
      enqueue.stopChild(context.gitRef);
      enqueue.stopChild(context.fileExplorerRef);
    }),
    respawnStatefulActors: assign({
      filesystemRef({ context, spawn }) {
        return spawn('filesystem', {
          id: `filesystem-${context.buildId}`,
          input: { buildId: context.buildId },
        });
      },
      gitRef({ context, spawn }) {
        return spawn('git', {
          id: `git-${context.buildId}`,
          input: { buildId: context.buildId },
        });
      },
      fileExplorerRef({ context, spawn }) {
        return spawn('fileExplorer', {
          id: `file-explorer-${context.buildId}`,
        });
      },
    }),
    sendFilesToFilesystem: enqueueActions(({ enqueue, context }) => {
      if (context.build?.assets.mechanical) {
        enqueue.sendTo(context.filesystemRef, {
          type: 'setFiles',
          buildId: context.buildId,
          files: context.build.assets.mechanical.files,
        });
      }
    }),
    updateBuildInContext: assign({
      build({ event }) {
        assertActorDoneEvent(event);
        return event.output as Build;
      },
    }),
    initializeKernelIfNeeded: enqueueActions(({ enqueue, context }) => {
      // Only initialize if shouldLoadModelOnStart is true
      if (!context.shouldLoadModelOnStart) {
        return;
      }

      const mechanicalAsset = context.build?.assets.mechanical;
      if (!mechanicalAsset) {
        return;
      }

      // Initialize kernel first
      enqueue.sendTo(context.cadRef, { type: 'initializeKernel' });

      // Then initialize the model with current build data
      enqueue.sendTo(context.cadRef, {
        type: 'initializeModel',
        code: mechanicalAsset.files[mechanicalAsset.main]!.content,
        parameters: mechanicalAsset.parameters,
        kernelType: mechanicalAsset.language,
      });
    }),
    loadModel: enqueueActions(({ enqueue, context }) => {
      const mechanicalAsset = context.build?.assets.mechanical;
      if (!mechanicalAsset) {
        return;
      }

      // Initialize kernel first
      enqueue.sendTo(context.cadRef, { type: 'initializeKernel' });

      // Then initialize the model with current build data
      enqueue.sendTo(context.cadRef, {
        type: 'initializeModel',
        code: mechanicalAsset.files[mechanicalAsset.main]!.content,
        parameters: mechanicalAsset.parameters,
        kernelType: mechanicalAsset.language,
      });
    }),
      // Subscribe to file explorer active file changes
      context.fileExplorerRef.subscribe((state) => {
        const { activeFileId, openFiles } = state.context;
        if (!activeFileId) {
          return;
        }

        const activeFile = openFiles.find((file) => file.id === activeFileId);
        if (!activeFile) {
          return;
        }

        // Only send to CAD if file preview is enabled
        if (!context.enableFilePreview) {
          return;
        }

        // Get current CAD code to avoid unnecessary updates
        const currentCode = context.cadRef.getSnapshot().context.code;
        if (activeFile.content !== currentCode) {
          enqueue.sendTo(context.cadRef, {
            type: 'setCode',
            code: activeFile.content,
          });
        }
      });
    }),
    setEnableFilePreview: assign({
      enableFilePreview({ event }) {
        assertEvent(event, 'setEnableFilePreview');
        return event.enabled;
      },
    }),
    subscribeToCadUpdates: enqueueActions(({ context, self }) => {
      // Subscribe to CAD's modelUpdated emissions
      context.cadRef.on('modelUpdated', ({ code, parameters }) => {
        const mainFile = context.build?.assets.mechanical?.main;
        if (!mainFile) {
          return;
        }

        // Send update event to self to trigger storage update
        self.send({
          type: 'updateCodeParameters',
          buildId: context.buildId,
          files: { [mainFile]: { content: code } },
          parameters,
        });
      });
    }),
    initializeFileExplorer: enqueueActions(({ enqueue, context }) => {
      const mechanicalAsset = context.build?.assets.mechanical;
      if (!mechanicalAsset) {
        // Clear tree if no mechanical assets
        enqueue.sendTo(context.fileExplorerRef, {
          type: 'setFileTree',
          tree: [],
          openFiles: [],
        });
        return;
      }

      // Convert build files to file tree format
      const fileItems = Object.entries(mechanicalAsset.files).map(([filename, file]) => ({
        id: filename,
        name: filename,
        path: filename,
        content: file.content,
        language: languageFromKernel[mechanicalAsset.language],
        isDirectory: false,
      }));

      const openFiles = mechanicalAsset.main ? [mechanicalAsset.main] : [];

      enqueue.sendTo(context.fileExplorerRef, {
        type: 'setFileTree',
        tree: fileItems,
        openFiles,
      });
    }),
    subscribeToCadFileExplorerSync: enqueueActions(({ context }) => {
      // Subscribe to CAD actor state changes and update file explorer
      context.cadRef.subscribe((state) => {
        const mainFile = context.build?.assets.mechanical?.main;
        if (!mainFile) {
          return;
        }

        // Update the main file content in file explorer when CAD code changes
        context.fileExplorerRef.send({
          type: 'updateFileContent',
          fileId: mainFile,
          content: state.context.code,
        });
      });
    }),
    subscribeToFilesystemChanges: enqueueActions(({ context }) => {
      // Helper to rebuild file tree from filesystem state
      const rebuildFileTree = () => {
        const mechanicalAsset = context.build?.assets.mechanical;
        if (!mechanicalAsset) {
          return;
        }

        // Get files directly from filesystem context
        const { files } = context.filesystemRef.getSnapshot().context;

        // Convert filesystem files to file tree format
        const fileItems = [...files.entries()].map(([path, fileItem]) => ({
          id: path,
          name: path.split('/').pop() ?? path,
          path,
          content: fileItem.content,
          language: languageFromKernel[mechanicalAsset.language],
          isDirectory: false,
        }));

        // Determine which files should be open
        const currentOpenFiles = context.fileExplorerRef.getSnapshot().context.openFiles;
        const openFilePaths = currentOpenFiles.map((f) => f.path);

        // Update file explorer with new tree
        context.fileExplorerRef.send({
          type: 'setFileTree',
          tree: fileItems,
          openFiles: openFilePaths.length > 0 ? openFilePaths : [mechanicalAsset.main].filter(Boolean),
        });
      };

      // Subscribe to filesystem events and rebuild tree
      context.filesystemRef.on('fileCreated', ({ path }) => {
        // Rebuild tree from filesystem state
        rebuildFileTree();

        // Auto-open the newly created file
        context.fileExplorerRef.send({
          type: 'openFile',
          path,
        });
      });

      context.filesystemRef.on('fileUpdated', () => {
        // Rebuild tree in case of metadata changes
        rebuildFileTree();
      });

      context.filesystemRef.on('fileDeleted', () => {
        // Rebuild tree when files are deleted
        rebuildFileTree();
      });

      // Also listen to statusRefreshed to update git status indicators
      context.filesystemRef.on('statusRefreshed', () => {
        // Update git statuses in file explorer
        const { dirtyFiles } = context.filesystemRef.getSnapshot().context;

        context.fileExplorerRef.send({
          type: 'updateDirtyFiles',
          dirtyFiles,
        });
      });
    }),
  },
  guards: {
    isNotBrowser() {
      return !isBrowser;
    },
    shouldAutoLoad() {
      return isBrowser;
    },
    isBuildIdChanging({ context, event }) {
      assertEvent(event, 'loadBuild');
      return context.buildId !== event.buildId;
    },
  },
}).createMachine({
  id: 'build',
  context({ input, spawn }) {
    const { buildId, shouldLoadModelOnStart = true } = input;

    const filesystemRef = spawn('filesystem', {
      id: `filesystem-${buildId}`,
      input: { buildId },
    });

    const gitRef = spawn('git', {
      id: `git-${buildId}`,
      input: { buildId },
    });

    const fileExplorerRef = spawn('fileExplorer', {
      id: `file-explorer-${buildId}`,
    });

    const graphicsRef = spawn('graphics', {
      id: `graphics-${buildId}`,
      input: {
        defaultCameraFovAngle: 60,
        measureSnapDistance: 40,
      },
    });

    const cadRef = spawn('cad', {
      id: `cad-${buildId}`,
      input: {
        shouldInitializeKernelOnStart: false,
        graphicsRef,
      },
    });

    const screenshotRef = spawn('screenshot', {
      id: `screenshot-${buildId}`,
      input: { graphicsRef },
    });

    const cameraRef = spawn('camera', {
      id: `camera-${buildId}`,
      input: { graphicsRef },
    });

    return {
      buildId,
      build: undefined,
      error: undefined,
      isLoading: true,
      enableFilePreview: true, // Default to enabled
      shouldLoadModelOnStart,
      filesystemRef,
      gitRef,
      fileExplorerRef,
      graphicsRef,
      cadRef,
      screenshotRef,
      cameraRef,
    };
  },
  initial: 'checkEnvironment',
  states: {
    checkEnvironment: {
      always: [
        {
          guard: 'isNotBrowser',
          target: 'ssr',
        },
        {
          guard: 'shouldAutoLoad',
          target: 'loading',
        },
        {
          target: 'idle',
        },
      ],
    },
    ssr: {
      type: 'final',
    },
    idle: {
      on: {
        loadBuild: {
          target: 'loading',
          actions: ['updateBuildId', 'setLoading'],
        },
        createBuild: {
          target: 'creating',
          actions: 'setLoading',
        },
      },
    },
    loading: {
      entry: 'clearError',
      invoke: {
        src: 'loadBuildActor',
        input: ({ context }) => ({ buildId: context.buildId }),
        onDone: {
          target: 'ready',
          actions: [
            'setBuild',
            'clearLoading',
            'sendFilesToFilesystem',
            'initializeKernelIfNeeded',
            'initializeFileExplorer',
            'subscribeToFileExplorer',
            'subscribeToCadUpdates',
            'subscribeToCadFileExplorerSync',
            'subscribeToFilesystemChanges',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'buildLoaded' as const,
                build: event.output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    creating: {
      entry: 'clearError',
      invoke: {
        src: 'createBuildActor',
        input({ event }) {
          assertEvent(event, 'createBuild');
          return { build: event.build };
        },
        onDone: {
          target: 'ready',
          actions: [
            'setBuild',
            'clearLoading',
            'sendFilesToFilesystem',
            'initializeKernelIfNeeded',
            'initializeFileExplorer',
            'subscribeToFileExplorer',
            'subscribeToCadUpdates',
            'subscribeToCadFileExplorerSync',
            'subscribeToFilesystemChanges',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'buildCreated' as const,
                build: event.output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    ready: {
      on: {
        loadBuild: [
          {
            guard: 'isBuildIdChanging',
            target: 'loading',
            actions: ['updateBuildId', 'stopStatefulActors', 'respawnStatefulActors', 'setLoading'],
          },
          {
            target: 'loading',
            actions: 'setLoading',
          },
        ],
        updateBuild: 'updating',
        deleteBuild: 'deleting',
        duplicateBuild: 'duplicating',
        addChat: 'addingChat',
        updateChatMessages: 'updatingChatMessages',
        updateChatName: 'updatingChatName',
        setActiveChat: 'settingActiveChat',
        deleteChat: 'deletingChat',
        updateCodeParameters: 'updatingCodeParameters',
        setEnableFilePreview: {
          actions: 'setEnableFilePreview',
        },
        loadModel: {
          actions: 'loadModel',
        },
      },
    },
    updating: {
      entry: 'clearError',
      invoke: {
        src: 'updateBuildActor',
        input({ event }) {
          assertEvent(event, 'updateBuild');
          return { buildId: event.buildId, updates: event.updates, options: event.options };
        },
        onDone: {
          target: 'ready',
          actions: [
            'updateBuildInContext',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'buildUpdated' as const,
                build: event.output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    deleting: {
      entry: 'clearError',
      invoke: {
        src: 'deleteBuildActor',
        input({ event }) {
          assertEvent(event, 'deleteBuild');
          return { buildId: event.buildId };
        },
        onDone: {
          target: 'idle',
          actions: [
            'clearBuild',
            emit(({ event }) => {
              assertActorDoneEvent(event);
              return {
                type: 'buildDeleted' as const,
                buildId: event.output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    duplicating: {
      entry: 'clearError',
      invoke: {
        src: 'duplicateBuildActor',
        input({ event }) {
          assertEvent(event, 'duplicateBuild');
          return { buildId: event.buildId };
        },
        onDone: {
          target: 'idle',
          actions: emit(({ event }) => {
            assertActorDoneEvent(event);
            return {
              type: 'buildDuplicated' as const,
              build: event.output,
            };
          }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    addingChat: {
      entry: 'clearError',
      invoke: {
        src: 'addChatActor',
        input({ event }) {
          assertEvent(event, 'addChat');
          return { buildId: event.buildId, initialMessages: event.initialMessages };
        },
        onDone: {
          target: 'loading', // Reload build to get updated chats
          actions: emit(({ event }) => {
            assertActorDoneEvent(event);

            return {
              type: 'chatAdded' as const,
              chat: event.output,
            };
          }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    updatingChatMessages: {
      entry: 'clearError',
      invoke: {
        src: 'updateChatMessagesActor',
        input({ event }) {
          assertEvent(event, 'updateChatMessages');
          return { buildId: event.buildId, chatId: event.chatId, messages: event.messages };
        },
        onDone: {
          target: 'loading', // Reload build to get updated messages
          actions: emit(({ event }) => {
            assertActorDoneEvent(event);
            return {
              type: 'chatMessagesUpdated' as const,
              chatId: event.output,
            };
          }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    updatingChatName: {
      entry: 'clearError',
      invoke: {
        src: 'updateChatNameActor',
        input({ event }) {
          assertEvent(event, 'updateChatName');
          return { buildId: event.buildId, chatId: event.chatId, name: event.name };
        },
        onDone: {
          target: 'loading', // Reload build to get updated chat name
          actions: emit(({ event }) => {
            assertActorDoneEvent(event);
            return {
              type: 'chatNameUpdated' as const,
              ...event.output,
            };
          }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    settingActiveChat: {
      entry: 'clearError',
      invoke: {
        src: 'setActiveChatActor',
        input({ event }) {
          assertEvent(event, 'setActiveChat');
          return { buildId: event.buildId, chatId: event.chatId };
        },
        onDone: {
          target: 'loading', // Reload build to get updated active chat
          actions: emit(({ event }) => {
            assertActorDoneEvent(event);
            return {
              type: 'activeChatSet' as const,
              chatId: event.output,
            };
          }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    deletingChat: {
      entry: 'clearError',
      invoke: {
        src: 'deleteChatActor',
        input({ event }) {
          assertEvent(event, 'deleteChat');
          return { buildId: event.buildId, chatId: event.chatId };
        },
        onDone: {
          target: 'loading', // Reload build to get updated chats
          actions: emit(({ event }) => {
            assertActorDoneEvent(event);
            return {
              type: 'chatDeleted' as const,
              chatId: event.output,
            };
          }),
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    updatingCodeParameters: {
      entry: 'clearError',
      invoke: {
        src: 'updateCodeParametersActor',
        input({ event }) {
          assertEvent(event, 'updateCodeParameters');
          return { buildId: event.buildId, files: event.files, parameters: event.parameters };
        },
        onDone: {
          target: 'ready',
          actions: [
            enqueueActions(({ enqueue, context, event }) => {
              // Update filesystem with new files
              assertActorDoneEvent(event);
              const output = event.output as {
                files: Record<string, { content: string }>;
                parameters: Record<string, unknown>;
              };
              enqueue.sendTo(context.filesystemRef, {
                type: 'setFiles',
                buildId: context.buildId,
                files: output.files,
              });
            }),
            emit(({ event }) => {
              assertActorDoneEvent(event);
              const output = event.output as {
                files: Record<string, { content: string }>;
                parameters: Record<string, unknown>;
              };
              return {
                type: 'codeParametersUpdated' as const,
                ...output,
              };
            }),
          ],
        },
        onError: {
          target: 'error',
          actions: [
            'setError',
            emit(({ event }) => ({
              type: 'error' as const,
              error: event.error as Error,
            })),
          ],
        },
      },
    },
    error: {
      on: {
        loadBuild: [
          {
            guard: 'isBuildIdChanging',
            target: 'loading',
            actions: ['updateBuildId', 'stopStatefulActors', 'respawnStatefulActors', 'setLoading'],
          },
          {
            target: 'loading',
            actions: 'setLoading',
          },
        ],
        createBuild: {
          target: 'creating',
          actions: 'setLoading',
        },
      },
    },
  },
});
