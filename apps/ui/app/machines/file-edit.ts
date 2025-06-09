import { setup, fromPromise, assign } from 'xstate';

// Types for the API request and response
export type FileEditRequest = {
  targetFile: string;
  originalContent: string;
  codeEdit: string;
};

export type FileEditResult = {
  success: boolean;
  message: string;
  error?: string;
  editedContent?: string;
};

// Context
type FileEditContext = {
  request?: FileEditRequest;
  result?: FileEditResult;
  error?: string;
};

// Events
type FileEditEvent =
  | {
      type: 'applyEdit';
      request: FileEditRequest;
    }
  | { type: 'retry' }
  | { type: 'reset' };

// API call actor
const applyFileEditActor = fromPromise<FileEditResult, FileEditRequest>(async ({ input }) => {
  try {
    const response = await fetch(`${globalThis.window.ENV.TAU_API_URL}/v1/file-edit/apply`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      // If the API call fails, return the original content as a fallback
      return {
        success: false,
        message: `HTTP error! status: ${response.status}`,
        error: `Failed to connect to file edit service (${response.status})`,
        editedContent: input.originalContent, // Fallback to original content
      };
    }

    const result = (await response.json()) as FileEditResult;

    if (!result.success && result.error) {
      // If Morph processing fails, return the original content as a fallback
      return {
        success: false,
        message: result.message || 'File edit processing failed',
        error: result.error,
        editedContent: input.originalContent, // Fallback to original content
      };
    }

    return result;
  } catch (error) {
    // If there's a network error or other exception, return the original content
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return {
      success: false,
      message: 'File edit failed due to network or processing error',
      error: errorMessage,
      editedContent: input.originalContent, // Fallback to original content
    };
  }
});

export const fileEditMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as FileEditContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as FileEditEvent,
  },
  actors: {
    applyFileEditActor,
  },
  actions: {
    setRequest: assign({
      request({ event }) {
        if (event.type !== 'applyEdit') return undefined;
        return event.request;
      },
    }),
    setResult: assign({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- XState provides the result in event.output
      result: ({ event }) => (event as any).output,
    }),
    setErrorFromResult: assign({
      error: ({ context }) => context.result?.error ?? 'Unknown error occurred',
    }),
    clearError: assign({
      error: undefined,
    }),
    clearResult: assign({
      result: undefined,
    }),
  },
}).createMachine({
  id: 'fileEdit',
  context: {
    request: undefined,
    result: undefined,
    error: undefined,
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        applyEdit: {
          target: 'applying',
          actions: ['setRequest', 'clearError', 'clearResult'],
        },
      },
    },
    applying: {
      invoke: {
        id: 'applyFileEditActor',
        src: 'applyFileEditActor',
        input: ({ context }) => context.request!,
        onDone: [
          {
            target: 'error',
            guard({ event }) {
              const result = (event as unknown).output as FileEditResult;
              return !result.success;
            },
            actions: ['setResult', 'setErrorFromResult'],
          },
          {
            target: 'success',
            actions: 'setResult',
          },
        ],
        onError: {
          target: 'error',
          actions: assign({
            error({ event }) {
              const { error } = event as unknown;
              return error instanceof Error ? error.message : 'Unknown error occurred';
            },
          }),
        },
      },
    },
    success: {
      on: {
        applyEdit: {
          target: 'applying',
          actions: ['setRequest', 'clearError', 'clearResult'],
        },
        reset: {
          target: 'idle',
          actions: ['clearError', 'clearResult'],
        },
      },
    },
    error: {
      on: {
        retry: {
          target: 'applying',
          actions: 'clearError',
        },
        applyEdit: {
          target: 'applying',
          actions: ['setRequest', 'clearError', 'clearResult'],
        },
        reset: {
          target: 'idle',
          actions: ['clearError', 'clearResult'],
        },
      },
    },
  },
});
