import { assign, assertEvent, setup, fromPromise, emit, enqueueActions } from 'xstate';
import type { ActorRefFrom, OutputFrom, DoneActorEvent } from 'xstate';
import { produce } from 'immer';
import type { Message } from '@ai-sdk/react';
import type { Build, Chat } from '@taucad/types';
import { idPrefix } from '@taucad/types/constants';
import { isBrowser } from '#constants/browser.constants.js';
import { storage } from '#db/storage.js';
import { assertActorDoneEvent } from '#lib/xstate.js';
import { cameraCapabilityMachine } from '#machines/camera-capability.machine.js';
import { cadMachine } from '#machines/cad.machine.js';
import { fileExplorerMachine } from '#machines/file-explorer.machine.js';
import { gitMachine } from '#machines/git.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { logMachine } from '#machines/logs.machine.js';
import { screenshotCapabilityMachine } from '#machines/screenshot-capability.machine.js';
import { generatePrefixedId } from '#utils/id.utils.js';
import { writeBuildToLightningFs } from '#lib/lightning-fs.lib.js';

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
  gitRef: ActorRefFrom<typeof gitMachine>;
  fileExplorerRef: ActorRefFrom<typeof fileExplorerMachine>;
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  cadRef: ActorRefFrom<typeof cadMachine>;
  screenshotRef: ActorRefFrom<typeof screenshotCapabilityMachine>;
  cameraRef: ActorRefFrom<typeof cameraCapabilityMachine>;
  logRef: ActorRefFrom<typeof logMachine>;
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

const writeBuildActor = fromPromise<Build, { build: Build }>(async ({ input }) => {
  const updated = await storage.updateBuild(input.build.id, input.build, { noUpdatedAt: false });
  if (!updated) {
    throw new Error(`Build not found: ${input.build.id}`);
  }

  return updated;
});

const writeFilesystemActor = fromPromise<void, { buildId: string; files: Record<string, { content: string }> }>(
  async ({ input }) => {
    await writeBuildToLightningFs(input.buildId, input.files);
  },
);

const buildActors = {
  loadBuildActor,
  writeBuildActor,
  writeFilesystemActor,
  git: gitMachine,
  fileExplorer: fileExplorerMachine,
  graphics: graphicsMachine,
  cad: cadMachine,
  screenshot: screenshotCapabilityMachine,
  camera: cameraCapabilityMachine,
  logs: logMachine,
} as const;

type BuildActorNames = keyof typeof buildActors;

/**
 * Build Machine Events
 */
type BuildEventInternal =
  | { type: 'loadBuild'; buildId: string }
  | { type: 'updateName'; name: string }
  | { type: 'updateDescription'; description: string }
  | { type: 'updateTags'; tags: string[] }
  | { type: 'updateThumbnail'; thumbnail: string }
  | { type: 'addChat'; initialMessages?: Message[] }
  | { type: 'updateChatMessages'; chatId: string; messages: Message[] }
  | { type: 'updateChatName'; chatId: string; name: string }
  | { type: 'setActiveChat'; chatId: string }
  | { type: 'deleteChat'; chatId: string }
  | {
      type: 'updateCodeParameters';
      files: Record<string, { content: string }>;
      parameters: Record<string, unknown>;
    }
  | { type: 'setEnableFilePreview'; enabled: boolean }
  | { type: 'loadModel' }
  | { type: 'createFile'; path: string; content: string }
  | { type: 'updateFile'; path: string; content: string }
  | { type: 'renameFile'; oldPath: string; newPath: string }
  | { type: 'deleteFile'; path: string }
  | { type: 'fileOpened'; path: string };

export type BuildEventExternal = OutputFrom<(typeof buildActors)[BuildActorNames]>;
type BuildEventExternalDone = DoneActorEvent<BuildEventExternal, BuildActorNames>;

type BuildEvent = BuildEventExternalDone | BuildEventInternal;

/**
 * Build Machine Emitted Events
 */
