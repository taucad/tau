import { assign, assertEvent, setup, sendTo, fromPromise, waitFor } from 'xstate';
import deepmerge from 'deepmerge';
import type { Snapshot, ActorRef, OutputFrom, DoneActorEvent, ActorRefFrom } from 'xstate';
import { proxy, wrap, transfer, createEndpoint } from 'comlink';
import type { Remote } from 'comlink';
import type {
  Geometry,
  ExportFormat,
  KernelError,
  KernelProvider as CadKernelProvider,
  GeometryFile,
} from '@taucad/types';
import { isKernelSuccess } from '@taucad/types/guards';
import type { JSONSchema7 } from 'json-schema';
import type { ReplicadWorkerInterface as ReplicadWorker } from '#components/geometry/kernel/replicad/replicad.worker.types.js';
import ReplicadBuilderWorker from '#components/geometry/kernel/replicad/replicad.worker.js?worker';
import type { OpenScadBuilderInterface as OpenScadWorker } from '#components/geometry/kernel/openscad/openscad.worker.types.js';
import OpenScadBuilderWorker from '#components/geometry/kernel/openscad/openscad.worker.js?worker';
import type { ZooBuilderInterface as ZooWorker } from '#components/geometry/kernel/zoo/zoo.worker.types.js';
import ZooBuilderWorker from '#components/geometry/kernel/zoo/zoo.worker.js?worker';
import type { TauWorkerInterface as TauWorker } from '#components/geometry/kernel/tau/tau.worker.types.js';
import TauBuilderWorker from '#components/geometry/kernel/tau/tau.worker.js?worker';
import type { JscadWorkerInterface as JscadWorker } from '#components/geometry/kernel/jscad/jscad.worker.types.js';
import JscadBuilderWorker from '#components/geometry/kernel/jscad/jscad.worker.js?worker';
import { assertActorDoneEvent } from '#lib/xstate.js';
import type { LogLevel, LogOrigin, OnWorkerLog } from '#types/console.types.js';
import { ENV } from '#config.js';
import type { FileManagerMachine } from '#machines/file-manager.machine.js';

type KernelProvider = CadKernelProvider | 'tau' | 'jscad';

// Module-level cache for worker selection
const workerSelectionCache = new Map<string, KernelProvider>();

// Worker priority order for canHandle queries
const workerPriority: KernelProvider[] = ['openscad', 'zoo', 'replicad', 'jscad', 'tau'];

function getCacheKey(file: GeometryFile): string {
  return file.filename;
}

const workers = {
  replicad: ReplicadBuilderWorker,
  openscad: OpenScadBuilderWorker,
  zoo: ZooBuilderWorker,
  tau: TauBuilderWorker,
  jscad: JscadBuilderWorker,
} as const satisfies Partial<Record<KernelProvider, new () => Worker>>;

const determineWorkerActor = fromPromise<
  | { type: 'workerDetermined'; worker: KernelProvider; parameters: Record<string, unknown>; file: GeometryFile }
  | { type: 'kernelError'; error: KernelError },
  { context: KernelContext; event: { file: GeometryFile; parameters: Record<string, unknown> } }
>(async ({ input }) => {
  const { context, event } = input;
  const cacheKey = getCacheKey(event.file);

  // Check cache
  const cached = workerSelectionCache.get(cacheKey);
  if (cached) {
    return { type: 'workerDetermined', worker: cached, parameters: event.parameters, file: event.file };
  }

  // Query workers in priority order
  for (const workerType of workerPriority) {
    const worker = context.wrappedWorkers[workerType];
    if (!worker) {
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop -- Need to check workers sequentially
      const canHandle = await worker.canHandleEntry(event.file);
      if (canHandle) {
        workerSelectionCache.set(cacheKey, workerType);
        return { type: 'workerDetermined', worker: workerType, parameters: event.parameters, file: event.file };
      }
    } catch (error) {
      // Log but continue to next worker
      console.warn(`Worker ${workerType} canHandle error:`, error);
    }
  }

  // No worker found
  return {
    type: 'kernelError',
    error: {
      message: `No kernel can handle file: ${event.file.filename}`,
      startLineNumber: 0,
      startColumn: 0,
      type: 'runtime',
    },
  };
});

