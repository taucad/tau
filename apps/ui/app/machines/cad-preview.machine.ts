import { setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { eventSchemas, fromSafeAsync } from '#lib/xstate.lib.js';
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
  /** Bytes the first render stages; set only where the kernel cannot read the preview mount. */
  stage?: Record<string, Uint8Array<ArrayBuffer>>;
  parameters: Record<string, unknown>;
  initError?: Error;
};

type CadPreviewInput = {
  cadRef: ActorRefFrom<typeof cadMachine>;
  projectId: string;
  mainFile: string;
  files?: Record<string, { content: Uint8Array<ArrayBuffer> }>;
  stage?: Record<string, Uint8Array<ArrayBuffer>>;
  parameters?: Record<string, unknown>;
};

type CadPreviewEvent =
  | { type: 'start' }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'retry' };

/**
 * Default prepareFiles actor -- throws to enforce injection via `.provide()`.
 * Follows the same pattern as projectMachine's `loadProjectActor`.
 */
const prepareFilesActor = fromSafeAsync<void, PrepareFilesInput>(async () => {
  throw new Error('Not implemented. Supply via cadPreviewMachine.provide({ actors: { prepareFiles } }).');
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
  schemas: {
    context: types<CadPreviewContext>(),
    input: types<CadPreviewInput>(),
    events: eventSchemas<CadPreviewEvent>(),
  },
  actors: {
    prepareFiles: prepareFilesActor,
  },
}).createMachine({
  id: 'cadPreview',
  context: ({ input }) => ({
    cadRef: input.cadRef,
    projectId: input.projectId,
    mainFile: input.mainFile,
    files: input.files,
    stage: input.stage,
    parameters: input.parameters ?? {},
    initError: undefined,
  }),
  initial: 'idle',
  states: {
    idle: {
      on: {
        start: { target: 'preparingFiles' },
      },
    },
    preparingFiles: {
      invoke: {
        src: 'prepareFiles',
        input: ({ context }): PrepareFilesInput => ({
          files: context.files,
          projectId: context.projectId,
        }),
        onDone: ({ context }, enq) => {
          enq.sendTo(context.cadRef, {
            type: 'initializeModel',
            entryPath: context.mainFile,
            ...(Object.keys(context.parameters).length === 0 ? {} : { parameters: context.parameters }),
            ...(context.stage ? { stage: context.stage } : {}),
          });
          return { target: 'active' };
        },
        onError: {
          target: 'error',
          context: ({ event }) => ({
            initError: event.error instanceof Error ? event.error : new Error(String(event.error)),
          }),
        },
      },
    },
    active: {
      on: {
        /* Preview values are committed on the watched document and become its export baseline. */
        setParameters: ({ context, event }, enq) => {
          enq.sendTo(context.cadRef, { type: 'setPreviewParameters', parameters: event.parameters });
          return { context: { parameters: event.parameters } };
        },
      },
    },
    error: {
      on: {
        retry: { target: 'preparingFiles' },
      },
    },
  },
});
