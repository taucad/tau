import { setup, assertEvent, enqueueActions, assign, fromCallback } from 'xstate';
import type { ActorRefFrom, AnyActorRef } from 'xstate';
import type { ScreenshotOptions, CameraAngle } from '~/types/graphics.js';
import type { graphicsMachine } from '~/machines/graphics.machine.js';

// Context type
type ScreenshotRequestContext = {
  graphicsRef: AnyActorRef;
  currentRequest?: {
    requestId: string;
    options: ScreenshotOptions;
    onSuccess?: (dataUrls: string[]) => void;
    onError?: (error: string) => void;
    isComposite?: boolean;
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
  | {
      type: 'requestCompositeScreenshot';
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

// Predefined orthographic views for easy reference
export const orthographicViews = [
  { label: 'front', phi: 90, theta: 270 },
  { label: 'back', phi: 90, theta: 90 },
  { label: 'right', phi: 90, theta: 0 },
  { label: 'left', phi: 90, theta: 180 },
  { label: 'top', phi: 0, theta: 0 },
  { label: 'bottom', phi: 180, theta: 0 },
  { label: 'front-left', phi: 90, theta: 225 },
  { label: 'front-right', phi: 90, theta: 315 },
  { label: 'front-top', phi: 45, theta: 270 },
  { label: 'front-bottom', phi: 135, theta: 270 },
  { label: 'back-left', phi: 90, theta: 135 },
  { label: 'back-right', phi: 90, theta: 225 },
  { label: 'back-top', phi: 45, theta: 90 },
  { label: 'back-bottom', phi: 135, theta: 90 },
  { label: 'front-top-left', phi: 45, theta: 315 },
  { label: 'front-top-right', phi: 45, theta: 45 },
  { label: 'front-bottom-left', phi: 135, theta: 315 },
  { label: 'front-bottom-right', phi: 135, theta: 45 },
  { label: 'back-top-left', phi: 45, theta: 225 },
  { label: 'back-top-right', phi: 45, theta: 135 },
  { label: 'back-bottom-left', phi: 135, theta: 225 },
  { label: 'back-bottom-right', phi: 135, theta: 135 },
] satisfies readonly CameraAngle[];

/**
 * Screenshot Request Machine
 *
 * Centralizes all screenshot request/response handling.
 * Manages the request lifecycle and provides callback-based results.
 * Eliminates duplicated request logic across components.
 * Handles its own subscriptions to graphics actor events.
 * Supports composite screenshot requests with optimal camera angle generation.
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
          isComposite: false,
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

    sendCompositeRequest: enqueueActions(({ enqueue, context, event }) => {
      assertEvent(event, 'requestCompositeScreenshot');

      const requestId = crypto.randomUUID();

      // Store request details in context
      enqueue.assign({
        currentRequest: {
          requestId,
          options: event.options,
          onSuccess: event.onSuccess,
          onError: event.onError,
          isComposite: true,
        },
        error: undefined,
      });

      // Send composite request directly to graphics actor
      // The graphics actor will handle forwarding to its screenshot capability
      enqueue.sendTo(context.graphicsRef, {
        type: 'takeCompositeScreenshot',
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
        requestCompositeScreenshot: {
          target: 'requesting',
          actions: 'sendCompositeRequest',
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
        requestCompositeScreenshot: {
          actions: 'sendCompositeRequest',
        },
      },
    },
  },
});
