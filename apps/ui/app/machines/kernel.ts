import { createMachine, assign, createActor } from 'xstate';
import { wrap } from 'comlink';
import type { Remote } from 'comlink';
import type { Shape } from '~/types/cad.js';
import type { BuilderWorkerInterface } from '~/components/geometry/kernel/replicad/replicad-builder.worker.js';
import BuilderWorker from '~/components/geometry/kernel/replicad/replicad-builder.worker.js?worker';

// Check if we're in a browser environment
const isBrowser = globalThis.window !== undefined && typeof Worker !== 'undefined';

// Maximum number of workers in the pool
const maxWorkers = 4;

// Interface defining a worker in the pool
export type PooledWorker = {
  id: string;
  worker: Worker;
  wrappedWorker: Remote<BuilderWorkerInterface>;
  busy: boolean;
  lastUsed: number;
};

// Interface defining the context for the Kernel machine
export type KernelContext = {
  workerPool: PooledWorker[];
  clientStates: Record<
    string,
    {
      shapes: Shape[];
      defaultParameters: Record<string, unknown>;
      error?: string;
      exportedBlob?: Blob;
    }
  >;
  kernelType: 'replicad' | 'openscad';
  isInitialized: boolean;
};

// Define the types of events the machine can receive
type KernelEvent =
  | { type: 'initialize'; kernelType: 'replicad' | 'openscad' }
  | { type: 'initialized' }
  | { type: 'evaluate'; code: string; parameters: Record<string, unknown>; clientId: string }
  | { type: 'extractParameters'; code: string; clientId: string }
  | { type: 'parameterSuccess'; parameters: Record<string, unknown>; clientId: string }
  | { type: 'success'; shapes: Shape[]; clientId: string }
  | { type: 'error'; error: string; clientId: string }
  | { type: 'exportShape'; format: string; clientId: string }
  | { type: 'shapeExported'; blob: Blob; clientId: string }
  | { type: 'clientDisconnect'; clientId: string }
  | { type: 'processNext' };

