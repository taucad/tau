import { assign, assertEvent, setup, sendTo, fromPromise } from 'xstate';
import type { Snapshot, ActorRef, OutputFrom } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import type { Shape } from '~/types/cad.js';
import type { BuilderWorkerInterface } from '~/components/geometry/kernel/replicad/replicad-builder.worker.js';
import BuilderWorker from '~/components/geometry/kernel/replicad/replicad-builder.worker.js?worker';

const createWorkerActor = fromPromise<{ type: 'kernelInitialized' }, { context: KernelContext }>(async ({ input }) => {
  const { context } = input;

  // In non-browser environments, fake an initialization
  if (!isBrowser) {
    return { type: 'kernelInitialized' };
  }

  // Clean up any existing worker
  if (context.worker) {
    context.worker.terminate();
  }

  try {
    // Create a new worker based on the kernel type
    const worker = new BuilderWorker();

    // Wrap the worker with comlink
    const wrappedWorker = wrap<BuilderWorkerInterface>(worker);

    // Initialize the worker with the default exception handling mode
    await wrappedWorker.initialize(false);

    // Store references to worker and wrappedWorker
    context.worker = worker;
    context.wrappedWorker = wrappedWorker;

    // Return success result
    return { type: 'kernelInitialized' };
  } catch (error) {
    // Handle initialization errors
    const errorMessage = error instanceof Error ? error.message : 'Failed to initialize worker';
    throw new Error(errorMessage);
  }
});

