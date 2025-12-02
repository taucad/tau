import { assign, assertEvent, setup, fromPromise, emit, enqueueActions } from 'xstate';
import type { ActorRefFrom, OutputFrom, DoneActorEvent, AnyStateMachine } from 'xstate';
import { produce } from 'immer';
import type { Build } from '@taucad/types';
import { isBrowser } from '#constants/browser.constants.js';
import { assertActorDoneEvent } from '#lib/xstate.js';
import { cameraCapabilityMachine } from '#machines/camera-capability.machine.js';
import { cadMachine } from '#machines/cad.machine.js';
import { gitMachine } from '#machines/git.machine.js';
import { graphicsMachine } from '#machines/graphics.machine.js';
import { logMachine } from '#machines/logs.machine.js';
import { screenshotCapabilityMachine } from '#machines/screenshot-capability.machine.js';
import type { fileManagerMachine } from '#machines/file-manager.machine.js';

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
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
  gitRef: ActorRefFrom<typeof gitMachine>;
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
  fileManagerRef: ActorRefFrom<typeof fileManagerMachine>;
};

// Define the actors that the machine can invoke
const loadBuildActor = fromPromise<Build, { buildId: string }>(async () => {
  throw new Error('Not implemented. Please supply the `provide.actors.loadBuildActor` option to the build machine.');
});

const writeBuildActor = fromPromise<void, { build: Build }>(async () => {
  throw new Error('Not implemented. Please supply the `provide.actors.writeBuildActor` option to the build machine.');
});

