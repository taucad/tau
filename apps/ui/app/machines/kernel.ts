import { assign, assertEvent, setup } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import type { Shape } from '~/types/cad.js';
import type { BuilderWorkerInterface } from '~/components/geometry/kernel/replicad/replicad-builder.worker.js';
import BuilderWorker from '~/components/geometry/kernel/replicad/replicad-builder.worker.js?worker';

// Check if we're in a browser environment
const isBrowser = globalThis.window !== undefined && typeof Worker !== 'undefined';

// Interface defining the context for the Kernel machine
export type KernelContext = {
  worker: Worker | undefined;
  wrappedWorker: Remote<BuilderWorkerInterface> | undefined;
  shapes: Shape[];
  defaultParameters: Record<string, unknown>;
  error: string | undefined;
  kernelType: 'replicad' | 'openscad';
  exportedBlob: Blob | undefined;
};

// Define the types of events the machine can receive
type KernelEvent =
  | { type: 'initialize'; kernelType: 'replicad' | 'openscad' }
  | { type: 'initialized' }
  | { type: 'computeGeometry'; code: string; parameters: Record<string, unknown> }
  | { type: 'geometryComputed'; shapes: Shape[] }
  | { type: 'parseParameters'; code: string }
  | {
      type: 'parametersParsed';
      defaultParameters: Record<string, unknown>;
      parameters: Record<string, unknown>;
      code: string;
    }
  | { type: 'exportGeometry'; format: string }
  | { type: 'geometryExported'; blob: Blob }
  | { type: 'error'; error: string };

/**
 * Kernel Machine
 *
 * This machine manages the WebWorker that runs the CAD operations:
 * - Initializes the worker
 * - Handles communication with the worker
 * - Processes results from CAD operations
 */
