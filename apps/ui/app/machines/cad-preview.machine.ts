import { assign, setup, enqueueActions, waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import type { cadMachine } from '#machines/cad.machine.js';

/**
 * Input for the prepareFiles actor. Passed via invoke input.
 */
export type PrepareFilesInput = {
  readonly files?: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  readonly projectId: string;
};

type CadPreviewContext = {
  cadRef: ActorRefFrom<typeof cadMachine>;
  projectId: string;
  mainFile: string;
  files?: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  parameters: Record<string, unknown>;
  initError?: Error;
};

type CadPreviewInput = {
  cadRef: ActorRefFrom<typeof cadMachine>;
  projectId: string;
  mainFile: string;
  files?: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  parameters?: Record<string, unknown>;
};

type CadPreviewEvent =
  | { type: 'start' }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'retry' };

type EnsureParametersInput = {
  readonly cadRef: ActorRefFrom<typeof cadMachine>;
  readonly parameters: Record<string, unknown>;
};

/**
 * Default prepareFiles actor -- throws to enforce injection via `.provide()`.
 * Follows the same pattern as projectMachine's `loadProjectActor`.
 */
const prepareFilesActor = fromSafeAsync<void, PrepareFilesInput>(async () => {
  throw new Error('Not implemented. Supply via cadPreviewMachine.provide({ actors: { prepareFiles } }).');
});

/**
 * Waits for cadRef's kernel client to become available, then sends parameters
 * directly to the kernel. Handles the deferred case where prepareFiles
 * completes before the kernel connects.
 */
const ensureParametersActor = fromSafeAsync<void, EnsureParametersInput>(async ({ input, signal }) => {
  const { cadRef, parameters } = input;
  if (Object.keys(parameters).length === 0) {
    return;
  }

  const snapshot = await waitFor(cadRef, (s) => s.context.kernelClient !== undefined, { signal });
  const { kernelClient } = snapshot.context;
  if (kernelClient) {
    void kernelClient.updateParameters(parameters);
  }
});

/**
 * Lightweight state machine that orchestrates the CAD preview lifecycle:
 *
 *   idle  -->  preparingFiles  -->  active
 *                    |
 *                    v
 *                  error  -->  (retry) --> preparingFiles
 *
 * File preparation is injected via `.provide()` (same pattern as projectMachine's loadProjectActor).
 * On successful preparation, sends `initializeModel` to the cadRef actor.
 */
export const cadPreviewMachine = setup({
  types: {
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as CadPreviewContext,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as CadPreviewInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as CadPreviewEvent,
  },
  actors: {
    prepareFiles: prepareFilesActor,
    ensureParameters: ensureParametersActor,
  },
  actions: {
    initializeCadModel: enqueueActions(({ enqueue, context }) => {
      enqueue.sendTo(context.cadRef, {
        type: 'initializeModel',
        entryPath: context.mainFile,
        parameters: context.parameters,
      });
    }),
    forwardSetParameters: enqueueActions(({ enqueue, context, event }) => {
      if (event.type === 'setParameters') {
        enqueue.sendTo(context.cadRef, {
          type: 'setParameters',
          parameters: event.parameters,
        });
        const { kernelClient } = context.cadRef.getSnapshot().context;
        void kernelClient?.updateParameters(event.parameters);
      }
    }),
  },
}).createMachine({
  id: 'cadPreview',
  context: ({ input }) => ({
    cadRef: input.cadRef,
    projectId: input.projectId,
    mainFile: input.mainFile,
    files: input.files,
    parameters: input.parameters ?? {},
    initError: undefined,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        start: 'preparingFiles',
      },
    },
    preparingFiles: {
      invoke: {
        src: 'prepareFiles',
        input: ({ context }): PrepareFilesInput => ({
          files: context.files,
          projectId: context.projectId,
        }),
        onDone: {
          target: 'active',
          actions: 'initializeCadModel',
        },
        onError: {
          target: 'error',
          actions: assign({
            initError: ({ event }) => (event.error instanceof Error ? event.error : new Error(String(event.error))),
          }),
        },
      },
    },
    active: {
      invoke: {
        src: 'ensureParameters',
        input: ({ context }): EnsureParametersInput => ({
          cadRef: context.cadRef,
          parameters: context.parameters,
        }),
      },
      on: {
        setParameters: {
          actions: 'forwardSetParameters',
        },
      },
    },
    error: {
      on: {
        retry: 'preparingFiles',
      },
    },
  },
});
