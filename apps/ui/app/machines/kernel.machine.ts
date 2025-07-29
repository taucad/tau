import { assign, assertEvent, setup, sendTo, fromPromise } from 'xstate';
import type { Snapshot, ActorRef, OutputFrom, DoneActorEvent } from 'xstate';
import { proxy, wrap } from 'comlink';
import type { Remote } from 'comlink';
import { isBrowser } from 'motion/react';
import type { Geometry } from '~/types/cad.types.js';
import type { ExportFormat, KernelError, KernelProvider } from '~/types/kernel.types.js';
import { isKernelSuccess } from '~/types/kernel.types.js';
import type { ReplicadWorkerInterface as ReplicadWorker } from '~/components/geometry/kernel/replicad/replicad.worker.js';
import ReplicadBuilderWorker from '~/components/geometry/kernel/replicad/replicad.worker.js?worker';
import type { OpenScadBuilderInterface as OpenScadWorker } from '~/components/geometry/kernel/openscad/openscad.worker.js';
import OpenScadBuilderWorker from '~/components/geometry/kernel/openscad/openscad.worker.js?worker';
import type { ZooBuilderInterface as ZooWorker } from '~/components/geometry/kernel/zoo/zoo.worker.js';
import ZooBuilderWorker from '~/components/geometry/kernel/zoo/zoo.worker.js?worker';
import { assertActorDoneEvent } from '~/lib/xstate.js';
import type { LogLevel, LogOrigin, OnWorkerLog } from '~/types/console.types.js';

const workers = {
  replicad: ReplicadBuilderWorker,
  openscad: OpenScadBuilderWorker,
  zoo: ZooBuilderWorker,
} as const satisfies Partial<Record<KernelProvider, new () => Worker>>;

const createWorkersActor = fromPromise<
  { type: 'kernelInitialized' } | { type: 'kernelError'; error: KernelError },
  { context: KernelContext }
>(async ({ input }) => {
  const { context } = input;

  // In non-browser environments, fake an initialization
  if (!isBrowser) {
    return { type: 'kernelInitialized' };
  }

  // Clean up any existing workers
  if (context.workers.replicad) {
    context.workers.replicad.terminate();
  }

  if (context.workers.openscad) {
    context.workers.openscad.terminate();
  }

  if (context.workers.zoo) {
    context.workers.zoo.terminate();
  }

  try {
    // Create all workers
    // eslint-disable-next-line new-cap -- following type definitions
    const replicadWorker = new workers.replicad();
    // eslint-disable-next-line new-cap -- following type definitions
    const openscadWorker = new workers.openscad();
    // eslint-disable-next-line new-cap -- following type definitions
    const zooWorker = new workers.zoo();

    // Wrap all workers with comlink
    const wrappedReplicadWorker = wrap<ReplicadWorker>(replicadWorker);
    const wrappedOpenscadWorker = wrap<OpenScadWorker>(openscadWorker);
    const wrappedZooWorker = wrap<ZooWorker>(zooWorker);

    const onLog: OnWorkerLog = (log) => {
      if (context.parentRef) {
        context.parentRef.send({
          type: 'kernelLog',
          level: log.level,
          message: log.message,
          origin: log.origin,
          data: log.data,
        });
      }
    };

    // Initialize all workers with the default exception handling mode
    await Promise.all([
      wrappedReplicadWorker.initialize(proxy(onLog), { withExceptions: true }),
      wrappedOpenscadWorker.initialize(proxy(onLog), {}),
      wrappedZooWorker.initialize(proxy(onLog), { apiKey: '123' }),
    ]);

    // Store references to all workers
    context.workers.replicad = replicadWorker;
    context.workers.openscad = openscadWorker;
    context.workers.zoo = zooWorker;
    context.wrappedWorkers.replicad = wrappedReplicadWorker;
    context.wrappedWorkers.openscad = wrappedOpenscadWorker;
    context.wrappedWorkers.zoo = wrappedZooWorker;

    // Return success result
    return { type: 'kernelInitialized' };
  } catch (error) {
    // Handle initialization errors
    const errorMessage = error instanceof Error ? error.message : 'Failed to initialize workers';
    return {
      type: 'kernelError',
      error: {
        message: errorMessage,
        startLineNumber: 0,
        startColumn: 0,
        type: 'kernel',
      },
    };
  }
});

const parseParametersActor = fromPromise<
  | {
      type: 'parametersParsed';
      defaultParameters: Record<string, unknown>;
      code: string;
      parameters: Record<string, unknown>;
      jsonSchema: unknown;
      kernelType: KernelProvider;
    }
  | {
      type: 'kernelError';
      error: KernelError;
    },
  {
    context: KernelContext;
    event: { code: string; parameters: Record<string, unknown>; kernelType: KernelProvider };
  }