type BuildEmitted =
  | { type: 'buildLoaded'; build: Build }
  | { type: 'error'; error: Error }
  | { type: 'buildUpdated'; build: Build }
  | { type: 'fileCreated'; path: string; content: string }
  | { type: 'fileUpdated'; path: string; content: string }
  | { type: 'fileDeleted'; path: string };

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
        const build = event.output as Build;

        return build;
      },
      isLoading: false,
    }),
    clearBuild: assign({
      build: undefined,
    }),
    updateName: assign(({ context, event }) => {
      assertEvent(event, 'updateName');
      if (!context.build) {
        return {};
      }

      return produce(context, (draft) => {
        draft.build!.name = event.name;
        draft.build!.updatedAt = Date.now();
      });
    }),
    updateDescription: assign(({ context, event }) => {
      assertEvent(event, 'updateDescription');
      if (!context.build) {
        return {};
      }

      return produce(context, (draft) => {
        draft.build!.description = event.description;
        draft.build!.updatedAt = Date.now();
      });
    }),
    updateTags: assign(({ context, event }) => {
      assertEvent(event, 'updateTags');
      if (!context.build) {
        return {};
      }

      // Deduplicate tags to ensure uniqueness
      const uniqueTags = [...new Set(event.tags)];

      return produce(context, (draft) => {
        draft.build!.tags = uniqueTags;
        // Don't update updatedAt for tags - they're metadata
      });
    }),
    updateThumbnail: assign(({ context, event }) => {
      assertEvent(event, 'updateThumbnail');
      if (!context.build) {
        return {};
      }

      return produce(context, (draft) => {
        draft.build!.thumbnail = event.thumbnail;
        // Don't update updatedAt for thumbnails - they're metadata
      });
    }),
    addChatToContext: assign(({ context, event }) => {
      assertEvent(event, 'addChat');
      if (!context.build) {
        return {};
      }

      const chatId = generatePrefixedId(idPrefix.chat);
      const timestamp = Date.now();
      const newChat: Chat = {
        id: chatId,
        name: 'New Chat',
        messages: event.initialMessages ?? [],
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      return {
        ...context,
        build: {
          ...context.build,
          chats: [...context.build.chats, newChat],
          lastChatId: chatId,
          updatedAt: timestamp,
        },
      };
    }),
    updateChatMessagesInContext: assign(({ context, event }) => {
      assertEvent(event, 'updateChatMessages');
      if (!context.build) {
        return {};
      }

      const timestamp = Date.now();
      const chatIndex = context.build.chats.findIndex((c) => c.id === event.chatId);

      if (chatIndex === -1) {
        return {};
      }

      return produce(context, (draft) => {
        const originalChat = context.build!.chats[chatIndex]!;
        const updatedChat: Chat = {
          ...originalChat,
          messages: event.messages,
          updatedAt: timestamp,
        };

        // @ts-expect-error -- Immer types struggle with this.
        draft.build!.chats[chatIndex] = updatedChat;
        draft.build!.updatedAt = timestamp;
      });
    }),
    updateChatNameInContext: assign(({ context, event }) => {
      assertEvent(event, 'updateChatName');
      if (!context.build) {
        return {};
      }

      const timestamp = Date.now();

      return produce(context, (draft) => {
        draft.build!.chats = draft.build!.chats.map((chat) =>
          chat.id === event.chatId ? { ...chat, name: event.name, updatedAt: timestamp } : chat,
        );
        draft.build!.updatedAt = timestamp;
      });
    }),
    setActiveChatInContext: assign(({ context, event }) => {
      assertEvent(event, 'setActiveChat');
      if (!context.build) {
        return {};
      }

      return produce(context, (draft) => {
        draft.build!.lastChatId = event.chatId;
        // Don't update updatedAt for switching active chat
      });
    }),
    deleteChatFromContext: assign(({ context, event }) => {
      assertEvent(event, 'deleteChat');
      if (!context.build) {
        return {};
      }

      return produce(context, (draft) => {
        const chatIndex = draft.build!.chats.findIndex((c) => c.id === event.chatId);
        if (chatIndex !== -1) {
          draft.build!.chats.splice(chatIndex, 1);
        }

        // Update lastChatId if we deleted the active chat
        if (draft.build!.lastChatId === event.chatId) {
          draft.build!.lastChatId = draft.build!.chats.at(-1)?.id;
        }

        draft.build!.updatedAt = Date.now();
      });
    }),
    updateCodeParametersInContext: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'updateCodeParameters');

      if (!context.build?.assets.mechanical) {
        return;
      }

      // Update build in context using Immer
      enqueue.assign(({ context: ctx }) =>
        produce(ctx, (draft) => {
          if (draft.build?.assets.mechanical) {
            draft.build.assets.mechanical.files = event.files;
            draft.build.assets.mechanical.parameters = event.parameters;
            draft.build.updatedAt = Date.now();
          }
        }),
      );
    }),
    createFileInContext: assign(({ context, event }) => {
      assertEvent(event, 'createFile');
      if (!context.build?.assets.mechanical) {
        return {};
      }

      return produce(context, (draft) => {
        if (draft.build?.assets.mechanical) {
          draft.build.assets.mechanical.files[event.path] = { content: event.content };
          draft.build.updatedAt = Date.now();
        }
      });
    }),
    updateFileInContext: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'updateFile');
      if (!context.build?.assets.mechanical) {
        return;
      }

      // Update the file content
      enqueue.assign(
        produce(context, (draft) => {
          if (draft.build?.assets.mechanical) {
            draft.build.assets.mechanical.files[event.path] = { content: event.content };
            draft.build.updatedAt = Date.now();
          }
        }),
      );

      // Determine which file to send to CAD based on enableFilePreview
      const { enableFilePreview } = context;
      const mainFilePath = context.build.assets.mechanical.main;
      const isMainFile = event.path === mainFilePath;

      let codeToSend: string | undefined;

      if (enableFilePreview) {
        codeToSend = event.content;
      } else {
        // With preview disabled, always send main file when any file updates
        codeToSend = isMainFile ? event.content : context.build.assets.mechanical.files[mainFilePath]?.content;
      }

      if (codeToSend) {
        enqueue.sendTo(context.cadRef, {
          type: 'setCode',
          code: codeToSend,
        });
      }
    }),
    renameFileInContext: assign(({ context, event }) => {
      assertEvent(event, 'renameFile');
      if (!context.build?.assets.mechanical) {
        return {};
      }

      return produce(context, (draft) => {
        const files = draft.build?.assets.mechanical?.files;
        if (files?.[event.oldPath]) {
          const fileContent = files[event.oldPath];
          if (!fileContent) {
            return;
          }

          // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove old file path
          delete files[event.oldPath];
          files[event.newPath] = fileContent;

          // Update main file path if renaming the main file
          if (draft.build?.assets.mechanical?.main === event.oldPath) {
            draft.build.assets.mechanical.main = event.newPath;
          }

          if (draft.build) {
            draft.build.updatedAt = Date.now();
          }
        }
      });
    }),
    deleteFileFromContext: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'deleteFile');
      if (!context.build?.assets.mechanical) {
        return;
      }

      enqueue.assign(
        produce(context, (draft) => {
          if (draft.build?.assets.mechanical?.files[event.path]) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- need to remove file from record
            delete draft.build.assets.mechanical.files[event.path];
            draft.build.updatedAt = Date.now();
          }
        }),
      );

      // Close the file in file explorer if it's open
      enqueue.sendTo(context.fileExplorerRef, {
        type: 'closeFile',
        path: event.path,
      });
    }),
    stopStatefulActors: enqueueActions(({ enqueue, context }) => {
      // Stop the old stateful actors (they'll be garbage collected)
      enqueue.stopChild(context.gitRef);
      enqueue.stopChild(context.fileExplorerRef);
    }),
    respawnStatefulActors: assign({
      gitRef({ context, spawn, self }) {
        return spawn('git', {
          id: `git-${context.buildId}`,
          input: { buildId: context.buildId, parentRef: self },
        });
      },
      fileExplorerRef({ context, spawn, self }) {
        return spawn('fileExplorer', {
          id: `file-explorer-${context.buildId}`,
          input: { parentRef: self },
        });
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
    setEnableFilePreview: assign({
      enableFilePreview({ event }) {
        assertEvent(event, 'setEnableFilePreview');
        return event.enabled;
      },
    }),
    handleFileOpened: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'fileOpened');

      const { enableFilePreview } = context;
      const mechanicalAsset = context.build?.assets.mechanical;
      if (!mechanicalAsset) {
        return;
      }

      const mainFilePath = mechanicalAsset.main;
      const isMainFile = event.path === mainFilePath;

      // Determine which file to show in CAD
      let codeToSend: string | undefined;

      if (enableFilePreview) {
        // Preview enabled: show the opened file
        const file = mechanicalAsset.files[event.path];
        codeToSend = file?.content;
      } else if (isMainFile) {
        // Preview disabled: only update CAD if opening the main file
        const file = mechanicalAsset.files[event.path];
        codeToSend = file?.content;
      }
      // If opening a non-main file with preview disabled, do nothing

      if (codeToSend) {
        enqueue.sendTo(context.cadRef, {
          type: 'setCode',
          code: codeToSend,
        });
      }
    }),
    openInitialFile: enqueueActions(({ enqueue, context }) => {
      const mechanicalAsset = context.build?.assets.mechanical;
      if (!mechanicalAsset?.main) {
        return;
      }

      const mainFile = mechanicalAsset.files[mechanicalAsset.main];
      if (!mainFile) {
        return;
      }

      // Open the main file
      enqueue.sendTo(context.fileExplorerRef, {
        type: 'openFile',
        path: mechanicalAsset.main,
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
  context({ input, spawn, self }) {
    const { buildId, shouldLoadModelOnStart = true } = input;

    const gitRef = spawn('git', {
      id: `git-${buildId}`,
      input: { buildId, parentRef: self },
    });

    const fileExplorerRef = spawn('fileExplorer', {
      id: `file-explorer-${buildId}`,
      input: { parentRef: self },
    });

    const graphicsRef = spawn('graphics', {
      id: `graphics-${buildId}`,
      input: {
        defaultCameraFovAngle: 60,
        measureSnapDistance: 40,
      },
    });

    const logRef = spawn('logs', {
      id: `log-${buildId}`,
    });

    const cadRef = spawn('cad', {
      id: `cad-${buildId}`,
      input: {
        shouldInitializeKernelOnStart: false,
        graphicsRef,
        logRef,
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
      gitRef,
      fileExplorerRef,
      graphicsRef,
      cadRef,
      screenshotRef,
      cameraRef,
      logRef,
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
            'initializeKernelIfNeeded',
            'openInitialFile',
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
    ready: {
      type: 'parallel',
      states: {
        filesystem: {
          initial: 'writingInitial',
          states: {
            writingInitial: {
              invoke: {
                src: 'writeFilesystemActor',
                input({ context }) {
                  return {
                    buildId: context.buildId,
                    files: context.build?.assets.mechanical?.files ?? {},
                  };
                },
                onDone: {
                  target: 'idle',
                },
                onError: {
                  target: 'idle',
                  // Fail silently
                },
              },
            },
            idle: {},
          },
        },
        operation: {
          initial: 'idle',
          states: {
            idle: {},
            creatingFile: {
              invoke: {
                src: 'writeFilesystemActor',
                input({ context }) {
                  return {
                    buildId: context.buildId,
                    files: context.build?.assets.mechanical?.files ?? {},
                  };
                },
                onDone: {
                  target: 'idle',
                  actions: [
                    emit(({ context, event }) => {
                      assertActorDoneEvent(event);
                      // Get the path and content from the last createFile event
                      const mechanicalFiles = context.build?.assets.mechanical?.files ?? {};
                      const paths = Object.keys(mechanicalFiles);
                      const lastPath = paths.at(-1) ?? '';
                      const lastFile = mechanicalFiles[lastPath];
                      return {
                        type: 'fileCreated' as const,
                        path: lastPath,
                        content: lastFile?.content ?? '',
                      };
                    }),
                  ],
                },
                onError: {
                  target: 'idle',
                },
              },
            },
            updatingFile: {
              invoke: {
                src: 'writeFilesystemActor',
                input({ context, event }) {
                  assertEvent(event, 'updateFile');
                  return {
                    buildId: context.buildId,
                    files: context.build?.assets.mechanical?.files ?? {},
                  };
                },
                onDone: {
                  target: 'idle',
                },
                onError: {
                  target: 'idle',
                },
              },
            },
            renamingFile: {
              invoke: {
                src: 'writeFilesystemActor',
                input({ context }) {
                  return {
                    buildId: context.buildId,
                    files: context.build?.assets.mechanical?.files ?? {},
                  };
                },
                onDone: {
                  target: 'idle',
                },
                onError: {
                  target: 'idle',
                },
              },
            },
            deletingFile: {
              invoke: {
                src: 'writeFilesystemActor',
                input({ context }) {
                  return {
                    buildId: context.buildId,
                    files: context.build?.assets.mechanical?.files ?? {},
                  };
                },
                onDone: {
                  target: 'idle',
                },
                onError: {
                  target: 'idle',
                },
              },
            },
          },
          on: {
            loadBuild: [
              {
                guard: 'isBuildIdChanging',
                target: '#build.loading',
                actions: ['updateBuildId', 'stopStatefulActors', 'respawnStatefulActors', 'setLoading'],
              },
              {
                target: '#build.loading',
                actions: 'setLoading',
              },
            ],
            updateName: {
              actions: ['updateName'],
            },
            updateDescription: {
              actions: ['updateDescription'],
            },
            updateTags: {
              actions: ['updateTags'],
            },
            updateThumbnail: {
              actions: ['updateThumbnail'],
            },
            addChat: {
              actions: ['addChatToContext'],
            },
            updateChatMessages: {
              actions: ['updateChatMessagesInContext'],
            },
            updateChatName: {
              actions: ['updateChatNameInContext'],
            },
            setActiveChat: {
              actions: ['setActiveChatInContext'],
            },
            deleteChat: {
              actions: ['deleteChatFromContext'],
            },
            updateCodeParameters: {
              actions: ['updateCodeParametersInContext'],
            },
            setEnableFilePreview: {
              actions: 'setEnableFilePreview',
            },
            loadModel: {
              actions: 'loadModel',
            },
            createFile: {
              target: '.creatingFile',
              actions: ['createFileInContext'],
            },
            updateFile: {
              target: '.updatingFile',
              actions: 'updateFileInContext',
            },
            renameFile: {
              target: '.renamingFile',
              actions: 'renameFileInContext',
            },
            deleteFile: {
              target: '.deletingFile',
              actions: ['deleteFileFromContext'],
            },
            fileOpened: {
              actions: 'handleFileOpened',
            },
          },
        },
        storing: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                updateName: {
                  target: 'pending',
                },
                updateDescription: {
                  target: 'pending',
                },
                updateTags: {
                  target: 'pending',
                },
                updateThumbnail: {
                  target: 'pending',
                },
                addChat: {
                  target: 'pending',
                },
                updateChatMessages: {
                  target: 'pending',
                },
                updateChatName: {
                  target: 'pending',
                },
                setActiveChat: {
                  target: 'pending',
                },
                deleteChat: {
                  target: 'pending',
                },
                updateCodeParameters: {
                  target: 'pending',
                },
                createFile: {
                  target: 'pending',
                },
                updateFile: {
                  target: 'pending',
                },
                renameFile: {
                  target: 'pending',
                },
                deleteFile: {
                  target: 'pending',
                },
              },
            },
            pending: {
              after: {
                // eslint-disable-next-line @typescript-eslint/naming-convention -- XState delayed transition syntax
                500: 'writing',
              },
              on: {
                updateName: {
                  target: 'pending',
                  reenter: true,
                },
                updateDescription: {
                  target: 'pending',
                  reenter: true,
                },
                updateTags: {
                  target: 'pending',
                  reenter: true,
                },
                updateThumbnail: {
                  target: 'pending',
                  reenter: true,
                },
                addChat: {
                  target: 'pending',
                  reenter: true,
                },
                updateChatMessages: {
                  target: 'pending',
                  reenter: true,
                },
                updateChatName: {
                  target: 'pending',
                  reenter: true,
                },
                setActiveChat: {
                  target: 'pending',
                  reenter: true,
                },
                deleteChat: {
                  target: 'pending',
                  reenter: true,
                },
                updateCodeParameters: {
                  target: 'pending',
                  reenter: true,
                },
                createFile: {
                  target: 'pending',
                  reenter: true,
                },
                updateFile: {
                  target: 'pending',
                  reenter: true,
                },
                renameFile: {
                  target: 'pending',
                  reenter: true,
                },
                deleteFile: {
                  target: 'pending',
                  reenter: true,
                },
              },
            },
            writing: {
              invoke: {
                src: 'writeBuildActor',
                input({ context }) {
                  return { build: context.build! };
                },
                onDone: {
                  target: 'idle',
                  actions: [
                    assign({
                      build({ event }) {
                        assertActorDoneEvent(event);
                        return event.output;
                      },
                    }),
                    emit(({ event }) => ({
                      type: 'buildUpdated' as const,
                      build: event.output,
                    })),
                  ],
                },
                onError: {
                  target: 'pending',
                  actions: ['setError'],
                },
              },
            },
          },
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
      },
    },
  },
});
