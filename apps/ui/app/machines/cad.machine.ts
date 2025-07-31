import { assign, assertEvent, setup, sendTo, emit, enqueueActions } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { kernelMachine } from '#machines/kernel.machine.js';
import type { KernelEventExternal } from '#machines/kernel.machine.js';
import type { CodeError, Geometry } from '#types/cad.types.js';
import type { ExportFormat, KernelError, KernelProvider } from '#types/kernel.types.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { logMachine } from '#machines/logs.machine.js';

// Interface defining the context for the CAD machine
export type CadContext = {
  code: string;
  screenshot: string | undefined;
  parameters: Record<string, unknown>;
  defaultParameters: Record<string, unknown>;
  geometries: Geometry[];
  kernelError: KernelError | undefined;
  codeErrors: CodeError[];
  kernelRef: ActorRefFrom<typeof kernelMachine>;
  exportedBlob: Blob | undefined;
  shouldInitializeKernelOnStart: boolean;
  isKernelInitializing: boolean;
  isKernelInitialized: boolean;
  graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
  logActorRef?: ActorRefFrom<typeof logMachine>;
  jsonSchema?: unknown;
  kernelTypeSelected: KernelProvider;
};

// Define the types of events the machine can receive
type CadEvent =
  | { type: 'initializeKernel' }
  | { type: 'initializeModel'; code: string; parameters: Record<string, unknown>; kernelType: KernelProvider }
  | { type: 'setCode'; code: string; screenshot?: string }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setCodeErrors'; errors: CadContext['codeErrors'] }
  | { type: 'exportGeometry'; format: ExportFormat }
  | KernelEventExternal;

type CadEmitted =
  | { type: 'modelUpdated'; code: string; parameters: Record<string, unknown> }
  | { type: 'geometryEvaluated'; geometries: Geometry[] }
  | { type: 'geometryExported'; blob: Blob; format: ExportFormat }
  | { type: 'exportFailed'; error: KernelError };

type CadInput = {
  shouldInitializeKernelOnStart: boolean;
  graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
  logActorRef?: ActorRefFrom<typeof logMachine>;
};

// Debounce delay for code changes in milliseconds
const debounceDelay = 500;

/**
 * CAD Machine
 *
 * This machine manages the state of the CAD editor:
 * - Handles code and parameter changes
 * - Debounces compilation requests
 * - Tracks compilation status
 * - Manages errors
 */