>(async ({ input }) => {
  const { context, event } = input;

  // Skip in non-browser environments
  if (!isBrowser) {
    return {
      type: 'kernelError',
      error: {
        message: 'Not in browser environment',
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  // Get the correct worker based on kernel type
  const wrappedWorker = context.wrappedWorkers[event.kernelType];

  if (!wrappedWorker) {
    return {
      type: 'kernelError',
      error: {
        message: `${event.kernelType} worker not initialized`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'compilation',
      },
    };
  }

  try {
    const parametersResult = await wrappedWorker.extractParameters(event.code);

    if (isKernelSuccess(parametersResult)) {
      const { defaultParameters, jsonSchema } = parametersResult.data as {
        defaultParameters: Record<string, unknown>;
        jsonSchema: unknown;
      };

      return {
        type: 'parametersParsed',
        defaultParameters,
        code: event.code,
        parameters: event.parameters,
        jsonSchema,
        kernelType: event.kernelType,
      };
    }

    // If extraction fails, return error from the worker
    return {
      type: 'kernelError',
      error: parametersResult.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Error extracting parameters';
    console.error('Error extracting parameters:', errorMessage);

    // If there's an unexpected error, use empty parameters as fallback
    return {
      type: 'parametersParsed',
      defaultParameters: {},
      code: event.code,
      parameters: event.parameters,
      jsonSchema: { type: 'object', properties: {} },
      kernelType: event.kernelType,
    };
  }
});

const evaluateCodeActor = fromPromise<
  | {
      type: 'geometryComputed';
      shapes: Geometry[];
    }
  | {
      type: 'kernelError';
      error: KernelError;
    },
  {
    context: KernelContext;
    event: {
      defaultParameters: Record<string, unknown>;
      parameters: Record<string, unknown>;
      code: string;
      kernelType: KernelProvider;
    };
  }
>(async ({ input }) => {
  const { context, event } = input;

  if (!isBrowser) {
    return {
      type: 'kernelError',
      error: {
        message: 'Not in browser environment',
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  // Get the correct worker based on kernel type
  const wrappedWorker = context.wrappedWorkers[event.kernelType];

  if (!wrappedWorker) {
    return {
      type: 'kernelError',
      error: {
        message: `${event.kernelType} worker not initialized`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  // Merge default parameters with provided parameters
  const mergedParameters = {
    ...event.defaultParameters,
    ...event.parameters,
  };

  const result = await wrappedWorker.computeGeometry(event.code, mergedParameters);

  // Handle the result pattern
  if (isKernelSuccess(result)) {
    return { type: 'geometryComputed', shapes: result.data };
  }

  return {
    type: 'kernelError',
    error: result.error,
  };
});

const exportGeometryActor = fromPromise<
  { type: 'geometryExported'; blob: Blob; format: ExportFormat } | { type: 'geometryExportFailed'; error: KernelError },
  { context: KernelContext; event: { format: ExportFormat; kernelType: KernelProvider } }
>(async ({ input }) => {
  const { context, event } = input;

  // Skip in non-browser environments
  if (!isBrowser) {
    return {
      type: 'geometryExportFailed',
      error: {
        message: 'Not in browser environment',
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  // Get the correct worker based on kernel type
  const wrappedWorker = context.wrappedWorkers[event.kernelType];

  if (!wrappedWorker) {
    return {
      type: 'geometryExportFailed',
      error: {
        message: `${event.kernelType} worker not initialized`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  try {
    const { format } = event;
    const supportedFormats = await wrappedWorker.getSupportedExportFormats();
    if (!supportedFormats.includes(format)) {
      return {
        type: 'geometryExportFailed',
        error: {
          message: `Unsupported export format: ${format}`,
          startLineNumber: 0,
          startColumn: 0,
          type: 'runtime',
        },
      };
    }

    // TODO: add a proper type guard for the export format
    const result = await wrappedWorker.exportGeometry(format as never);

    if (isKernelSuccess(result)) {
      const { data } = result;
      if (Array.isArray(data) && data.length > 0 && data[0]?.blob) {
        // TODO: Handle multiple blobs during export
        return { type: 'geometryExported', blob: data[0].blob, format };
      }

      return {
        type: 'geometryExportFailed',
        error: {
          message: 'No geometry data to export',
          startLineNumber: 0,
          startColumn: 0,
          type: 'runtime',
        },
      };
    }

    console.log('Got Export Error', result);

    return {
      type: 'geometryExportFailed',
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to export shape';
    return {
      type: 'geometryExportFailed',
      error: {
        message: errorMessage,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }
});

export type CadActor = ActorRef<Snapshot<unknown>, KernelEventExternal>;

// Define the actors that the machine can invoke
const kernelActors = {
  createWorkersActor,
  parseParametersActor,
  evaluateCodeActor,
  exportGeometryActor,
} as const;
type KernelActorNames = keyof typeof kernelActors;

// Define the types of events the machine can receive
type KernelEventInternal =
  | { type: 'initializeKernel'; parentRef: CadActor }
  | { type: 'computeGeometry'; code: string; parameters: Record<string, unknown>; kernelType: KernelProvider }
  | { type: 'parseParameters'; code: string; kernelType: KernelProvider }
  | { type: 'exportGeometry'; format: ExportFormat; kernelType: KernelProvider };

// Define the events that the workers can send to the kernel machine
type KernelEventWorker = {
  type: 'kernelLog';
  level: LogLevel;
  message: string;
  origin?: LogOrigin;
  data?: unknown;
};

// The kernel machine simply sends the output of the actors to the parent machine.
export type KernelEventExternal = OutputFrom<(typeof kernelActors)[KernelActorNames]> | KernelEventWorker;
type KernelEventExternalDone = DoneActorEvent<KernelEventExternal, KernelActorNames>;

type KernelEvent = KernelEventExternalDone | KernelEventInternal;

// Interface defining the context for the Kernel machine
type KernelContext = {
  workers: Record<KernelProvider, Worker | undefined>;
  wrappedWorkers: Record<KernelProvider, Remote<ReplicadWorker | OpenScadWorker | ZooWorker> | undefined>;
  parentRef?: CadActor;
  currentKernelType?: KernelProvider;
};

/**
 * Kernel Machine
 *
 * This machine manages the WebWorkers that run the CAD operations:
 * - Initializes both replicad and openscad workers
 * - Handles communication with the correct worker based on kernel type
 * - Processes results from CAD operations
 *
 * The machine's computation is purely stateless. It only manages the workers and the events it sends to the parent machine.
 * The parent machine is responsible for the state of the CAD operations.
 */
export const kernelMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as KernelContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as KernelEvent,
  },
  actors: kernelActors,
  actions: {
    registerParentRef: assign({
      parentRef({ event }) {
        assertEvent(event, 'initializeKernel');
        return event.parentRef;
      },
    }),
    setCurrentKernelType: assign({
      currentKernelType({ event }) {
        assertEvent(event, 'computeGeometry');
        return event.kernelType;
      },
    }),
    async destroyWorkers({ context }) {
      if (context.workers.replicad) {
        await context.wrappedWorkers.replicad?.cleanup();
        context.workers.replicad.terminate();
        context.workers.replicad = undefined;
        context.wrappedWorkers.replicad = undefined;
      }

      if (context.workers.openscad) {
        await context.wrappedWorkers.openscad?.cleanup();
        context.workers.openscad.terminate();
        context.workers.openscad = undefined;
        context.wrappedWorkers.openscad = undefined;
      }

      if (context.workers.zoo) {
        await context.wrappedWorkers.zoo?.cleanup();
        context.workers.zoo.terminate();
        context.workers.zoo = undefined;
        context.wrappedWorkers.zoo = undefined;
      }
    },
  },
  guards: {
    isKernelError({ event }) {
      assertActorDoneEvent(event);
      return event.output.type === 'kernelError';
    },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QGswCcB2YA2A6AlhvgC74CG2+AXoVAMSEnmVWQDaADALqKgAOAe1hMBGXiAAeiAEwA2AJy4AzBwCMqgCwrZ0gByzVSgDQgAnogCsujbmnyOG1bvlKlegOy6Avl5OpMOAREpBTUtHToaAJonDxIIILCpKLiUgiyWsrSSupy8hYq7u4m5ghu0riq7vIZ8qoc2dIWFj5+6Fh4aGBkEKZ0AMYCALZ8AK7EYADiYMNgxGimseKJImLxafIaFfYcsrsaGrLuByWILu64W1VFug1uukqtIP4duF09fWASgmjE07PzRbcZZCVapRCqbIWXAFSEaXSqfLVdyyU4IaqyGG6awWVR7QzHeRPF6BL4-UgYegwAELACi32iEwgS3iK2Sa1AaU0Gg4uGRSns0k08jkxjMiHuuBFNQFKg48ncSlkxPapIZv3CkWiLP4oPZ4IQ9QyuH0+gO6luejRTmhRQFegF+SVmxVATwZMZkDoElgxDIE1wZAAZhM0AAKDgASjoJPd6qZOoSevwKXWEKs0Ic5Q4uIs0hRxXFCHyFQFDwK0gO8qVrtefDIaGElLo9bQZCGc3QsAACg3YOxgazk6nORLeSjnSKlMdXEp9GihZjdO4OBwlXj4dda4FW036FqYoPdUkUxzJIhbhc4Qr5ccGhZUUWRSbCc55c5ZJ-vL5nqr3QA3ChRn9cJqQ7QEAGFhjGBMjyTE8R3PMpblwPYlFhDR3DzEVKzRZcLg4Fc8ycHMDAsDRtwAoCQObA9EzZU8DT2aE5AaWQrEaGU0S2RQLEIrCFB0AoOAeSjcDAQDsGAplvV9f0wEDEN0AjaNY3EyTpIHOJjzBNMEF0SspUVSFBUOeVpDwzwYSIppPE8GUxIPAZoPGKYZnAhZ6OHM80gnSpywsGo+OCsVSnhJQYWkOQEQRJoHFkR4fzUpyPV+f4PKBbT4N00dDQaGwinqfjFXI0KJSiyoMTnAyDgKb82jdcS0CiNAGGCZhqDALyEJ8yxAtQix3EhbQUUvBc8RfVcH3caRSPqb8fwwAQIDgcRYxBHqDQAWkRbZMMcQ4US2B40WhacNHkewtAUET9jExgQhYWgNpypCmgqG5mnxOpDmaBd8lsA59ErHQqk-MT3l6F79T0+oAcwlcXAUREGjwxEYXYtQeSiiikr-cT42eodNthuQl3Q-IFT2TZdjRdDVClXZZqqIVLt0QbHPjSBocY2GOJhWVVFxaqql0NFPwuZoHhmxVqluRKGrrPsiZ0mHcp2g4pX2zQjgyB1rSVE0Es8diLv0PZlTxxqJOoikoB5xC0kcXRKkRKp1GOOx2O4vNLmsFQ6lI6xDEcjT5IgB3evSVwjJcL6DDxZc0R2XAHBXawos-HkFd-a3muiSODQRaEJZlPZl3kE6iyUDRoSFnQ1Erci7PcHwfCAA */
  id: 'kernel',
  context: {
    workers: {
      replicad: undefined,
      openscad: undefined,
      zoo: undefined,
    },
    wrappedWorkers: {
      replicad: undefined,
      openscad: undefined,
      zoo: undefined,
    },
    parentRef: undefined,
    currentKernelType: undefined,
  },
  initial: 'initializing',
  exit: ['destroyWorkers'],
  states: {
    initializing: {
      on: {
        initializeKernel: {
          target: 'creatingWorkers',
          actions: 'registerParentRef',
        },
      },
    },

    creatingWorkers: {
      invoke: {
        id: 'createWorkersActor',
        src: 'createWorkersActor',
        input({ context }) {
          return { context };
        },
        onDone: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => event.output,
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
      // Allow cancelling inflight operations
      on: {
        computeGeometry: {
          target: 'parsing',
        },
        exportGeometry: {
          target: 'exporting',
        },
      },
      invoke: {
        id: 'parseParametersActor',
        src: 'parseParametersActor',
        input({ context, event }) {
          assertEvent(event, 'computeGeometry');
          return {
            context,
            event,
          };
        },
        onDone: [
          {
            target: 'ready',
            guard: 'isKernelError',
            actions: sendTo(
              ({ context }) => context.parentRef!,
              ({ event }) => event.output,
            ),
          },
          {
            target: 'evaluating',
            actions: sendTo(
              ({ context }) => context.parentRef!,
              ({ event }) => event.output,
            ),
          },
        ],
      },
    },

    evaluating: {
      // Allow cancelling inflight operations
      on: {
        computeGeometry: {
          target: 'parsing',
        },
        exportGeometry: {
          target: 'exporting',
        },
      },
      invoke: {
        id: 'evaluateCodeActor',
        src: 'evaluateCodeActor',
        input({ context, event }) {
          assertEvent(event, 'xstate.done.actor.parseParametersActor');
          assertEvent(event.output, 'parametersParsed');
          return {
            context,
            event: event.output,
          };
        },
        onDone: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => event.output,
          ),
        },
      },
    },

    exporting: {
      // Allow cancelling inflight operations
      on: {
        computeGeometry: {
          target: 'parsing',
        },
        exportGeometry: {
          target: 'exporting',
        },
      },
      invoke: {
        id: 'exportGeometryActor',
        src: 'exportGeometryActor',
        input({ context, event }) {
          assertEvent(event, 'exportGeometry');
          return {
            context,
            event,
          };
        },
        onDone: {
          target: 'ready',
          actions: sendTo(
            ({ context }) => context.parentRef!,
            ({ event }) => event.output,
          ),
        },
      },
    },
  },
});
