import { assign, assertEvent, setup, sendTo, emit, not, enqueueActions } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { kernelMachine } from '~/machines/kernel.js';
import type { KernelEventExternal } from '~/machines/kernel.js';
import type { Shape } from '~/types/cad.js';
import type { graphicsMachine } from '~/machines/graphics.js';

// Interface defining the context for the CAD machine
export type CadContext = {
  code: string;
  screenshot: string | undefined;
  parameters: Record<string, unknown>;
  defaultParameters: Record<string, unknown>;
  shapes: Shape[];
  kernelError: string | undefined;
  codeErrors: Array<{
    message: string;
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
  }>;
  kernelRef: ActorRefFrom<typeof kernelMachine>;
  exportedBlob: Blob | undefined;
  shouldInitializeKernelOnStart: boolean;
  isKernelInitializing: boolean;
  isKernelInitialized: boolean;
  graphicsRef: ActorRefFrom<typeof graphicsMachine> | undefined;
  jsonSchema?: unknown;
};

// Define the types of events the machine can receive
type CadEvent =
  | { type: 'initializeKernel' }
  | { type: 'initializeModel'; code: string; parameters: Record<string, unknown> }
  | { type: 'setCode'; code: string; screenshot?: string }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setCodeErrors'; errors: CadContext['codeErrors'] }
  | { type: 'exportGeometry'; format: 'stl' | 'stl-binary' | 'step' | 'step-assembly' }
  | KernelEventExternal;

type CadEmitted =
  | { type: 'modelUpdated'; code: string; parameters: Record<string, unknown> }
  | { type: 'geometryEvaluated'; shapes: Shape[] }
  | { type: 'geometryExported'; blob: Blob; format: string };

