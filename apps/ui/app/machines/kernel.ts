import { createMachine, assign } from 'xstate';
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
  isInitialized: boolean;
  exportedBlob: Blob | undefined;
};

// Define the types of events the machine can receive
type KernelEvent =
  | { type: 'initialize'; kernelType: 'replicad' | 'openscad' }
  | { type: 'initialized' }
  | { type: 'evaluate'; code: string; parameters: Record<string, unknown> }
  | { type: 'extractParameters'; code: string }
  | { type: 'parameterSuccess'; parameters: Record<string, unknown> }
  | { type: 'success'; shapes: Shape[] }
  | { type: 'error'; error: string }
  | { type: 'exportShape'; format: string }
  | { type: 'shapeExported'; blob: Blob };

/**
 * Kernel Machine
 *
 * This machine manages the WebWorker that runs the CAD operations:
 * - Initializes the worker
 * - Handles communication with the worker
 * - Processes results from CAD operations
 */
export const kernelMachine = createMachine(
  {
    types: {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
      context: {} as KernelContext,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
      events: {} as KernelEvent,
    },
    id: 'kernel',
    context: {
      worker: undefined,
      wrappedWorker: undefined,
      shapes: [],
      defaultParameters: {},
      error: undefined,
      kernelType: 'replicad',
      isInitialized: false,
      exportedBlob: undefined,
    },
    initial: 'initializing',
    states: {
      initializing: {
        entry: 'createWorker',
        on: {
          initialized: {
            target: 'ready',
            actions: assign({
              isInitialized: () => true,
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
      ready: {
        on: {
          evaluate: {
            target: 'evaluating',
            actions: 'evaluateCode',
          },
          extractParameters: {
            actions: 'extractDefaultParameters',
          },
          parameterSuccess: {
            actions: assign({
              defaultParameters: ({ event }) => event.parameters,
            }),
          },
          exportShape: {
            actions: 'exportShapeAction',
          },
          shapeExported: {
            actions: assign({
              exportedBlob: ({ event }) => event.blob,
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
        on: {
          success: {
            target: 'success',
            actions: assign({
              shapes: ({ event }) => event.shapes,
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
      success: {
        after: {
          // eslint-disable-next-line @typescript-eslint/naming-convention -- xstate API
          100: 'ready', // Automatically transition back to ready after a short delay
        },
      },
      error: {
        on: {
          evaluate: {
            target: 'evaluating',
            actions: ['evaluateCode', assign({ error: undefined })],
          },
          extractParameters: {
            actions: 'extractDefaultParameters',
          },
          exportShape: {
            actions: 'exportShapeAction',
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
  },
  {
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
      async evaluateCode({ context, event, self }) {
        // Skip in non-browser environments
        if (!isBrowser) return;

        if (!context.wrappedWorker || !context.isInitialized) {
          self.send({ type: 'error', error: 'Worker not initialized' });
          return;
        }

        if (event.type === 'evaluate') {
          try {
            // Extract default parameters before evaluation
            self.send({ type: 'extractParameters', code: event.code });

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
              self.send({ type: 'success', shapes: shapes as Shape[] });
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error evaluating code';
            self.send({ type: 'error', error: errorMessage });
          }
        }
      },
      async extractDefaultParameters({ context, event, self }) {
        // Skip in non-browser environments
        if (!isBrowser) return;

        if (!context.wrappedWorker || !context.isInitialized) {
          self.send({ type: 'error', error: 'Worker not initialized' });
          return;
        }

        if (event.type === 'extractParameters') {
          try {
            const parameters = await context.wrappedWorker.extractDefaultParametersFromCode(event.code);
            self.send({ type: 'parameterSuccess', parameters });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Error extracting parameters';
            console.error('Error extracting parameters:', errorMessage);
            // Don't send an error event here to avoid disrupting the main flow
            // Just update with empty parameters
            self.send({ type: 'parameterSuccess', parameters: {} });
          }
        }
      },
      async exportShapeAction({ context, event, self }) {
        // Skip in non-browser environments
        if (!isBrowser) return;

        if (!context.wrappedWorker || !context.isInitialized) {
          self.send({ type: 'error', error: 'Worker not initialized' });
          return;
        }

        if (event.type === 'exportShape') {
          try {
            const format = event.format as 'stl' | 'stl-binary' | 'step' | 'step-assembly';
            const result = await context.wrappedWorker.exportShape(format);
            if (result && result.length > 0 && result[0].blob) {
              // Send the shapeExported event to self
              self.send({ type: 'shapeExported', blob: result[0].blob });
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
  },
);
