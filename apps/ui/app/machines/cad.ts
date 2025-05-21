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
  status: 'ready' | 'buffering' | 'rendering' | 'error';
  kernelRef: ActorRefFrom<typeof kernelMachine> | undefined;
  exportedBlob: Blob | undefined;
};

// Define the types of events the machine can receive
type CadEvent =
  | { type: 'setCode'; code: string }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'setMonacoErrors'; errors: CadContext['monacoErrors'] }
  | { type: 'geometryEvaluated'; shapes: Shape[] }
  | { type: 'kernelError'; error: string }
  | { type: 'setDefaultParameters'; parameters: Record<string, unknown> }
  | { type: 'exportGeometry'; format: string }
  | { type: 'shapeExported'; blob: Blob };

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
  },
}).createMachine({
  id: 'cad',
  entry: [
    assign({
      kernelRef({ spawn, self }) {
        const kernelRef = spawn(kernelMachine);

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
  context: {
    code: '',
    parameters: {},
    defaultParameters: {},
    shapes: [],
    error: undefined,
    monacoErrors: [],
    status: 'ready',
    kernelRef: undefined,
    exportedBlob: undefined,
  },
  initial: 'ready',
  states: {
    ready: {
      entry: assign({ status: 'ready' }),

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
    buffering: {
      entry: assign({ status: 'buffering' }),
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
      entry: [assign({ status: 'rendering' }), 'computeGeometry'],
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
      entry: assign({ status: 'error' }),
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
