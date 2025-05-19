import { createMachine, assign, assertEvent } from 'xstate';
import { kernelActor } from '~/machines/kernel.js';
import type { Shape } from '~/types/cad.js';

// Interface defining the context for the CAD machine
export type CadContext = {
  clientId: string;
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
  isBuffering: boolean;
  unsubscribe: (() => void) | undefined;
  exportedBlob: Blob | undefined;
};

// Define the types of events the machine can receive
type CadEvent =
  | { type: 'setCode'; code: string }
  | { type: 'setParameters'; parameters: Record<string, unknown> }
  | { type: 'compile' }
  | { type: 'setMonacoErrors'; errors: CadContext['monacoErrors'] }
  | { type: 'kernelSuccess'; shapes: Shape[] }
  | { type: 'kernelError'; error: string }
  | { type: 'setDefaultParameters'; parameters: Record<string, unknown> }
  | { type: 'exportShape'; format: string }
  | { type: 'shapeExported'; blob: Blob };

// Define input type for the machine
type CadMachineInput = {
  id?: string;
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
export const cadMachine = createMachine(
  {
    types: {
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
      context: {} as CadContext,
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
      events: {} as CadEvent,
      // Add input type
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate setup
      input: {} as CadMachineInput,
    },
    id: 'cad',
    context({ input }) {
      return {
        clientId: input?.id ?? 'cad-default', // Use nullish coalescing operator
        code: '',
        parameters: {},
        defaultParameters: {},
        shapes: [],
        error: undefined,
        monacoErrors: [],
        isBuffering: false,
        unsubscribe: undefined,
        exportedBlob: undefined,
      };
    },
    entry: assign({
      unsubscribe({ self }) {
        // Subscribe to the kernel actor
        const subscription = kernelActor.subscribe((state) => {
          // Get the client ID from the context (it's created when the machine starts)
          const { clientId } = self.getSnapshot().context;

          // Filter for updates relevant to this client ID
          const clientState = state.context.clientStates[clientId];
          if (!clientState) return;

          // Send relevant updates to this CAD machine
          if (clientState.shapes) {
            self.send({
              type: 'kernelSuccess',
              shapes: clientState.shapes,
            });
          }

          if (clientState.error) {
            self.send({
              type: 'kernelError',
              error: clientState.error,
            });
          }

          if (clientState.defaultParameters) {
            self.send({
              type: 'setDefaultParameters',
              parameters: clientState.defaultParameters,
            });
          }

          if (clientState.exportedBlob) {
            self.send({
              type: 'shapeExported',
              blob: clientState.exportedBlob,
            });
          }
        });

        // Return unsubscribe function to be stored in context
        return () => {
          subscription.unsubscribe();
        };
      },
    }),
    exit({ context }) {
      // Clean up subscription when machine stops
      if (context.unsubscribe) {
        context.unsubscribe();
      }

      // Tell kernel this client is disconnecting
      kernelActor.send({
        type: 'clientDisconnect',
        clientId: context.clientId,
      });
    },
    initial: 'idle',
    states: {
      idle: {
        on: {
          setCode: {
            target: 'debouncing',
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                kernelActor.send({
                  type: 'extractParameters',
                  code: context.code,
                  clientId: context.clientId,
                });
              },
            ],
          },
          setParameters: {
            target: 'debouncing',
            actions: 'setParameters',
          },
          setMonacoErrors: {
            actions: 'setMonacoErrors',
          },
          setDefaultParameters: {
            actions: 'setDefaultParameters',
          },
          compile: 'compiling',
          exportShape: {
            actions: [
              ({ context, event }) => {
                if (event.type === 'exportShape') {
                  kernelActor.send({
                    type: 'exportShape',
                    format: event.format,
                    clientId: context.clientId,
                  });
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
          kernelSuccess: {
            actions: 'setShapes',
          },
          kernelError: {
            actions: 'setError',
          },
        },
      },
      debouncing: {
        after: {
          [debounceDelay]: 'compiling',
        },
        on: {
          setCode: {
            target: 'debouncing',
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                kernelActor.send({
                  type: 'extractParameters',
                  code: context.code,
                  clientId: context.clientId,
                });
              },
            ],
            reenter: true, // Reset debounce timer when new code comes in
          },
          setParameters: {
            target: 'debouncing',
            actions: 'setParameters',
            reenter: true, // Reset debounce timer when parameters change
          },
          setMonacoErrors: {
            actions: 'setMonacoErrors',
          },
          setDefaultParameters: {
            actions: 'setDefaultParameters',
          },
          compile: 'compiling', // Allow forcing compilation
          exportShape: {
            actions: [
              ({ context, event }) => {
                if (event.type === 'exportShape') {
                  kernelActor.send({
                    type: 'exportShape',
                    format: event.format,
                    clientId: context.clientId,
                  });
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
          kernelSuccess: {
            actions: 'setShapes',
          },
          kernelError: {
            actions: 'setError',
          },
        },
      },
      compiling: {
        entry: [
          assign({ isBuffering: true }),
          ({ context }) => {
            kernelActor.send({
              type: 'evaluate',
              code: context.code,
              parameters: context.parameters,
              clientId: context.clientId,
            });
          },
        ],
        on: {
          kernelSuccess: {
            target: 'success',
            actions: 'setShapes',
          },
          kernelError: {
            target: 'error',
            actions: 'setError',
          },
          setCode: {
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                kernelActor.send({
                  type: 'extractParameters',
                  code: context.code,
                  clientId: context.clientId,
                });
              },
            ],
            target: 'debouncing',
          },
          setParameters: {
            actions: 'setParameters',
            target: 'debouncing',
          },
          setMonacoErrors: {
            actions: 'setMonacoErrors',
          },
          setDefaultParameters: {
            actions: 'setDefaultParameters',
          },
          exportShape: {
            actions: [
              ({ context, event }) => {
                if (event.type === 'exportShape') {
                  kernelActor.send({
                    type: 'exportShape',
                    format: event.format,
                    clientId: context.clientId,
                  });
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
        },
      },
      success: {
        entry: assign({ isBuffering: false, error: undefined }),
        on: {
          setCode: {
            target: 'debouncing',
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                kernelActor.send({
                  type: 'extractParameters',
                  code: context.code,
                  clientId: context.clientId,
                });
              },
            ],
          },
          setParameters: {
            target: 'debouncing',
            actions: 'setParameters',
          },
          setMonacoErrors: {
            actions: 'setMonacoErrors',
          },
          setDefaultParameters: {
            actions: 'setDefaultParameters',
          },
          compile: 'compiling',
          exportShape: {
            actions: [
              ({ context, event }) => {
                if (event.type === 'exportShape') {
                  kernelActor.send({
                    type: 'exportShape',
                    format: event.format,
                    clientId: context.clientId,
                  });
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
          kernelSuccess: {
            actions: 'setShapes',
          },
          kernelError: {
            actions: 'setError',
          },
        },
      },
      error: {
        entry: assign({ isBuffering: false }),
        on: {
          setCode: {
            target: 'debouncing',
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                kernelActor.send({
                  type: 'extractParameters',
                  code: context.code,
                  clientId: context.clientId,
                });
              },
            ],
          },
          setParameters: {
            target: 'debouncing',
            actions: 'setParameters',
          },
          setMonacoErrors: {
            actions: 'setMonacoErrors',
          },
          setDefaultParameters: {
            actions: 'setDefaultParameters',
          },
          compile: 'compiling',
          exportShape: {
            actions: [
              ({ context, event }) => {
                if (event.type === 'exportShape') {
                  kernelActor.send({
                    type: 'exportShape',
                    format: event.format,
                    clientId: context.clientId,
                  });
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
          kernelSuccess: {
            actions: 'setShapes',
          },
          kernelError: {
            actions: 'setError',
          },
        },
      },
    },
  },
  {
    actions: {
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
          assertEvent(event, 'kernelSuccess');
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
  },
);