/**
 * Kernel Machine
 *
 * This machine manages a pool of WebWorkers for CAD operations:
 * - Initializes and maintains a worker pool
 * - Handles communication with workers
 * - Processes results from CAD operations
 * - Manages client-specific state
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
      workerPool: [],
      clientStates: {},
      kernelType: 'replicad',
      isInitialized: false,
    },
    initial: 'initializing',
    states: {
      initializing: {
        entry: 'initializeWorkerPool',
        on: {
          initialized: {
            target: 'ready',
            actions: assign({
              isInitialized: () => true,
            }),
          },
          error: {
            target: 'error',
            actions: 'setError',
          },
        },
      },
      ready: {
        on: {
          evaluate: {
            actions: 'evaluateCode',
          },
          extractParameters: {
            actions: 'extractDefaultParameters',
          },
          parameterSuccess: {
            actions: 'setDefaultParameters',
          },
          success: {
            actions: 'setShapes',
          },
          error: {
            actions: 'setError',
          },
          exportShape: {
            actions: 'exportShapeAction',
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
          clientDisconnect: {
            actions: 'cleanupClientState',
          },
          processNext: {
            actions: 'processNextOperation',
          },
        },
      },
      error: {
        on: {
          evaluate: {
            actions: 'evaluateCode',
          },
          extractParameters: {
            actions: 'extractDefaultParameters',
          },
          initialize: {
            target: 'initializing',
            actions: assign({
              clientStates: {},
              kernelType: ({ event }) => (event.type === 'initialize' ? event.kernelType : 'replicad'),
            }),
          },
          clientDisconnect: {
            actions: 'cleanupClientState',
          },
          processNext: {
            actions: 'processNextOperation',
          },
        },
      },
    },
  },
  {
    actions: {
      async initializeWorkerPool({ context, self }) {
        // In non-browser environments, just mark as initialized
        if (!isBrowser) {
          self.send({ type: 'initialized' });
          return;
        }

        // Clean up any existing workers
        for (const pooledWorker of context.workerPool) {
          pooledWorker.worker.terminate();
        }

        try {
          // Create worker initialization promises for all workers
          const initPromises = Array.from({ length: maxWorkers }, async (_, i) => {
            try {
              // Create a new worker
              const worker = new BuilderWorker();
              // Wrap with comlink
              const wrappedWorker = wrap<BuilderWorkerInterface>(worker);

              // Initialize the worker
              await wrappedWorker.initialize(false);

              // Return worker info
              return {
                id: `worker-${i}`,
                worker,
                wrappedWorker,
                busy: false,
                lastUsed: Date.now(),
              };
            } catch (error) {
              // Handle individual worker initialization error
              console.error(`Failed to initialize worker ${i}:`, error);
              return null;
            }
          });

          // Wait for all workers to initialize
          const results = await Promise.all(initPromises);

          // Filter out failed workers
          const validWorkers = results.filter(Boolean) as PooledWorker[];

          // If we have at least one worker, consider initialization successful
          if (validWorkers.length > 0) {
            context.workerPool = validWorkers;
            self.send({ type: 'initialized' });
          } else {
            self.send({
              type: 'error',
              error: 'Failed to initialize any workers',
              clientId: 'system',
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create worker pool';
          self.send({
            type: 'error',
            error: errorMessage,
            clientId: 'system',
          });
        }
      },

      getAvailableWorker({ context }) {
        // First try to find a non-busy worker
        const availableWorker = context.workerPool.find((worker) => !worker.busy);
        if (availableWorker) {
          availableWorker.busy = true;
          availableWorker.lastUsed = Date.now();
          return availableWorker;
        }

        // If all are busy, use the least recently used one
        if (context.workerPool.length > 0) {
          // Sort by last used timestamp (oldest first)
          const sortedWorkers = [...context.workerPool].sort((a, b) => a.lastUsed - b.lastUsed);
          sortedWorkers[0].busy = true;
          sortedWorkers[0].lastUsed = Date.now();
          return sortedWorkers[0];
        }

        return null;
      },

      async evaluateCode({ context, event, self }) {
        if (!isBrowser || !context.isInitialized) return;

        if (event.type !== 'evaluate') return;

        // Find an available worker or least recently used one
        let worker = context.workerPool.find((w) => !w.busy);

        if (!worker) {
          // If all workers are busy, pick the one used longest ago
          const sortedWorkers = [...context.workerPool].sort((a, b) => a.lastUsed - b.lastUsed);
          worker = sortedWorkers[0];
        }

        if (!worker) {
          // No workers available at all
          self.send({
            type: 'error',
            error: 'No workers available',
            clientId: event.clientId,
          });
          return;
        }

        // Mark the worker as busy
        worker.busy = true;
        worker.lastUsed = Date.now();

        try {
          // First extract parameters (for this client)
          const clientState = context.clientStates[event.clientId] || {
            shapes: [],
            defaultParameters: {},
          };

          // Merge parameters
          const mergedParameters = {
            ...clientState.defaultParameters,
            ...event.parameters,
          };

          const shapes = await worker.wrappedWorker.buildShapesFromCode(event.code, mergedParameters);

          if (shapes && typeof shapes === 'object' && 'error' in shapes) {
            self.send({
              type: 'error',
              error: (shapes as { message?: string }).message ?? 'Error building shapes',
              clientId: event.clientId,
            });
          } else {
            self.send({
              type: 'success',
              shapes: shapes as Shape[],
              clientId: event.clientId,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error evaluating code';
          self.send({
            type: 'error',
            error: errorMessage,
            clientId: event.clientId,
          });
        } finally {
          // Release the worker
          worker.busy = false;
          // Send event to process next operations
          self.send({ type: 'processNext' });
        }
      },

      async extractDefaultParameters({ context, event, self }) {
        if (!isBrowser || !context.isInitialized) return;

        if (event.type !== 'extractParameters') return;

        // Find an available worker or least recently used one
        let worker = context.workerPool.find((w) => !w.busy);

        if (!worker) {
          // If all workers are busy, pick the one used longest ago
          const sortedWorkers = [...context.workerPool].sort((a, b) => a.lastUsed - b.lastUsed);
          worker = sortedWorkers[0];
        }

        if (!worker) {
          // Don't report error for parameters extraction, just skip
          return;
        }

        // Mark the worker as busy
        worker.busy = true;
        worker.lastUsed = Date.now();

        try {
          const parameters = await worker.wrappedWorker.extractDefaultParametersFromCode(event.code);
          self.send({
            type: 'parameterSuccess',
            parameters,
            clientId: event.clientId,
          });
        } catch (error) {
          console.error('Error extracting parameters:', error);
          // Don't send an error event here to avoid disrupting the main flow
          // Just update with empty parameters
          self.send({
            type: 'parameterSuccess',
            parameters: {},
            clientId: event.clientId,
          });
        } finally {
          // Release the worker
          worker.busy = false;
          // Send event to process next operations
          self.send({ type: 'processNext' });
        }
      },

      async exportShapeAction({ context, event, self }) {
        if (!isBrowser || !context.isInitialized) return;

        if (event.type !== 'exportShape') return;

        // Find an available worker or least recently used one
        let worker = context.workerPool.find((w) => !w.busy);

        if (!worker) {
          // If all workers are busy, pick the one used longest ago
          const sortedWorkers = [...context.workerPool].sort((a, b) => a.lastUsed - b.lastUsed);
          worker = sortedWorkers[0];
        }

        if (!worker) {
          self.send({
            type: 'error',
            error: 'No workers available for export',
            clientId: event.clientId,
          });
          return;
        }

        // Mark the worker as busy
        worker.busy = true;
        worker.lastUsed = Date.now();

        try {
          const format = event.format as 'stl' | 'stl-binary' | 'step' | 'step-assembly';
          const result = await worker.wrappedWorker.exportShape(format);

          if (result && result.length > 0 && result[0].blob) {
            self.send({
              type: 'shapeExported',
              blob: result[0].blob,
              clientId: event.clientId,
            });
          } else {
            self.send({
              type: 'error',
              error: 'Failed to export shape',
              clientId: event.clientId,
            });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error exporting shape';
          self.send({
            type: 'error',
            error: errorMessage,
            clientId: event.clientId,
          });
        } finally {
          // Release the worker
          worker.busy = false;
          // Send event to process next operations
          self.send({ type: 'processNext' });
        }
      },

      setShapes: assign({
        clientStates({ context, event }) {
          if (event.type !== 'success') return context.clientStates;

          const clientState = context.clientStates[event.clientId] || {
            shapes: [],
            defaultParameters: {},
          };

          return {
            ...context.clientStates,
            [event.clientId]: {
              ...clientState,
              shapes: event.shapes,
              error: undefined,
            },
          };
        },
      }),

      setError: assign({
        clientStates({ context, event }) {
          if (event.type !== 'error') return context.clientStates;

          const clientState = context.clientStates[event.clientId] || {
            shapes: [],
            defaultParameters: {},
          };

          return {
            ...context.clientStates,
            [event.clientId]: {
              ...clientState,
              error: event.error,
            },
          };
        },
      }),

      setDefaultParameters: assign({
        clientStates({ context, event }) {
          if (event.type !== 'parameterSuccess') return context.clientStates;

          const clientState = context.clientStates[event.clientId] || {
            shapes: [],
            defaultParameters: {},
          };

          return {
            ...context.clientStates,
            [event.clientId]: {
              ...clientState,
              defaultParameters: event.parameters,
            },
          };
        },
      }),

      setExportedBlob: assign({
        clientStates({ context, event }) {
          if (event.type !== 'shapeExported') return context.clientStates;

          const clientState = context.clientStates[event.clientId] || {
            shapes: [],
            defaultParameters: {},
          };

          return {
            ...context.clientStates,
            [event.clientId]: {
              ...clientState,
              exportedBlob: event.blob,
            },
          };
        },
      }),

      cleanupClientState: assign({
        clientStates({ context, event }) {
          if (event.type !== 'clientDisconnect') return context.clientStates;

          // Create new object without the disconnected client
          const { [event.clientId]: _, ...remainingClients } = context.clientStates;
          return remainingClients;
        },
      }),

      processNextOperation() {
        // This action intentionally left empty
        // It serves as a trigger to process the next operation
        // after a worker has been released
      },
    },
  },
);

// Create a singleton kernel actor that all CAD machines can use
export const kernelActor = createActor(kernelMachine).start();