export const kernelMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    context: {} as KernelContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
    events: {} as KernelEvent,
  },
  actions: {
    async createWorker({ context, self }) {
      // In non-browser environments, just mark as initialized without creating a Worker
      if (!isBrowser) {
        // Signal that initialization is complete to avoid hanging
        self.send({ type: 'initialized' });
        return;
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

        try {
          // Initialize the worker with the default exception handling mode
          await wrappedWorker.initialize(false);

          // Store references to worker and wrappedWorker
          context.worker = worker;
          context.wrappedWorker = wrappedWorker;

          // Signal that initialization is complete
          self.send({ type: 'initialized' });
        } catch (error) {
          // Handle initialization errors
          const errorMessage = error instanceof Error ? error.message : 'Failed to initialize worker';
          self.send({ type: 'error', error: errorMessage });
        }
      } catch (error) {
        // Handle the case where worker creation fails
        const errorMessage = error instanceof Error ? error.message : 'Failed to create worker';
        self.send({ type: 'error', error: errorMessage });
      }
    },
    async parseParameters({ context, event, self }) {
      assertEvent(event, 'computeGeometry');
      // Skip in non-browser environments
      if (!isBrowser) return;

      if (!context.wrappedWorker) {
        self.send({ type: 'error', error: 'Worker not initialized' });
        return;
      }

      try {
        const defaultParameters = (await context.wrappedWorker.extractDefaultParametersFromCode(event.code)) ?? {};
        self.send({ type: 'parametersParsed', defaultParameters, code: event.code, parameters: event.parameters });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error extracting parameters';
        console.error('Error extracting parameters:', errorMessage);
        // Don't send an error event here to avoid disrupting the main flow
        // Just update with empty parameters
        self.send({ type: 'parametersParsed', defaultParameters: {}, code: event.code, parameters: {} });
      }
    },
    async evaluateCode({ context, event, self }) {
      assertEvent(event, 'parametersParsed');

      if (!isBrowser) return;

      if (!context.wrappedWorker) {
        self.send({ type: 'error', error: 'Worker not initialized' });
        return;
      }

      try {
        // Merge default parameters with provided parameters
        const mergedParameters = {
          ...context.defaultParameters,
          ...event.parameters,
        };

        const shapes = await context.wrappedWorker.buildShapesFromCode(event.code, mergedParameters);

        // Check if the result is an error or actual shapes
        if (shapes && typeof shapes === 'object' && 'error' in shapes) {
          self.send({
            type: 'error',
            error: (shapes as { message?: string }).message ?? 'Error building shapes',
          });
        } else {
          self.send({ type: 'geometryComputed', shapes: shapes as Shape[] });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Error evaluating code';
        self.send({ type: 'error', error: errorMessage });
      }
    },
    async exportGeometry({ context, event, self }) {
      // Skip in non-browser environments
      if (!isBrowser) return;

      if (!context.wrappedWorker) {
        self.send({ type: 'error', error: 'Worker not initialized' });
        return;
      }

      if (event.type === 'exportGeometry') {
        try {
          const format = event.format as 'stl' | 'stl-binary' | 'step' | 'step-assembly';
          const result = await context.wrappedWorker.exportShape(format);
          if (result && result.length > 0 && result[0].blob) {
            // Send the geometryExported event to self
            self.send({ type: 'geometryExported', blob: result[0].blob });
          } else {
            self.send({
              type: 'error',
              error: 'Failed to export shape',
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error exporting shape';
          self.send({ type: 'error', error: errorMessage });
        }
      }
    },
  },
}).createMachine({
  /** @xstate-layout N4IgpgJg5mDOIC5QGswCcB2YA2A6AlhvgC74CG2+AXoVAMSEnmVWQDaADALqKgAOAe1hMBGXiAAeiAEwA2AJy4AzBwCMqgCwrZ0gByzVSgDQgAnogCsujbmnyOG1bvlKlegOy6Avl5OpMOAREpBTUtHToaAJonDxIIILCpKLiUgiyWsrSSupy8hYq7u4m5ghu0riq7vIZ8qoc2dIWFj5+6Fh4aGBkEKZ0AMYCALZ8AK7EYADiYMNgxGimseKJImLxafIaFfYcsrsaGrLuByWILu64W1VFug1uukqtIP4duF09fWASgmjE07PzRbcZZCVapRCqbIWXAFSEaXSqfLVdyyU4IaqyGG6awWVR7QzHeRPF6BL4-UgYegwAELACi32iEwgS3iK2Sa1AaU0Gg4uGRSns0k08jkxjMiHuuBFNQFKg48ncSlkxPapIZv3CkWiLP4oPZ4IQ9QyuH0+gO6luejRTmhRQFegF+SVmxVATwZMZkDoElgxDIE1wZAAZhM0AAKDgASjoJPd6qZOoSevwKXWEKs0Ic5Q4uIs0hRxXFCHyFQFDwK0gO8qVrtefDIaGElLo9bQZCGc3QsAACg3YOxgazk6nORLeSjnSKlMdXEp9GihZjdO4OBwlXj4dda4FW036FqYoPdUkUxzJIhbhc4Qr5ccGhZUUWRSbCc55c5ZJ-vL5nqr3QA3ChRn9cJqQ7QEAGFhjGBMjyTE8R3PMpblwPYlFhDR3DzEVKzRZcLg4Fc8ycHMDAsDRtwAoCQObA9EzZU8DT2aE5AaWQrEaGU0S2RQLEIrCFB0AoOAeSjcDAQDsGAplvV9f0wEDEN0AjaNY3EyTpIHOJjzBNMEF0SspUVSFBUOeVpDwzwYSIppPE8GUxIPAZoPGKYZnAhZ6OHM80gnSpywsGo+OCsVSnhJQYWkOQEQRJoHFkR4fzUpyPV+f4PKBbT4N00dDQaGwinqfjFXI0KJSiyoMTnAyDgKb82jdcS0CiNAGGCZhqDALyEJ8yxAtQix3EhbQUUvBc8RfVcH3caRSPqb8fwwAQIDgcRYxBHqDQAWkRbZMMcQ4US2B40WhacNHkewtAUET9jExgQhYWgNpypCmgqG5mnxOpDmaBd8lsA59ErHQqk-MT3l6F79T0+oAcwlcXAUREGjwxEYXYtQeSiiikr-cT42eodNthuQl3Q-IFT2TZdjRdDVClXZZqqIVLt0QbHPjSBocY2GOJhWVVFxaqql0NFPwuZoHhmxVqluRKGrrPsiZ0mHcp2g4pX2zQjgyB1rSVE0Es8diLv0PZlTxxqJOoikoB5xC0kcXRKkRKp1GOOx2O4vNLmsFQ6lI6xDEcjT5IgB3evSVwjJcL6DDxZc0R2XAHBXawos-HkFd-a3muiSODQRaEJZlPZl3kE6iyUDRoSFnQ1Erci7PcHwfCAA */
  id: 'kernel',
  context: {
    worker: undefined,
    wrappedWorker: undefined,
    shapes: [],
    defaultParameters: {},
    error: undefined,
    kernelType: 'replicad',
    exportedBlob: undefined,
  },
  initial: 'initializing',
  states: {
    initializing: {
      on: {
        initialize: {
          actions: 'createWorker',
        },
        initialized: {
          target: 'ready',
        },
        error: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    ready: {
      on: {
        computeGeometry: {
          target: 'parsing',
          actions: ['parseParameters', assign({ error: undefined })],
        },
        exportGeometry: {
          target: 'exporting',
          actions: 'exportGeometry',
        },
      },
    },

    exporting: {
      on: {
        geometryExported: {
          target: 'exported',
          actions: assign({
            exportedBlob: ({ event }) => event.blob,
            error: undefined,
          }),
        },
        error: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    exported: {
      // Immediately transition to ready. this state just provides a way to track the exported state on listeners
      after: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- xstate setup
        0: {
          target: 'ready',
          actions: assign({
            exportedBlob: undefined,
          }),
        },
      },
    },

    parsing: {
      on: {
        parametersParsed: {
          target: 'evaluating',
          actions: assign({
            defaultParameters: ({ event }) => event.defaultParameters,
            error: undefined,
          }),
        },
        error: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    evaluating: {
      entry: 'evaluateCode',
      on: {
        geometryComputed: {
          target: 'evaluated',
          actions: assign({
            shapes: ({ event }) => event.shapes,
            error: undefined,
          }),
        },
        error: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },

    evaluated: {
      // Immediately transition to ready. this state just provides a way to track the evaluated state on listeners
      after: {
        // eslint-disable-next-line @typescript-eslint/naming-convention -- xstate setup
        0: {
          target: 'ready',
          actions: assign({
            shapes: undefined,
          }),
        },
      },
    },

    error: {
      on: {
        computeGeometry: {
          target: 'parsing',
          actions: ['parseParameters', assign({ error: undefined })],
        },
        exportGeometry: {
          target: 'exporting',
          actions: 'exportGeometry',
        },

        initialize: {
          target: 'initializing',
          actions: [
            assign({
              error: undefined,
              kernelType: ({ event }) => event.kernelType,
            }),
          ],
        },
      },
    },
  },
});
