import { assign, assertEvent, setup } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { kernelMachine } from '~/machines/kernel.js';
import type { Shape } from '~/types/cad.js';

// Interface defining the context for the CAD machine
export type CadContext = {
  code: string;
  parameters: Record<string, unknown>;
  defaultParameters: Record<string, unknown>;
  shapes: Shape[];
  error: string | undefined;
  monacoErrors: Array<{
    message: string;
    startLineNumber: number;
    endLineNumber: number;
    startColumn: number;
    endColumn: number;
  }>;
  kernelRef: ActorRefFrom<typeof kernelMachine> | undefined;
  exportedBlob: Blob | undefined;
  shouldInitializeKernelOnStart?: boolean;
};

// Define the types of events the machine can receive
type CadEvent =
  | { type: 'initializeKernel' }
  | { type: 'initializeModel'; code: string; parameters: Record<string, unknown> }
  | { type: 'setCode'; code: string }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setMonacoErrors'; errors: CadContext['monacoErrors'] }
  | { type: 'geometryEvaluated'; shapes: Shape[] }
  | { type: 'kernelError'; error: string }
  | { type: 'setDefaultParameters'; parameters: Record<string, unknown> }
  | { type: 'exportGeometry'; format: string }
  | { type: 'shapeExported'; blob: Blob };

