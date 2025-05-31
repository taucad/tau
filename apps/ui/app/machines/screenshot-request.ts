import { setup, assertEvent, enqueueActions, assign, fromCallback } from 'xstate';
import type { ActorRefFrom, AnyActorRef } from 'xstate';
import type { ScreenshotOptions } from '~/types/graphics.js';
import type { graphicsMachine } from '~/machines/graphics.js';

// Context type
type ScreenshotRequestContext = {
  graphicsRef: AnyActorRef;
  currentRequest?: {
    requestId: string;
    options: ScreenshotOptions;
    onSuccess?: (dataUrls: string[]) => void;
    onError?: (error: string) => void;
  };
  error?: string;
};

// Event types
type ScreenshotRequestEvent =
  | {
      type: 'requestScreenshot';
      options: ScreenshotOptions;
      onSuccess?: (dataUrls: string[]) => void;
      onError?: (error: string) => void;
    }
  | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  | { type: 'cancel' };

// Input type
type ScreenshotRequestInput = {
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
};

/**
 * Screenshot Request Machine
 *
 * Centralizes all screenshot request/response handling.
 * Manages the request lifecycle and provides callback-based results.
 * Eliminates duplicated request logic across components.
 * Handles its own subscriptions to graphics actor events.
 */
export const screenshotRequestMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as ScreenshotRequestContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as ScreenshotRequestEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as ScreenshotRequestInput,
  },
  actors: {
    graphicsListener: fromCallback<
      | { type: 'screenshotCompleted'; dataUrls: string[]; requestId: string }
      | { type: 'screenshotFailed'; error: string; requestId: string },
      ScreenshotRequestInput
    >(({ input, sendBack }) => {
      const { graphicsRef } = input;

      // Subscribe to graphics actor events and forward them
      const completedSubscription = graphicsRef.on('screenshotCompleted', (event) => {
        sendBack({
          type: 'screenshotCompleted',
          dataUrls: event.dataUrls,
          requestId: event.requestId,
        });
      });

      const failedSubscription = graphicsRef.on('screenshotFailed', (event) => {
        sendBack({
          type: 'screenshotFailed',
          error: event.error,
          requestId: event.requestId,
        });
      });

      // Cleanup function
      return () => {
        completedSubscription.unsubscribe();
        failedSubscription.unsubscribe();
      };
    }),
  },
  actions: {
    sendRequest: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'requestScreenshot');

      const requestId = crypto.randomUUID();

      // Store request details in context
      enqueue.assign({
        currentRequest: {
          requestId,
          options: event.options,
          onSuccess: event.onSuccess,
          onError: event.onError,
        },
        error: undefined,
      });

      // Send request to graphics actor
      enqueue.sendTo(context.graphicsRef, {
        type: 'takeScreenshot',
        requestId,
        options: event.options,
      });
    }),

    handleSuccess: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'screenshotCompleted');

      if (context.currentRequest?.requestId === event.requestId) {
        // Call success callback if provided
        context.currentRequest.onSuccess?.(event.dataUrls);

        // Clear current request
        enqueue.assign({
          currentRequest: undefined,
          error: undefined,
        });
      }
    }),

    handleError: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'screenshotFailed');

      if (context.currentRequest?.requestId === event.requestId) {
        // Call error callback if provided
        context.currentRequest.onError?.(event.error);

        // Store error and clear request
        enqueue.assign({
          currentRequest: undefined,
          error: event.error,
        });
      }
    }),

    cancel: assign({
      currentRequest: undefined,
      error: 'Request cancelled',
    }),
  },
  guards: {
    hasActiveRequest: ({ context }) => Boolean(context.currentRequest),
  },
}).createMachine({
  id: 'screenshotRequest',
  context: ({ input }) => ({
    graphicsRef: input.graphicsRef,
    currentRequest: undefined,
    error: undefined,
  }),
  initial: 'idle',
  // Auto-start graphics event listener
  invoke: {
    id: 'graphicsListener',
    src: 'graphicsListener',
    input: ({ context }) => ({ graphicsRef: context.graphicsRef }),
  },
  states: {
    idle: {
      on: {
        requestScreenshot: {
          target: 'requesting',
          actions: 'sendRequest',
        },
        // Handle events from graphics listener
        screenshotCompleted: {
          actions: 'handleSuccess',
        },
        screenshotFailed: {
          actions: 'handleError',
        },
      },
    },
    requesting: {
      on: {
        screenshotCompleted: {
          target: 'idle',
          actions: 'handleSuccess',
        },
        screenshotFailed: {
          target: 'idle',
          actions: 'handleError',
        },
        cancel: {
          target: 'idle',
          actions: 'cancel',
        },
        // Allow new requests to override current one
        requestScreenshot: {
          actions: 'sendRequest',
        },
      },
    },
  },
});