export const cadMachine = setup({
  /** @xstate-layout N4IgpgJg5mDOIC5QGMCGEB0AnM6CeAxLGAC4DCA9hGANoAMAuoqAA4WwCWJHFAdsyAAeiAGwBWAIwY6ADjEBOGQCY6AdhmqAzDIkAaEHkRil8jABYTquvKVKJZ8TIC+T-Wkw58RUgAVUWVABbUjAsWHomJBA2Tm4+AWEEcSlZBWU1DW09A1FjDBlNBWSZMzoHeRc3dGxcCEJiEgBZPlRkCgBRLCwKMIiBGK4efijEszE6fLNNVRsx0rExfUMEMWmMCWtNeSm1OwLKkHcarwaAETAAM1QAVwAbEj8A4JJQ8MZ+9kH4kcQpzXzCvIxCVthsRJolr9ShhxCIlHCzBIJDYNpoDkdPHUCGBBGwsCQAMoAC1QLFo7yiAziw1AoxEIhhqmB9hEVnBhUhCE0ZjMGBUmgkmjoknpSmmaNch2qmPqJLJ7VxPReED6lM+1ISvzEDIsEhk8nkElUG3kmm5nKUZlUGFUZgNijhgvhU3R1QARtcLhdQhxeFBvOQqOTIqx1UNNQhDUppMixDNZLH7JzBXRoyUtJpbAtEQ5XZgPV6fX6A48giFehTQ7Fwz8EPro3Q6FsRE644azMmVAythZG5oRHQkVo8xgC96sL7-Q1mrxWh0uj03iHomHvrTEDJlIz5EzrGYdC2OzkEEjrBhQXQRCURPulCOx0Wp6Rzlc7g9-GWXhXl1Sa+u6+IjLIhIIiKMoEjwsmg7-PuMz9tqQK2M4kpHA+E7FjieKEnKwYfNWa5CBuigYJIRpaCBVpbPInKGtaTb7mUrIWEo2r3p646TkQOEKlhkCqlWXw0oRdabnycZyKo9KSAaqicukJEHqoSiqOoNglGxhbof6giwCQqAvBgqAXF+AAU4x0AAlAQqHsY+-ErvhQmJFevI3pem5bIOMjiJ2MjmPa8g3raPKmiOOC8NQWkEAA1qEvBgLcBLXMgyBwEueGCRG8KmCxjZisCDgCjInJwv84zwiY2gtvlYVgBFj4xXFCWdN0WD2b+BGJNlYl5YU15FcmFhiOexq6ipQoyKmtX1VFDSUNQ7Wrk5iDdblqZ9YVeqcuo-ypIF8jWJNqwiNNkWcQ0pbPK8i2OVloE9etBXgltx4HTqNhZpel7cidKHSnVZ3FtOLRtC1i43ZltYKNIGRmkCBqwSVMwKUU-bwuZZinQ1ZyXDc9yXeW6VqrdtYWJywL-E6BRGgK-J3n9HgAw1mFKsSpK4cTkP-raAKKNqRriMpL3LPuDKsvtiiAsKyFVIzM3ndxir4nxlYOVzwk3ij2yXpJihspynl8uj4ulAOcgjqErUBvNHMCRqtbJNIciKCo6haDoyZmlI+pyIOZvMaoFsLlgJYfld34Zfb-6O3t6Ru1kg0LBgQpWnGcYbE2v2yxgls9AGM5zmDEec1HwljBMJTTLMYjzIsx6ClsJHqHq9KgkyQdWzjr542HhMQ6XoxmgCCgFRe4KdlM6y5TXMybipgcMznwfYkr2Hs-3f5l-SjLMg4bJmnXyxIg4QEfQdfXCh3eewIrvEqqrHXLQgYw6nsBpGiaZpQeMfJ6jMGfKAKPTSUvAgzwCiO4SOm9EgAFoRCcjgTDRsgoFAqGFCBS+i8ZRQM6r8OE54SilEFFYfs4J4HHnBH5bULEKqpkkAsDSHE-Q4KfvqXk6RATeR5EpWS9cphSBYn1cCMwgRiCxlpFhEZjTrH3DyJQGg4QDmFNtHQ0hPKiLsDMFSV8sCSNJvgxQPJoIkPpBCPhiI1GCj1MCbYSlgFOCAA */
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as CadContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as CadEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    input: {} as CadInput,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    emitted: {} as CadEmitted,
  },
  actions: {
    computeGeometry: sendTo(
      ({ context }) => context.kernelRef,
      ({ context }) => {
        return {
          type: 'computeGeometry',
          code: context.code,
          parameters: context.parameters,
          kernelType: context.kernelTypeSelected,
        };
      },
    ),
    exportGeometry: sendTo(
      ({ context }) => context.kernelRef,
      ({ context, event }) => {
        assertEvent(event, 'exportGeometry');
        return {
          type: 'exportGeometry',
          format: event.format,
          kernelType: context.kernelTypeSelected,
        };
      },
    ),
    sendKernelLogs: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'kernelLog');
      if (context.logActorRef) {
        enqueue.sendTo(context.logActorRef, {
          type: 'addLog',
          message: event.message,
          options: {
            level: event.level,
            origin: event.origin,
            data: event.data,
          },
        });
      }
    }),
    setCode: assign({
      code({ event }) {
        assertEvent(event, 'setCode');
        return event.code;
      },
      screenshot({ event }) {
        assertEvent(event, 'setCode');
        return event.screenshot;
      },
    }),
    setParameters: assign({
      parameters({ event }) {
        assertEvent(event, 'setParameters');
        return event.parameters;
      },
    }),
    modelUpdated: emit(({ context }) => ({
      type: 'modelUpdated' as const,
      code: context.code,
      parameters: context.parameters,
    })),
    setGeometries: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'geometryComputed');
      enqueue.assign({
        geometries: event.geometries,
        kernelError: undefined,
      });
      enqueue.emit({
        type: 'geometryEvaluated' as const,
        geometries: event.geometries,
      });
      // Send geometries to graphics machine
      if (context.graphicsRef) {
        enqueue.sendTo(context.graphicsRef, {
          type: 'updateGeometries',
          geometries: event.geometries,
        });
      }
    }),
    setKernelError: assign({
      kernelError({ event }) {
        assertEvent(event, 'kernelError');
        return event.error;
      },
    }),
    setCodeErrors: assign({
      codeErrors({ event }) {
        assertEvent(event, 'setCodeErrors');
        return event.errors;
      },
    }),
    setDefaultParameters: assign({
      defaultParameters({ event }) {
        assertEvent(event, 'parametersParsed');
        return event.defaultParameters;
      },
      jsonSchema({ event }) {
        assertEvent(event, 'parametersParsed');
        return event.jsonSchema;
      },
    }),
    setExportedBlob: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'geometryExported');
      enqueue.assign({
        exportedBlob: event.blob,
        kernelError: undefined,
      });
      enqueue.emit({
        type: 'geometryExported' as const,
        blob: event.blob,
        format: event.format,
      });
    }),
    setExportError: enqueueActions(({ enqueue, event }) => {
      assertEvent(event, 'geometryExportFailed');
      enqueue.assign({
        exportedBlob: undefined,
      });
      enqueue.emit({
        type: 'exportFailed' as const,
        error: event.error,
      });
    }),
    initializeKernel: enqueueActions(({ enqueue, context, self }) => {
      enqueue.assign({ isKernelInitializing: true });
      enqueue.sendTo(context.kernelRef, {
        type: 'initializeKernel' as const,
        parentRef: self,
      });
    }),
    initializeModel: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'initializeModel');

      if (context.logActorRef) {
        enqueue.sendTo(context.logActorRef, { type: 'clearLogs' });
      }

      enqueue.assign({
        code: event.code,
        parameters: event.parameters,
        codeErrors: [],
        kernelError: undefined,
        geometries: [],
        exportedBlob: undefined,
        jsonSchema: undefined,
        kernelTypeSelected: event.kernelType,
      });
    }),
  },
  guards: {
    isKernelInitialized: ({ context }) => context.isKernelInitialized,
    isKernelNotInitialized: ({ context }) => !context.isKernelInitialized,
    isKernelInitializing: ({ context }) => context.isKernelInitializing,
    hasModel: ({ context }) => context.code !== '',
  },
}).createMachine({
  id: 'cad',
  entry: enqueueActions(({ enqueue, context, self }) => {
    if (context.shouldInitializeKernelOnStart) {
      enqueue.sendTo(self, { type: 'initializeKernel' });
    }
  }),
  context: ({ input, spawn }) => ({
    code: '',
    screenshot: undefined,
    parameters: {},
    defaultParameters: {},
    geometries: [],
    kernelError: undefined,
    codeErrors: [],
    kernelRef: spawn(kernelMachine),
    exportedBlob: undefined,
    shouldInitializeKernelOnStart: input.shouldInitializeKernelOnStart,
    isKernelInitializing: false,
    isKernelInitialized: false,
    graphicsRef: input.graphicsRef,
    logActorRef: input.logActorRef,
    jsonSchema: undefined,
    kernelTypeSelected: 'openscad',
  }),
  initial: 'booting',
  states: {
    // The booting state is used when booting the kernel.
    booting: {
      on: {
        initializeKernel: {
          actions: 'initializeKernel',
        },
        initializeModel: [
          {
            guard: 'isKernelInitializing',
            // If the kernel is still initializing, only initialize the model.
            actions: ['initializeModel'],
          },
          {
            guard: 'isKernelNotInitialized',
            // If the kernel isn't already initialized, initialize it.
            actions: ['initializeModel', 'initializeKernel'],
          },
          {
            // We're ready to initialize the model and transition to the initializing state.
            target: 'initializing',
            actions: 'initializeModel',
          },
        ],
        kernelInitialized: [
          {
            // If we have a model, move to initialize the model.
            guard: 'hasModel',
            target: 'initializing',
            actions: assign({ isKernelInitialized: true, isKernelInitializing: false }),
          },
          {
            // Otherwise just set the kernel to initialized.
            actions: assign({ isKernelInitialized: true, isKernelInitializing: false }),
          },
        ],
        kernelError: {
          target: 'error',
          actions: 'setKernelError',
        },
        kernelLog: {
          actions: 'sendKernelLogs',
        },
      },
    },

    // The initialization state is used when a new model is loaded.
    initializing: {
      entry: 'computeGeometry',
      on: {
        initializeModel: {
          target: 'initializing',
          actions: 'initializeModel',
          reenter: true, // When another model is loaded whilst another is being initialized, reenter the state to begin computing the new model
        },
        kernelError: {
          target: 'error',
          actions: 'setKernelError',
        },
        geometryComputed: {
          target: 'ready',
          actions: 'setGeometries',
        },
        parametersParsed: {
          actions: 'setDefaultParameters',
        },
        kernelLog: {
          actions: 'sendKernelLogs',
        },
      },
    },
    ready: {
      on: {
        initializeModel: {
          target: 'initializing',
          actions: 'initializeModel',
        },
        setCode: {
          target: 'buffering',
          actions: 'setCode',
        },
        setParameters: {
          target: 'buffering',
          actions: 'setParameters',
        },
        setCodeErrors: {
          actions: 'setCodeErrors',
        },
        exportGeometry: {
          actions: 'exportGeometry',
        },
        geometryExported: {
          actions: 'setExportedBlob',
        },
        geometryExportFailed: {
          actions: 'setExportError',
        },
        kernelLog: {
          actions: 'sendKernelLogs',
        },
      },
    },
    // The buffering state debounces rapid code/parameter changes
    // When transitioning from initializing/rendering to buffering, XState automatically
    // cancels any inflight kernel invocations, ensuring latest changes take precedence.
    // Note: The worker may continue processing cancelled operations in the background,
    // but their results will be ignored by the promise actors.
    // Future improvements could include:
    // - A more robust cancellation mechanism that ensures the worker job is properly terminated
    // - A way to track the progress of the worker and display it to the user
    // - A way to cancel the worker job if the user navigates away from the page
    buffering: {
      after: {
        [debounceDelay]: {
          target: 'rendering',
          actions: 'modelUpdated',
        },
      },
      on: {
        initializeModel: {
          target: 'initializing',
          actions: 'initializeModel',
        },
        setCode: {
          target: 'buffering',
          actions: 'setCode',
          reenter: true, // Reset debounce timer when new code comes in
        },
        setParameters: {
          target: 'buffering',
          actions: 'setParameters',
          reenter: true, // Reset debounce timer when parameters change
        },
        kernelLog: {
          actions: 'sendKernelLogs',
        },
      },
    },
    rendering: {
      entry: 'computeGeometry',
      on: {
        initializeModel: {
          target: 'initializing',
          actions: 'initializeModel',
        },
        geometryComputed: {
          target: 'ready',
          actions: 'setGeometries',
        },
        parametersParsed: {
          actions: 'setDefaultParameters',
        },
        kernelError: {
          target: 'error',
          actions: 'setKernelError',
        },
        setCode: {
          actions: 'setCode',
          target: 'buffering',
        },
        setParameters: {
          actions: 'setParameters',
          target: 'buffering',
        },
        setCodeErrors: {
          actions: 'setCodeErrors',
        },
        exportGeometry: {
          actions: 'exportGeometry',
        },
        geometryExported: {
          actions: 'setExportedBlob',
        },
        kernelLog: {
          actions: 'sendKernelLogs',
        },
      },
    },
    error: {
      on: {
        initializeModel: {
          target: 'initializing',
          actions: 'initializeModel',
        },
        setCode: {
          target: 'buffering',
          actions: 'setCode',
        },
        setParameters: {
          target: 'buffering',
          actions: 'setParameters',
        },
        setCodeErrors: {
          actions: 'setCodeErrors',
        },
        exportGeometry: {
          actions: 'exportGeometry',
        },
        geometryExported: {
          actions: 'setExportedBlob',
        },
        geometryExportFailed: {
          actions: 'setExportError',
        },
        kernelLog: {
          actions: 'sendKernelLogs',
        },
      },
    },
  },
});