type CadInput = {
  shouldInitializeKernelOnStart: boolean;
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
  },
  actions: {
    computeGeometry({ context }) {
      context.kernelRef?.send({
        type: 'computeGeometry',
        code: context.code,
        parameters: context.parameters,
      });
    },
    exportGeometry({ event, context }) {
      assertEvent(event, 'exportGeometry');
      context.kernelRef?.send({
        type: 'exportGeometry',
        format: event.format,
      });
    },
    setCode: assign({
      code({ event }) {
        assertEvent(event, 'setCode');
        return event.code;
      },
    }),
    setParameters: assign({
      parameters({ event }) {
        assertEvent(event, 'setParameters');
        return event.parameters;
      },
    }),
    setShapes: assign({
      shapes({ event }) {
        assertEvent(event, 'geometryEvaluated');
        return event.shapes;
      },
    }),
    setError: assign({
      error({ event }) {
        assertEvent(event, 'kernelError');
        return event.error;
      },
    }),
    setMonacoErrors: assign({
      monacoErrors({ event }) {
        assertEvent(event, 'setMonacoErrors');
        return event.errors;
      },
    }),
    setDefaultParameters: assign({
      defaultParameters({ event }) {
        assertEvent(event, 'setDefaultParameters');
        return event.parameters;
      },
    }),
    setExportedBlob: assign({
      exportedBlob({ event }) {
        assertEvent(event, 'shapeExported');
        return event.blob;
      },
    }),
    initializeKernel({ context }) {
      context.kernelRef?.send({ type: 'initialize', kernelType: 'replicad' });
    },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QGMCGEB0AnM6CeAxLGAC4DCA9hGANoAMAuoqAA4WwCWJHFAdsyAAeiAJwAWAGwYJAdgCMADgl0RMkQGY5IgDQg8iMQCYFGAKwiJ60-MN0x62QF9HutJhz4ipAAqosqAFtSMCxYeiYkEDZObj4BYQRxKVlFZVUNLV19BFNDUww7cRFDETlFOVMJZ1d0bFwIQmISAFk+VGQKAFEsLApQ8IForh5+SISZSwx7GTELOzoZRcMsgzE6aUrjORk6QzEFQ3VqkDc6zzBBNiwSAHEwCiCSLDwByKHY0dBxiSk6CT2LKY5Oo6HI6OoVgh1GIxBhbJoxOYymDocdTh4GkQABaoFhgTqXPokSCvVjsYZxMaICYiAoVCRyBkwwyWUyQvYyDAyUx0UGgrQyPbqBRo2oAIwArgAzKUhDi8KBechUWiMQbkj7xRBlIFwmTQsoODSyCF6RDmfIiDTFWamRElGSizCSmVyhVK3z+R4hMJqt4akZahCGuRw6xqFmg62Q2a0u0LBSlSwVBamJ0YF2yrDyxWCWAkVDEjCoKXErAACh5dAAlARTpm3VBSVEA5SvqIFOtDCz42pTAoB3JIXJjGZebyJKYgcVzGJ0zheNRs+6YA9SM9OgA3VAAGwlhZJfrJMUDVKhhym6hmc1TIj+bLNCFmnLv-31EityZFLhOtQXS5zAgAGsQl4MAd26XosGbd5T3bc91Eva9lFve9h22QwzAHBl1EMGZNBEecwEXRslUoagYNbT4hEQXDEOmWYUO5V8H2yH4TEWZRlE7bk6CBIiSOXRUmk9QJgn6I8WxPNsaIQpDGN5Zi0MfCZ8m7UpAREAcFDEOQBIA90mlaXh2i6Ho+l9CJjwpajvgwMF6SnaFchhIdHzBXSuRkBR3wkHykzTH90WIgzhNIAARMApVQCUdxIUTvQkqypJsoNzAKDR8JmHZuJ0yFxHyXDKl5RNJyvOcgr-ELSIuK5bnuR5nko6TbOpDiex+CduRmZZHx0kwfL2ScwSBfsKpqdxqqE7FcXxQlrkPZLYJkhIFFDWQLAUSphT5eRIUFfJJH+EqP0FQ59JCSACDzAsixLMtyxrOsqsExb1RaoMJH2KYSlkHZvN0oFIVMKwMC28RdgBKcKnTEIoLIlVmtSs8kmkeQlBUNQCOHOhEzB3YKmclQ7HG39MDhvoPT8MSy0s97kfg1GUgx9Jsfc1Iw1yRM9m7BRcNh8ysCVYzTMgiykc1M8Jno8q5jWRZBXQ0EweOhwFn1TQqkq8nBYIWqiTuNcnheSTltahAJl+f5GKBEEwV67IwT4qZcbvXZwdyQKJowCmhdgHE8QJOq3v9D6pY-OlKkZORmVZfLcYwEQpwmGECv1QKf14FV4EiNx6cl+CAFo3OyQvfnHCvK+MIj8HzuDZJ4qZ7QsPDzE0EvzSMeyVF069hRw9MGyEuuVu1Qn7O2RldKsdIHcQU6m5yhZETvJQLuH0OGdksQZHQ+w4U0Qad+KJPSeC16IBH82uamHSHAHNZcg7nJoTB2c7TUAcQUI7WfcFq+gxrS7JtL6p9OzCmHPCDAmggToz8vIP4zhnBAA */
  id: 'cad',
  entry: [
    assign({
      kernelRef({ spawn, self, context }) {
        const kernelRef = spawn(kernelMachine);

        if (context.shouldInitializeKernelOnStart) {
          self.send({ type: 'initializeKernel' });
        }

        // Subscribe to the kernel actor's state changes
        kernelRef.subscribe((state) => {
          // When kernel completes enters parsing state, send default parameters to cad machine
          if (state.value === 'evaluating' && state.context.defaultParameters) {
            self.send({
              type: 'setDefaultParameters',
              parameters: state.context.defaultParameters,
            });
          }

          // When kernel completes evaluation, send success event to cad machine
          if (state.value === 'evaluated') {
            self.send({ type: 'geometryEvaluated', shapes: state.context.shapes });
          }

          // When kernel reaches error state, send error event to cad machine
          if (state.value === 'error' && state.context.error !== undefined) {
            self.send({ type: 'kernelError', error: state.context.error });
          }

          // When a blob has been exported
          if (state.value === 'exported' && state.context.exportedBlob) {
            self.send({
              type: 'shapeExported',
              blob: state.context.exportedBlob,
            });
          }
        });

        return kernelRef;
      },
    }),
  ],
  context: ({ input }) => ({
    code: '',
    parameters: {},
    defaultParameters: {},
    shapes: [],
    error: undefined,
    monacoErrors: [],
    kernelRef: undefined,
    exportedBlob: undefined,
    shouldInitializeKernelOnStart: input.shouldInitializeKernelOnStart,
  }),
  initial: 'initializing',
  states: {
    initializing: {
      on: {
        initializeModel: {
          actions: [
            assign({
              code({ event }) {
                assertEvent(event, 'initializeModel');
                return event.code;
              },
              parameters({ event }) {
                assertEvent(event, 'initializeModel');
                return event.parameters;
              },
            }),
            'computeGeometry',
          ],
          // Stays in 'initializing' state
        },
        initializeKernel: {
          actions: 'initializeKernel',
        },
        geometryEvaluated: {
          target: 'rendered',
          actions: ['setShapes', assign({ error: undefined })],
        },
        kernelError: {
          target: 'error',
          actions: 'setError',
        },
        setDefaultParameters: {
          actions: 'setDefaultParameters',
        },
        // Added to handle potential setMonacoErrors during initialization if needed
        setMonacoErrors: {
          actions: 'setMonacoErrors',
        },
        exportGeometry: {
          actions: 'exportGeometry',
        },
        shapeExported: {
          actions: ['setExportedBlob', assign({ error: undefined })],
        },
      },
    },
    ready: {
      on: {
        initializeModel: {
          target: 'initializing',
          actions: [
            assign({
              code({ event }) {
                assertEvent(event, 'initializeModel');
                return event.code;
              },
              parameters({ event }) {
                assertEvent(event, 'initializeModel');
                return event.parameters;
              },
            }),
            'computeGeometry',
          ],
          // The event will be processed by the 'initializing' state's handler
        },
        setCode: {
          target: 'buffering',
          actions: 'setCode',
        },
        setParameters: {
          target: 'buffering',
          actions: 'setParameters',
        },
        setMonacoErrors: {
          actions: 'setMonacoErrors',
        },
        exportGeometry: {
          actions: 'exportGeometry',
        },
        shapeExported: {
          actions: 'setExportedBlob',
        },
      },
    },
    buffering: {
      after: {
        [debounceDelay]: 'rendering',
      },
      on: {
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
        geometryEvaluated: {
          target: 'rendered',
          actions: ['setShapes', assign({ error: undefined })],
        },
        kernelError: {
          target: 'error',
          actions: 'setError',
        },
        setCode: {
          actions: 'setCode',
          target: 'buffering',
        },
        setParameters: {
          actions: 'setParameters',
          target: 'buffering',
        },
        setMonacoErrors: {
          actions: 'setMonacoErrors',
        },
        setDefaultParameters: {
          actions: 'setDefaultParameters',
        },
        exportGeometry: {
          actions: 'exportGeometry',
        },
        shapeExported: {
          actions: ['setExportedBlob', assign({ error: undefined })],
        },
      },
    },
    rendered: {
      after: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- xstate setup
        0: {
          target: 'ready',
        },
      },
    },
    error: {
      on: {
        setCode: {
          target: 'buffering',
          actions: ['setCode'],
        },
        setParameters: {
          target: 'buffering',
          actions: 'setParameters',
        },
        setMonacoErrors: {
          actions: 'setMonacoErrors',
        },
        exportGeometry: {
          actions: 'exportGeometry',
        },
        shapeExported: {
          actions: 'setExportedBlob',
        },
      },
    },
  },
});