const parseParametersActor = fromPromise(
  async ({
    input,
  }: {
    input: { context: KernelContext; event: { code: string; parameters: Record<string, unknown> } };
  }) => {
    const { context, event } = input;

    // Skip in non-browser environments
    if (!isBrowser) {
      throw new Error('Not in browser environment');
    }

    if (!context.wrappedWorker) {
      throw new Error('Worker not initialized');
    }

    try {
      const defaultParameters = (await context.wrappedWorker.extractDefaultParametersFromCode(event.code)) ?? {};
      return {
        type: 'parametersParsed' as const,
        defaultParameters,
        code: event.code,
        parameters: event.parameters,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error extracting parameters';
      console.error('Error extracting parameters:', errorMessage);
      // Don't throw error here to avoid disrupting the main flow
      // Just return with empty parameters
      return {
        type: 'parametersParsed' as const,
        defaultParameters: {},
        code: event.code,
        parameters: {},
      };
    }
  },
);

const evaluateCodeActor = fromPromise<
  {
    type: 'geometryComputed';
    shapes: Shape[];
  },
  {
    context: KernelContext;
    event: { defaultParameters: Record<string, unknown>; parameters: Record<string, unknown>; code: string };
  }
>(async ({ input }) => {
  const { context, event } = input;

  if (!isBrowser) {
    throw new Error('Not in browser environment');
  }

  if (!context.wrappedWorker) {
    throw new Error('Worker not initialized');
  }

  // Merge default parameters with provided parameters
  const mergedParameters = {
    ...event.defaultParameters,
    ...event.parameters,
  };

  const shapes = await context.wrappedWorker.buildShapesFromCode(event.code, mergedParameters);

  // Check if the result is an error or actual shapes
  if (shapes && typeof shapes === 'object' && 'error' in shapes) {
    throw new Error((shapes as { message?: string }).message ?? 'Error building shapes');
  }

  return { type: 'geometryComputed' as const, shapes: shapes as Shape[] };
});

const exportGeometryActor = fromPromise(
  async ({ input }: { input: { context: KernelContext; event: { format: string } } }) => {
    const { context, event } = input;

    // Skip in non-browser environments
    if (!isBrowser) {
      throw new Error('Not in browser environment');
    }

    if (!context.wrappedWorker) {
      throw new Error('Worker not initialized');
    }

    const format = event.format as 'stl' | 'stl-binary' | 'step' | 'step-assembly';
    const result = await context.wrappedWorker.exportShape(format);

    if (result && result.length > 0 && result[0].blob) {
      return { type: 'geometryExported' as const, blob: result[0].blob, format };
    }

    throw new Error('Failed to export shape');
  },
);

// Check if we're in a browser environment
const isBrowser = globalThis.window !== undefined && typeof Worker !== 'undefined';

export type CadActor = ActorRef<Snapshot<unknown>, KernelEventExternal>;

type KernelEventInternal =
  | { type: 'initializeKernel'; kernelType: 'replicad' | 'openscad'; parentRef: CadActor }
  | { type: 'computeGeometry'; code: string; parameters: Record<string, unknown> }
  | { type: 'parseParameters'; code: string }
  | { type: 'exportGeometry'; format: string };

// Define the types of events the machine can receive
export type KernelEventExternal =
  | { type: 'kernelInitialized' }
  | { type: 'geometryComputed'; shapes: Shape[] }
  | {
      type: 'parametersParsed';
      defaultParameters: Record<string, unknown>;
      parameters: Record<string, unknown>;
      code: string;
    }
  | { type: 'geometryExported'; blob: Blob; format: 'stl' | 'stl-binary' | 'step' | 'step-assembly' }
  | { type: 'kernelError'; error: string };

type KernelEvent = KernelEventExternal | KernelEventInternal;

// Interface defining the context for the Kernel machine
type KernelContext = {
  worker?: Worker;
  wrappedWorker?: Remote<BuilderWorkerInterface>;
  kernelType?: 'replicad' | 'openscad';
  parentRef?: CadActor;
};

/**
 * Kernel Machine
 *
 * This machine manages the WebWorker that runs the CAD operations:
 * - Initializes the worker
 * - Handles communication with the worker
 * - Processes results from CAD operations
 *
 * The machine's computation is purely stateless. It only manages the worker and the events it sends to the parent machine.
 * The parent machine is responsible for the state of the CAD operations.
 */
export const kernelMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as KernelContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as KernelEvent,
  },
  actors: {
    createWorkerActor,

    parseParametersActor,

    evaluateCodeActor,

    exportGeometryActor,
  },
  actions: {
    registerParentRef: assign({
      parentRef({ event }) {
        assertEvent(event, 'initializeKernel');
        return event.parentRef;
      },
    }),
    async destroyWorker({ context }) {
      console.log('destroying worker');
      if (!context.worker) return;
      context.worker.terminate();
      context.worker = undefined;
      context.wrappedWorker = undefined;
    },
    sendKernelInitialized: sendTo(
      ({ context }) => context.parentRef!,
      ({ event }) => {
        assertEvent(event, 'kernelInitialized');
        return event;
      },
    ),
    sendError: sendTo(
      ({ context }) => context.parentRef!,
      ({ event }) => {
        assertEvent(event, 'kernelError');
        return event;
      },
    ),
    sendGeometryComputed: sendTo(
      ({ context }) => context.parentRef!,
      ({ event }) => {
        assertEvent(event, 'geometryComputed');
        return event;
      },
    ),
    sendGeometryExported: sendTo(
      ({ context }) => context.parentRef!,
      ({ event }) => {
        assertEvent(event, 'geometryExported');
        return event;
      },
    ),
    sendParametersParsed: sendTo(
      ({ context }) => context.parentRef!,
      ({ event }) => {
        assertEvent(event, 'parametersParsed');
        return event;
      },
    ),
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QGswCcB2YA2A6AlhvgC74CG2+AXoVAMSEnmVWQDaADALqKgAOAe1hMBGXiAAeiAEwA2AJy4AzBwCMqgCwrZ0gByzVSgDQgAnogCsujbmnyOG1bvlKlegOy6Avl5OpMOAREpBTUtHToaAJonDxIIILCpKLiUgiyWsrSSupy8hYq7u4m5ghu0riq7vIZ8qoc2dIWFj5+6Fh4aGBkEKZ0AMYCALZ8AK7EYADiYMNgxGimseKJImLxafIaFfYcsrsaGrLuByWILu64W1VFug1uukqtIP4duF09fWASgmjE07PzRbcZZCVapRCqbIWXAFSEaXSqfLVdyyU4IaqyGG6awWVR7QzHeRPF6BL4-UgYegwAELACi32iEwgS3iK2Sa1AaU0Gg4uGRSns0k08jkxjMiHuuBFNQFKg48ncSlkxPapIZv3CkWiLP4oPZ4IQ9QyuH0+gO6luejRTmhRQFegF+SVmxVATwZMZkDoElgxDIE1wZAAZhM0AAKDgASjoJPd6qZOoSevwKXWEKs0Ic5Q4uIs0hRxXFCHyFQFDwK0gO8qVrtefDIaGElLo9bQZCGc3QsAACg3YOxgazk6nORLeSjnSKlMdXEp9GihZjdO4OBwlXj4dda4FW036FqYoPdUkUxzJIhbhc4Qr5ccGhZUUWRSbCc55c5ZJ-vL5nqr3QA3ChRn9cJqQ7QEAGFhjGBMjyTE8R3PMpblwPYlFhDR3DzEVKzRZcLg4Fc8ycHMDAsDRtwAoCQObA9EzZU8DT2aE5AaWQrEaGU0S2RQLEIrCFB0AoOAeSjcDAQDsGAplvV9f0wEDEN0AjaNY3EyTpIHOJjzBNMEF0SspUVSFBUOeVpDwzwYSIppPE8GUxIPAZoPGKYZnAhZ6OHM80gnSpywsGo+OCsVSnhJQYWkOQEQRJoHFkR4fzUpyPV+f4PKBbT4N00dDQaGwinqfjFXI0KJSiyoMTnAyDgKb82jdcS0CiNAGGCZhqDALyEJ8yxAtQix3EhbQUUvBc8RfVcH3caRSPqb8fwwAQIDgcRYxBHqDQAWkRbZMMcQ4US2B40WhacNHkewtAUET9jExgQhYWgNpypCmgqG5mnxOpDmaBd8lsA59ErHQqk-MT3l6F79T0+oAcwlcXAUREGjwxEYXYtQeSiiikr-cT42eodNthuQl3Q-IFT2TZdjRdDVClXZZqqIVLt0QbHPjSBocY2GOJhWVVFxaqql0NFPwuZoHhmxVqluRKGrrPsiZ0mHcp2g4pX2zQjgyB1rSVE0Es8diLv0PZlTxxqJOoikoB5xC0kcXRKkRKp1GOOx2O4vNLmsFQ6lI6xDEcjT5IgB3evSVwjJcL6DDxZc0R2XAHBXawos-HkFd-a3muiSODQRaEJZlPZl3kE6iyUDRoSFnQ1Erci7PcHwfCAA */
  id: 'kernel',
  context: {
    worker: undefined,
    wrappedWorker: undefined,
    kernelType: undefined,
    parentRef: undefined,
  },
  initial: 'initializing',
  exit: ['destroyWorker'],
  states: {
    initializing: {
      on: {
        initializeKernel: {
          target: 'creatingWorker',
          actions: 'registerParentRef',
        },
      },
    },

    creatingWorker: {
      invoke: {
        src: 'createWorkerActor',
        input: ({ context }) => ({ context }),
        onDone: {
          target: 'ready',
          actions: sendTo(({ context }) => context.parentRef!, { type: 'kernelInitialized' }),
        },
        onError: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => ({
              type: 'kernelError',
              error: event.error instanceof Error ? event.error.message : 'Unknown error occurred',
            }),
          ),
        },
      },
    },

    ready: {
      on: {
        computeGeometry: {
          target: 'parsing',
        },
        exportGeometry: {
          target: 'exporting',
        },
      },
    },

    parsing: {
      invoke: {
        src: 'parseParametersActor',
        input({ context, event }) {
          assertEvent(event, 'computeGeometry');
          return {
            context,
            event,
          };
        },
        onDone: {
          target: 'evaluating',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => event.output,
          ),
        },
        onError: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => ({
              type: 'kernelError',
              error: event.error instanceof Error ? event.error.message : 'Unknown error occurred',
            }),
          ),
        },
      },
    },

    evaluating: {
      invoke: {
        src: 'evaluateCodeActor',
        input({ context, event }) {
          // The parseParametersActor returns an object without typing. There might be a better way to do this.
          const typedEvent = event as { type: string; output: OutputFrom<typeof parseParametersActor> };
          assertEvent(typedEvent.output, 'parametersParsed');
          return {
            context,
            event: typedEvent.output,
          };
        },
        onDone: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => event.output,
          ),
        },
        onError: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => ({
              type: 'kernelError',
              error: event.error instanceof Error ? event.error.message : 'Unknown error occurred',
            }),
          ),
        },
      },
    },

    exporting: {
      invoke: {
        src: 'exportGeometryActor',
        input: ({ context, event }) => ({
          context,
          event: {
            format: (event as { format: string }).format,
          },
        }),
        onDone: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => event.output,
          ),
        },
        onError: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => ({
              type: 'kernelError',
              error: event.error instanceof Error ? event.error.message : 'Unknown error occurred',
            }),
          ),
        },
      },
    },
  },
});