type CadInput = {
  shouldInitializeKernelOnStart: boolean;
  graphicsRef?: ActorRefFrom<typeof graphicsMachine>;
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
  /** @xstate-layout N4IgpgJg5mDOIC5QGMCGEB0AnM6CeAxLGAC4DCA9hGANoAMAuoqAA4WwCWJHFAdsyAAeiAGwBWAIwY6ADjEBOGQCY6AdhmqAzDIkAaEHkRil8jABYTquvKVKJZ8TIC+T-Wkw58RUgAVUWVABbUjAsWHomJBA2Tm4+AWEEcSlZBWU1DW09A1FjDBlNBWSZMzoHeRc3dGxcCEJiEgBZPlRkCgBRLCwKMIiBGK4efijEszE6fLNNVRsx0rExfUMEMWmMCWtNeSm1OwLKkHcarwaAETAAM1QAVwAbEj8A4JJQ8MZ+9kH4kcQpzXzCvIxCVthsRJolr9ShhxCIlHCzBIJDYNpoDkdPHUCGBBGwsCQAMoAC1QLFo7yiAziw1AoxEIhhqmB9hEVnBhUhCE0ZjMGBUmgkmjoknpSmmaNch2qmPqJLJ7VxPReED6lM+1ISvzEDIsEhk8nkElUG3kmm5nKUZlUGFUZgNijhgvhU3R1QARtcLhdQhxeFBvOQqOTIqx1UNNQhDUppMixDNZLH7JzBXRoyUtJpbAtEQ5XZgPV6fX6A48giFehTQ7Fwz8EPro3Q6FsRE644azMmVAythZG5oRHQkVo8xgC96sL7-Q1mrxWh0uj03iHomHvrTEDJlIz5EzrGYdC2OzkEEjrBhQXQRCURPulCOx0Wp6Rzlc7g9-GWXhXl1Sa+u6+IjLIhIIiKMoEjwsmg7-PuMz9tqQK2M4kpHA+E7FjieKEnKwYfNWa5CBuigYJIRpaCBVpbPInKGtaTb7mUrIWEo2r3p646TkQOEKlhkCqlWXw0oRdabnycZyKo9KSAaqicukJEHqoSiqOoNglGxhbof6giwCQqAvBgqAXF+AAU4x0AAlAQqHsY+-ErvhQmJFevI3pem5bIOMjiJ2MjmPa8g3raPKmiOOC8NQWkEAA1qEvBgLcBLXMgyBwEueGCRG8KmCxjZisCDgCjInJwv84zwiY2gtvlYVgBFj4xXFCWdN0WD2b+BGJNlYl5YU15FcmFhiOexq6ipQoyKmtX1VFDSUNQ7Wrk5iDdblqZ9YVeqcuo-ypIF8jWJNqwiNNkWcQ0pbPK8i2OVloE9etBXgltx4HTqNhZpel7cidKHSnVZ3FtOLRtC1i43ZltYKNIGRmkCBqwSVMwKUU-bwuZZinQ1ZyXDc9yXeW6VqrdtYWJywL-E6BRGgK-J3n9HgAw1mFKsSpK4cTkP-raAKKNqRriMpL3LPuDKsvtiiAsKyFVIzM3ndxir4nxlYOVzwk3ij2yXpJihspynl8uj4ulAOcgjqErUBvNHMCRqtbJNIciKCo6haDoyZmlI+pyIOZvMaoFsLlgJYfld34Zfb-6O3t6Ru1kg0LBgQpWnGcYbE2v2yxgls9AGM5zmDEec1HwljBMJTTLMYjzIsx6ClsJHqHq9KgkyQdWzjr742HhMQ6XoxmgCCgFRe4KdlM6y5TXMybipgcMznwfYkr2Hs-3f5l-SjLMg4bJmnXyxIg4QEfQdfXCh3eewIrvEqqrHXLQgYw6nsBpGiaZpQeMfJ6jMGfKAKPTSUvAgzwCiO4SOm9EgAFoRCcjgTDRsgoFAqGFCBS+i8ZRQM6r8OE54SilEFFYfs4J4HHnBH5bULEKqpkkAsDSHE-Q4KfvqXk6RATeR5EpWS9cphSBYn1cCMwgRiCxlpFhEZjTrH3DyJQGg4QDmFNtHQ0hPKiLsDMFSV8sCSNJvgxQPJoIkPpBCPhiI1GCj1MCbYSlgFOCAA */
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
        };
      },
    ),
    exportGeometry: sendTo(
      ({ context }) => context.kernelRef,
      ({ event }) => {
        assertEvent(event, 'exportGeometry');
        return {
          type: 'exportGeometry',
          format: event.format,
        };
      },
    ),
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
    setShapes: enqueueActions(({ enqueue, event, context }) => {
      assertEvent(event, 'geometryComputed');
      enqueue.assign({
        shapes: event.shapes,
        kernelError: undefined,
      });
      enqueue.emit({
        type: 'geometryEvaluated' as const,
        shapes: event.shapes,
      });
      // Send shapes to graphics machine
      if (context.graphicsRef) {
        enqueue.sendTo(context.graphicsRef, {
          type: 'updateShapes',
          shapes: event.shapes,
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
    initializeKernel: enqueueActions(({ enqueue, context, self }) => {
      enqueue.assign({ isKernelInitializing: true });
      enqueue.sendTo(context.kernelRef, {
        type: 'initializeKernel' as const,
        kernelType: 'replicad' as const,
        parentRef: self,
      });
    }),
    initializeModel: assign(({ event }) => {
      assertEvent(event, 'initializeModel');
      return {
        code: event.code,
        parameters: event.parameters,
        codeErrors: [],
        kernelError: undefined,
        shapes: [],
        exportedBlob: undefined,
        jsonSchema: undefined,
      };
    }),
  },
  guards: {
    isKernelInitialized: ({ context }) => context.isKernelInitialized,
    isKernelInitializing: ({ context }) => context.isKernelInitializing,
    hasModel: ({ context }) => context.code !== '',
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QGMCGEB0AnM6CeAxLGAC4DCA9hGANoAMAuoqAA4WwCWJHFAdsyAAeiAJwAWAGwYJAdgCMADgl0RMkQGY5IgDQg8iMQCYFGAKwiJ60-MN0x62QF9HutJhz4ipAAqosqAFtSMCxYeiYkEDZObj4BYQRxKVlFZVUNLV19BFNDUww7cRFDETlFOVMJZ1d0bFwIQmISAFk+VGQKAFEsLApQ8IForh5+SISZSwx7GTELOzoZRcMsgzE6aUrjORk6QzEFQ3VqkDc6zzBBNiwSAHEwCiCSLDwByKHY0dBxiSk6CT2LKY5Oo6HI6OoVgh1GIxBhbJoxOYymDocdTh4GkQABaoFhgTqXPokSCvVjsYZxMaICYiAoVCRyBkwwyWUyQvYyDAyUx0UGgrQyPbqBRo2oAIwArgAzKUhDi8KBechUWiMQbkj7xRBlIFwmTQsoODSyCF6RDmfIiDTFWamRElGSizCSmVyhVK3z+R4hMJqt4akZahCGuRw6xqFmg62Q2a0u0LBSlSwVBamJ0YF2yrDyxWCWAkVDEjCoKXErAACh5dAAlARTpm3VBSVEA5SvqIFOtDCz42pTAoB3JIXJjGZebyJKYgcVzGJ0zheNRs+6YA9SM9OgA3VAAGwlhZJfrJMUDVKhhym6hmc1TIj+bLNCFmnLv-31EityZFLhOtQXS5zAgAGsQl4MAd26XosGbd5T3bc91Eva9lFve9h22QwzAHBl1EMGZNBEecwEXRslUoagYNbT4hEQXDEOmWYUO5V8H2yH4TEWZRlE7bk6CBIiSOXRUmk9QJgn6I8WxPNsaIQpDGN5Zi0MfCZ8m7UpAREAcFDEOQBIA90mlaXh2i6Ho+l9CJjwpajvgwMF6SnaFchhIdHzBXSuRkBR3wkHykzTH90WIgzhNIAARMApVQCUdxIUTvQkqypJsoNzAKDR8JmHZuJ0yFxHyXDKl5RNJyvOcgr-ELSIuK5bnuR5nko6TbOpDiex+CduRmZZHx0kwfL2ScwSBfsKpqdxqqE7FcXxQlrkPZLYJkhIFFDWQLAUSphT5eRIUFfJJH+EqP0FQ59JCSACDzAsixLMtyxrOsqsExb1RaoMJH2KYSlkHZvN0oFIVMKwMC28RdgBKcKnTEIoLIlVmtSs8kmkeQlBUNQCOHOhEzB3YKmclQ7HG39MDhvoPT8MSy0s97kfg1GUgx9Jsfc1Iw1yRM9m7BRcNh8ysCVYzTMgiykc1M8Jno8q5jWRZBXQ0EweOhwFn1TQqkq8nBYIWqiTuNcnheSTltahAJl+f5GKBEEwV67IwT4qZcbvXZwdyQKJowCmhdgHE8QJOq3v9D6pY-OlKkZORmVZfLcYwEQpwmGECv1QKf14FV4EiNx6cl+CAFo3OyQvfnHCvK+MIj8HzuDZJ4qZ7QsPDzE0EvzSMeyVF069hRw9MGyEuuVu1Qn7O2RldKsdIHcQU6m5yhZETvJQLuH0OGdksQZHQ+w4U0Qad+KJPSeC16IBH82uamHSHAHNZcg7nJoTB2c7TUAcQUI7WfcFq+gxrS7JtL6p9OzCmHPCDAmggToz8vIP4zhnBAA */
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
    shapes: [],
    kernelError: undefined,
    codeErrors: [],
    kernelRef: spawn(kernelMachine),
    exportedBlob: undefined,
    shouldInitializeKernelOnStart: input.shouldInitializeKernelOnStart,
    isKernelInitializing: false,
    isKernelInitialized: false,
    graphicsRef: input.graphicsRef,
    jsonSchema: undefined,
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
            guard: not('isKernelInitialized'),
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
      },
    },

    // The initialization state is used when a new model is loaded.
    initializing: {
      entry: 'computeGeometry',
      on: {
        initializeModel: {
          target: 'initializing',
          actions: 'initializeModel',
        },
        kernelError: {
          target: 'error',
          actions: 'setKernelError',
        },
        geometryComputed: {
          target: 'ready',
          actions: 'setShapes',
        },
        parametersParsed: {
          actions: 'setDefaultParameters',
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
      },
    },
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
          actions: 'setShapes',
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
      },
    },
  },
});