const createWorkersActor = fromPromise<
  { type: 'kernelInitialized' } | { type: 'kernelError'; error: KernelError },
  { context: KernelContext }
>(async ({ input }) => {
  const { context } = input;

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

  if (context.workers.tau) {
    context.workers.tau.terminate();
  }

  if (context.workers.jscad) {
    context.workers.jscad.terminate();
  }

  try {
    // Wait for file manager to be ready and extract the wrapped worker
    if (!context.fileManagerRef) {
      return {
        type: 'kernelError',
        error: { message: 'File manager actor not initialized', startLineNumber: 0, startColumn: 0, type: 'runtime' },
      };
    }

    const snapshot = await waitFor(context.fileManagerRef, (state) => state.matches('ready'));
    const fileManagerContext = snapshot.context;
    const wrappedFileManager = fileManagerContext.wrappedWorker;

    if (!wrappedFileManager) {
      return {
        type: 'kernelError',
        error: { message: 'File manager worker not initialized', startLineNumber: 0, startColumn: 0, type: 'runtime' },
      };
    }

    // Create all workers
    // eslint-disable-next-line new-cap -- following type definitions
    const replicadWorker = new workers.replicad();
    // eslint-disable-next-line new-cap -- following type definitions
    const openscadWorker = new workers.openscad();
    // eslint-disable-next-line new-cap -- following type definitions
    const zooWorker = new workers.zoo();
    // eslint-disable-next-line new-cap -- following type definitions
    const tauWorker = new workers.tau();
    // eslint-disable-next-line new-cap -- following type definitions
    const jscadWorker = new workers.jscad();

    // Wrap all workers with comlink
    const wrappedReplicadWorker = wrap<ReplicadWorker>(replicadWorker);
    const wrappedOpenscadWorker = wrap<OpenScadWorker>(openscadWorker);
    const wrappedZooWorker = wrap<ZooWorker>(zooWorker);
    const wrappedTauWorker = wrap<TauWorker>(tauWorker);
    const wrappedJscadWorker = wrap<JscadWorker>(jscadWorker);

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
    // Initialize all workers with optional file manager ports for direct communication
    // Create dedicated MessagePort endpoints for each worker for direct communication
    const replicadPort = await wrappedFileManager[createEndpoint]();
    const openscadPort = await wrappedFileManager[createEndpoint]();
    const zooPort = await wrappedFileManager[createEndpoint]();
    const tauPort = await wrappedFileManager[createEndpoint]();
    const jscadPort = await wrappedFileManager[createEndpoint]();

    // Initialize all workers with callbacks (proxied), transferables (MessagePorts), and options
    await Promise.all([
      wrappedReplicadWorker.initializeEntry(
        proxy({ onLog }),
        transfer({ fileManagerPort: replicadPort }, [replicadPort]),
        { withExceptions: false },
      ),
      wrappedOpenscadWorker.initializeEntry(
        proxy({ onLog }),
        transfer({ fileManagerPort: openscadPort }, [openscadPort]),
        {},
      ),
      wrappedZooWorker.initializeEntry(proxy({ onLog }), transfer({ fileManagerPort: zooPort }, [zooPort]), {
        apiKey: ENV.ZOO_API_KEY ?? '',
      }),
      wrappedTauWorker.initializeEntry(proxy({ onLog }), transfer({ fileManagerPort: tauPort }, [tauPort]), {}),
      wrappedJscadWorker.initializeEntry(proxy({ onLog }), transfer({ fileManagerPort: jscadPort }, [jscadPort]), {}),
    ]);

    // Store references to all workers
    context.workers.replicad = replicadWorker;
    context.workers.openscad = openscadWorker;
    context.workers.zoo = zooWorker;
    context.workers.tau = tauWorker;
    context.workers.jscad = jscadWorker;
    context.wrappedWorkers.replicad = wrappedReplicadWorker;
    context.wrappedWorkers.openscad = wrappedOpenscadWorker;
    context.wrappedWorkers.zoo = wrappedZooWorker;
    context.wrappedWorkers.tau = wrappedTauWorker;
    context.wrappedWorkers.jscad = wrappedJscadWorker;

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
      file: GeometryFile;
      parameters: Record<string, unknown>;
      jsonSchema: JSONSchema7;
    }
  | {
      type: 'kernelError';
      error: KernelError;
    },
  {
    context: KernelContext;
    event: { file: GeometryFile; parameters: Record<string, unknown> };
  }
>(async ({ input }) => {
  const { context, event } = input;
  const { selectedWorker } = context;
  const { file } = event;

  // Get the correct worker based on selected worker
  if (!selectedWorker) {
    return {
      type: 'kernelError',
      error: {
        message: 'No worker selected',
        startLineNumber: 0,
        startColumn: 0,
        type: 'compilation',
      },
    };
  }

  const wrappedWorker = context.wrappedWorkers[selectedWorker];

  if (!wrappedWorker) {
    return {
      type: 'kernelError',
      error: {
        message: `${selectedWorker} worker not initialized`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'compilation',
      },
    };
  }

  try {
    const parametersResult = await wrappedWorker.extractParametersEntry(file);

    if (isKernelSuccess(parametersResult)) {
      const { defaultParameters, jsonSchema } = parametersResult.data as {
        defaultParameters: Record<string, unknown>;
        jsonSchema: JSONSchema7;
      };

      return {
        type: 'parametersParsed',
        defaultParameters,
        file,
        parameters: event.parameters,
        jsonSchema,
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
      file,
      parameters: event.parameters,
      jsonSchema: { type: 'object', properties: {} },
    };
  }
});

const evaluateCodeActor = fromPromise<
  | {
      type: 'geometryComputed';
      geometries: Geometry[];
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
      file: GeometryFile;
    };
  }
>(async ({ input }) => {
  const { context, event } = input;
  const { selectedWorker } = context;
  const { file, defaultParameters, parameters } = event;

  // Get the correct worker based on selected worker
  if (!selectedWorker) {
    return {
      type: 'kernelError',
      error: {
        message: 'No worker selected',
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  const wrappedWorker = context.wrappedWorkers[selectedWorker];

  if (!wrappedWorker) {
    return {
      type: 'kernelError',
      error: {
        message: `${selectedWorker} worker not initialized`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  // Merge default parameters with provided parameters
  const mergedParameters = deepmerge(defaultParameters, parameters);

  const result = await wrappedWorker.computeGeometryEntry(file, mergedParameters);

  // Handle the result pattern
  if (isKernelSuccess(result)) {
    return { type: 'geometryComputed', geometries: result.data };
  }

  return {
    type: 'kernelError',
    error: result.error,
  };
});

const exportGeometryActor = fromPromise<
  { type: 'geometryExported'; blob: Blob; format: ExportFormat } | { type: 'geometryExportFailed'; error: KernelError },
  { context: KernelContext; event: { format: ExportFormat } }
>(async ({ input }) => {
  const { context, event } = input;
  const { selectedWorker } = context;
  const { format } = event;

  // Get the correct worker based on selected worker
  if (!selectedWorker) {
    return {
      type: 'geometryExportFailed',
      error: {
        message: 'No worker selected',
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  const wrappedWorker = context.wrappedWorkers[selectedWorker];

  if (!wrappedWorker) {
    return {
      type: 'geometryExportFailed',
      error: {
        message: `${selectedWorker} worker not initialized`,
        startLineNumber: 0,
        startColumn: 0,
        type: 'runtime',
      },
    };
  }

  try {
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
    const result = await wrappedWorker.exportGeometryEntry(format as never);

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

    return {
      type: 'geometryExportFailed',
      error: result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to export geometry';
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
  determineWorkerActor,
  parseParametersActor,
  evaluateCodeActor,
  exportGeometryActor,
} as const;
type KernelActorNames = keyof typeof kernelActors;

// Define the types of events the machine can receive
type KernelEventInternal =
  | { type: 'initializeKernel'; parentRef: CadActor }
  | { type: 'computeGeometry'; file: GeometryFile; parameters: Record<string, unknown> }
  | { type: 'exportGeometry'; format: ExportFormat };

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
  wrappedWorkers: Record<
    KernelProvider,
    Remote<ReplicadWorker | OpenScadWorker | ZooWorker | TauWorker | JscadWorker> | undefined
  >;
  parentRef?: CadActor;
  selectedWorker?: KernelProvider;
  fileManagerRef?: ActorRefFrom<FileManagerMachine>;
};

type KernelInput = {
  fileManagerRef?: ActorRefFrom<FileManagerMachine>;
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
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as KernelInput,
  },
  actors: kernelActors,
  actions: {
    registerParentRef: assign({
      parentRef({ event }) {
        assertEvent(event, 'initializeKernel');
        return event.parentRef;
      },
    }),

    setSelectedWorker: assign({
      selectedWorker({ event }) {
        assertActorDoneEvent(event);
        // Guard already filtered out errors, so we know this is workerDetermined
        if (event.output.type === 'workerDetermined') {
          return event.output.worker;
        }

        return undefined;
      },
    }),
    async destroyWorkers({ context }) {
      if (context.workers.replicad) {
        await context.wrappedWorkers.replicad?.cleanupEntry();
        context.workers.replicad.terminate();
        context.workers.replicad = undefined;
        context.wrappedWorkers.replicad = undefined;
      }

      if (context.workers.openscad) {
        await context.wrappedWorkers.openscad?.cleanupEntry();
        context.workers.openscad.terminate();
        context.workers.openscad = undefined;
        context.wrappedWorkers.openscad = undefined;
      }

      if (context.workers.zoo) {
        await context.wrappedWorkers.zoo?.cleanupEntry();
        context.workers.zoo.terminate();
        context.workers.zoo = undefined;
        context.wrappedWorkers.zoo = undefined;
      }

      if (context.workers.tau) {
        await context.wrappedWorkers.tau?.cleanupEntry();
        context.workers.tau.terminate();
        context.workers.tau = undefined;
        context.wrappedWorkers.tau = undefined;
      }

      if (context.workers.jscad) {
        await context.wrappedWorkers.jscad?.cleanupEntry();
        context.workers.jscad.terminate();
        context.workers.jscad = undefined;
        context.wrappedWorkers.jscad = undefined;
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
  context: ({ input }) => ({
    workers: {
      replicad: undefined,
      openscad: undefined,
      zoo: undefined,
      tau: undefined,
      jscad: undefined,
    },
    wrappedWorkers: {
      replicad: undefined,
      openscad: undefined,
      zoo: undefined,
      tau: undefined,
      jscad: undefined,
    },
    parentRef: undefined,
    selectedWorker: undefined,
    fileManagerRef: input.fileManagerRef,
  }),
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
          target: 'determiningWorker',
        },
        exportGeometry: {
          target: 'exporting',
        },
      },
    },

    determiningWorker: {
      // Allow cancelling inflight operations
      on: {
        computeGeometry: {
          target: 'determiningWorker',
        },
        exportGeometry: {
          target: 'exporting',
        },
      },
      invoke: {
        id: 'determineWorkerActor',
        src: 'determineWorkerActor',
        input({ context, event }) {
          assertEvent(event, 'computeGeometry');
          return {
            context,
            event: { file: event.file, parameters: event.parameters },
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
            target: 'parsing',
            actions: 'setSelectedWorker',
          },
        ],
      },
    },

    parsing: {
      // Allow cancelling inflight operations
      on: {
        computeGeometry: {
          target: 'determiningWorker',
        },
        exportGeometry: {
          target: 'exporting',
        },
      },
      invoke: {
        id: 'parseParametersActor',
        src: 'parseParametersActor',
        input({ context, event }) {
          assertEvent(event, 'xstate.done.actor.determineWorkerActor');
          assertEvent(event.output, 'workerDetermined');
          return {
            context,
            event: {
              file: event.output.file,
              parameters: event.output.parameters,
            },
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
          target: 'determiningWorker',
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
          target: 'determiningWorker',
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