const buildActors = {
  loadBuildActor,
  writeBuildActor,
  git: gitMachine,
  graphics: graphicsMachine,
  // Having the cadMachine typed results in:
  // `The inferred type of this node exceeds the maximum length the compiler will serialize`.
  // We need to dig into this and possibly simplify the external type inferred from the machine.
  //
  // This has no impact on machine consumer typings, only to this machine where
  // some types will need to be manually asserted (Eslint will report those places).
  cad: cadMachine as AnyStateMachine,
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
  | { type: 'setLastChatId'; chatId: string }
  | {
      type: 'updateCodeParameters';
      files: Record<string, { content: Uint8Array }>;
      parameters: Record<string, unknown>;
    }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setEnableFilePreview'; enabled: boolean }
  | { type: 'loadModel' }
  | { type: 'setMainFile'; path: string };

export type BuildEventExternal = OutputFrom<(typeof buildActors)[BuildActorNames]>;
type BuildEventExternalDone = DoneActorEvent<BuildEventExternal, BuildActorNames>;

type BuildEvent = BuildEventExternalDone | BuildEventInternal;

/**
 * Build Machine Emitted Events
 */
type BuildEmitted =
  | { type: 'buildLoaded'; build: Build }
  | { type: 'error'; error: Error }
  | { type: 'buildUpdated'; build: Build };

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
    setLastChatIdInContext: assign(({ context, event }) => {
      assertEvent(event, 'setLastChatId');
      if (!context.build) {
        return {};
      }

      return produce(context, (draft) => {
        draft.build!.lastChatId = event.chatId;
        // Don't update updatedAt for switching active chat
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
            draft.build.assets.mechanical.parameters = event.parameters;
            draft.build.updatedAt = Date.now();
          }
        }),
      );
    }),
    setParametersInContext: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'setParameters');

      if (!context.build?.assets.mechanical) {
        return;
      }

      // Update build in context using Immer
      enqueue.assign(({ context: ctx }) =>
        produce(ctx, (draft) => {
          if (draft.build?.assets.mechanical) {
            draft.build.assets.mechanical.parameters = event.parameters;
            draft.build.updatedAt = Date.now();
          }
        }),
      );

      // Forward to CAD machine
      enqueue.sendTo(context.cadRef, {
        type: 'setParameters',
        parameters: event.parameters,
      });
    }),
    setMainFileInContext: assign(({ context, event }) => {
      assertEvent(event, 'setMainFile');
      if (!context.build?.assets.mechanical) {
        return {};
      }

      return produce(context, (draft) => {
        if (draft.build?.assets.mechanical) {
          draft.build.assets.mechanical.main = event.path;
          draft.build.updatedAt = Date.now();
        }
      });
    }),
    stopStatefulActors: enqueueActions(({ enqueue, context }) => {
      // Stop the old stateful actors (they'll be garbage collected)
      enqueue.stopChild(context.gitRef);
      enqueue.stopChild(context.cadRef);
    }),
    respawnStatefulActors: assign({
      gitRef({ context, spawn, self }) {
        return spawn('git', {
          id: `git-${context.buildId}`,
          input: { buildId: context.buildId, parentRef: self },
        });
      },
      cadRef({ context, spawn }) {
        return spawn('cad', {
          id: `cad-${context.buildId}`,
          input: {
            shouldInitializeKernelOnStart: false,
            graphicsRef: context.graphicsRef,
            logRef: context.logRef,
            fileManagerRef: context.fileManagerRef,
          },
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
        file: {
          path: `/builds/${context.buildId}`,
          filename: mechanicalAsset.main,
        },
        parameters: mechanicalAsset.parameters,
      });
    }),
    loadModel: enqueueActions(({ enqueue, context }) => {
      const mechanicalAsset = context.build?.assets.mechanical;
      if (!mechanicalAsset) {
        return;
      }

      // Initialize kernel first
      enqueue.sendTo(context.cadRef, { type: 'initializeKernel' });

      // Initialize the model with current build data
      enqueue.sendTo(context.cadRef, {
        type: 'initializeModel',
        file: {
          path: `/builds/${context.buildId}`,
          filename: mechanicalAsset.main,
        },
        parameters: mechanicalAsset.parameters,
      });
    }),
    setEnableFilePreview: assign({
      enableFilePreview({ event }) {
        assertEvent(event, 'setEnableFilePreview');
        return event.enabled;
      },
    }),
    emitBuildLoaded: emit(({ event }) => {
      assertActorDoneEvent(event);
      return {
        type: 'buildLoaded' as const,
        build: event.output as Build,
      };
    }),
    emitBuildUpdated: emit(({ event }) => {
      assertActorDoneEvent(event);
      return {
        type: 'buildUpdated' as const,
        build: event.output as Build,
      };
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
    const { buildId, shouldLoadModelOnStart = true, fileManagerRef } = input;

    const gitRef = spawn('git', {
      id: `git-${buildId}`,
      input: { buildId, parentRef: self },
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
        fileManagerRef,
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
      fileManagerRef,
      gitRef,
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
          actions: ['setBuild', 'clearLoading', 'initializeKernelIfNeeded', 'emitBuildLoaded'],
        },
        onError: {
          target: 'error',
          actions: ['setError'],
        },
      },
    },
    ready: {
      type: 'parallel',
      states: {
        operation: {
          initial: 'idle',
          states: {
            idle: {},
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
            setLastChatId: {
              actions: ['setLastChatIdInContext'],
            },
            updateCodeParameters: {
              actions: ['updateCodeParametersInContext'],
            },
            setParameters: {
              actions: ['setParametersInContext'],
            },
            setEnableFilePreview: {
              actions: 'setEnableFilePreview',
            },
            loadModel: {
              actions: 'loadModel',
            },
            setMainFile: {
              actions: 'setMainFileInContext',
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
                setLastChatId: {
                  target: 'pending',
                },
                updateCodeParameters: {
                  target: 'pending',
                },
                setParameters: {
                  target: 'pending',
                },
                setMainFile: {
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
                setLastChatId: {
                  target: 'pending',
                  reenter: true,
                },
                updateCodeParameters: {
                  target: 'pending',
                  reenter: true,
                },
                setParameters: {
                  target: 'pending',
                  reenter: true,
                },
                setMainFile: {
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
                  actions: ['emitBuildUpdated'],
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
