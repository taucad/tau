import { createMachine, assign, assertEvent } from 'xstate';
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
  state: 'idle' | 'buffering' | 'rendering' | 'success' | 'error';
  kernelRef: ActorRefFrom<typeof kernelMachine> | undefined;
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
    },
    id: 'cad',
    entry: [
      assign({
        kernelRef({ spawn, self }) {
          const kernelRef = spawn(kernelMachine, { id: 'kernel' });

          // Subscribe to the kernel actor's state changes
          kernelRef.subscribe((state) => {
            // When kernel reaches success state, send success event to cad machine
            if (state.matches('success') && state.context.shapes) {
              self.send({ type: 'kernelSuccess', shapes: state.context.shapes });
            }

            // When kernel reaches error state, send error event to cad machine
            if (state.matches('error') && state.context.error !== undefined) {
              self.send({ type: 'kernelError', error: state.context.error });
            }

            // When default parameters are updated in kernel
            if (state.context.defaultParameters) {
              self.send({
                type: 'setDefaultParameters',
                parameters: state.context.defaultParameters,
              });
            }

            // When a blob has been exported
            if (state.context.exportedBlob) {
              self.send({
                type: 'shapeExported',
                // Use type assertion to ensure TS knows this is a Blob
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
      state: 'idle',
      kernelRef: undefined,
      exportedBlob: undefined,
    },
    initial: 'idle',
    states: {
      idle: {
        entry: assign({ state: 'idle' }),
        on: {
          setCode: {
            target: 'debouncing',
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                if (context.kernelRef && context.code) {
                  context.kernelRef.send({
                    type: 'extractParameters',
                    code: context.code,
                  });
                }
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
                if (context.kernelRef && event.type === 'exportShape') {
                  context.kernelRef.send({
                    type: 'exportShape',
                    format: event.format,
                  } as const);
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
        },
      },
      debouncing: {
        entry: assign({ state: 'buffering' }),
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
                if (context.kernelRef && context.code) {
                  context.kernelRef.send({
                    type: 'extractParameters',
                    code: context.code,
                  });
                }
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
                if (context.kernelRef && event.type === 'exportShape') {
                  context.kernelRef.send({
                    type: 'exportShape',
                    format: event.format,
                  } as const);
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
        },
      },
      compiling: {
        entry: [
          assign({ state: 'rendering' }),
          ({ context }) => {
            context.kernelRef?.send({
              type: 'evaluate',
              code: context.code,
              parameters: context.parameters,
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
                if (context.kernelRef && context.code) {
                  context.kernelRef.send({
                    type: 'extractParameters',
                    code: context.code,
                  });
                }
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
                if (context.kernelRef && event.type === 'exportShape') {
                  context.kernelRef.send({
                    type: 'exportShape',
                    format: event.format,
                  } as const);
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
        entry: assign({ state: 'success', error: undefined }),
        on: {
          setCode: {
            target: 'debouncing',
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                if (context.kernelRef && context.code) {
                  context.kernelRef.send({
                    type: 'extractParameters',
                    code: context.code,
                  });
                }
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
                if (context.kernelRef && event.type === 'exportShape') {
                  context.kernelRef.send({
                    type: 'exportShape',
                    format: event.format,
                  } as const);
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
          },
        },
      },
      error: {
        entry: assign({ state: 'error' }),
        on: {
          setCode: {
            target: 'debouncing',
            actions: [
              'setCode',
              ({ context }) => {
                // When code changes, extract parameters
                if (context.kernelRef && context.code) {
                  context.kernelRef.send({
                    type: 'extractParameters',
                    code: context.code,
                  });
                }
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
                if (context.kernelRef && event.type === 'exportShape') {
                  context.kernelRef.send({
                    type: 'exportShape',
                    format: event.format,
                  } as const);
                }
              },
            ],
          },
          shapeExported: {
            actions: 'setExportedBlob',
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
