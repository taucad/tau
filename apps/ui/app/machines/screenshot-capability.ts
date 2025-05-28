import { setup, sendTo, fromCallback, assertEvent, enqueueActions, assign } from 'xstate';
import type { AnyActorRef } from 'xstate';
import type { ScreenshotOptions } from '~/components/geometry/graphics/three/screenshot.js';

// Context type
type ScreenshotCapabilityContext = {
  graphicsRef: AnyActorRef;
  captureFunction?: (options?: ScreenshotOptions) => Promise<string>;
  queuedCaptureRequests: Array<{ options?: ScreenshotOptions; requestId: string }>;
  isRegistered: boolean;
  registrationError?: string;
};

// Event types
type ScreenshotCapabilityEvent =
  | { type: 'registerCapture'; capture: (options?: ScreenshotOptions) => Promise<string> }
  | { type: 'unregisterCapture' }
  | { type: 'capture'; options?: ScreenshotOptions; requestId: string }
  | { type: 'screenshotCompleted'; dataUrl: string; requestId: string }
  | { type: 'screenshotFailed'; error: string; requestId: string }
  | { type: 'registrationTimeout' };

// Input type
type ScreenshotCapabilityInput = {
  graphicsRef: AnyActorRef;
};

// Registration timeout in milliseconds
const registrationTimeout = 5000;

/**
 * Screenshot Capability Machine
 *
 * Bridges Three.js screenshot functionality with the graphics machine.
 * Handles registration of screenshot capture function and proxies requests.
 * Queues capture requests until camera is registered with a 5-second timeout.
 */
export const screenshotCapabilityMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as ScreenshotCapabilityContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as ScreenshotCapabilityEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as ScreenshotCapabilityInput,
  },
  actors: {
    captureScreenshot: fromCallback<
      | { type: 'screenshotCompleted'; dataUrl: string; requestId: string }
      | { type: 'screenshotFailed'; error: string; requestId: string },
      { capture: (options?: ScreenshotOptions) => Promise<string>; options?: ScreenshotOptions; requestId: string }
    >(({ input, sendBack }) => {
      const { capture, options, requestId } = input;

      (async () => {
        try {
          const dataUrl = await capture(options);
          console.log('Screenshot captured successfully');
          sendBack({ type: 'screenshotCompleted', dataUrl, requestId });
        } catch (error: unknown) {
          console.error('Screenshot capture failed:', error);
          sendBack({
            type: 'screenshotFailed',
            error: error instanceof Error ? error.message : 'Screenshot failed',
            requestId,
          });
        }
      })();
    }),
  },
  actions: {
    registerWithGraphics: enqueueActions(({ enqueue, context, event, self }) => {
      assertEvent(event, 'registerCapture');
      console.log('Screenshot capability: registering new capture function');
      context.captureFunction = event.capture;
      enqueue.sendTo(context.graphicsRef, {
        type: 'registerScreenshotCapability',
        actorRef: self,
      });
    }),
    unregisterFromGraphics: sendTo(({ context }) => context.graphicsRef, { type: 'unregisterScreenshotCapability' }),
    unregisterCapture: enqueueActions(({ enqueue, context }) => {
      console.log('Screenshot capability: unregistering capture function');
      enqueue.assign({
        captureFunction: undefined,
        isRegistered: false,
      });
      enqueue.sendTo(context.graphicsRef, { type: 'unregisterScreenshotCapability' });
    }),
    forwardResult: sendTo(
      ({ context }) => context.graphicsRef,
      ({ event }) => event,
    ),
    queueCaptureRequest: assign({
      queuedCaptureRequests({ context, event }) {
        assertEvent(event, 'capture');
        return [...context.queuedCaptureRequests, { options: event.options, requestId: event.requestId }];
      },
    }),
    processQueuedRequests: enqueueActions(({ enqueue, context, self }) => {
      // Process all queued capture requests
      for (const request of context.queuedCaptureRequests) {
        enqueue.sendTo(self, {
          type: 'capture',
          options: request.options,
          requestId: request.requestId,
        });
      }

      // Clear the queue
      enqueue.assign({
        queuedCaptureRequests: [],
      });
    }),
    failQueuedRequests: enqueueActions(({ enqueue, context }) => {
      // Fail all queued requests due to registration timeout
      for (const request of context.queuedCaptureRequests) {
        enqueue.sendTo(context.graphicsRef, {
          type: 'screenshotFailed',
          error: 'Screenshot capability registration timeout',
          requestId: request.requestId,
        });
      }

      // Clear the queue
      enqueue.assign({
        queuedCaptureRequests: [],
        registrationError: 'Registration timeout after 5 seconds',
      });
    }),
  },
  guards: {
    isRegistered: ({ context }) => context.isRegistered,
    hasQueuedRequests: ({ context }) => context.queuedCaptureRequests.length > 0,
  },
}).createMachine({
  id: 'screenshotCapability',
  context: ({ input }) => ({
    graphicsRef: input.graphicsRef,
    captureFunction: undefined,
    queuedCaptureRequests: [],
    isRegistered: false,
    registrationError: undefined,
  }),
  initial: 'waitingForRegistration',
  states: {
    // Waiting for camera registration with timeout
    waitingForRegistration: {
      after: {
        [registrationTimeout]: {
          target: 'registrationFailed',
          actions: 'failQueuedRequests',
        },
      },
      on: {
        registerCapture: [
          {
            guard: 'hasQueuedRequests',
            target: 'registered',
            actions: ['registerWithGraphics', 'processQueuedRequests'],
          },
          {
            target: 'registered',
            actions: 'registerWithGraphics',
          },
        ],
        capture: {
          actions: 'queueCaptureRequest',
        },
      },
    },
    registered: {
      on: {
        capture: {
          target: 'capturing',
        },
        // Allow re-registration when canvas is recreated
        registerCapture: {
          actions: 'registerWithGraphics',
        },
        unregisterCapture: {
          target: 'waitingForRegistration',
          actions: 'unregisterCapture',
        },
      },
    },
    capturing: {
      invoke: {
        id: 'captureScreenshot',
        src: 'captureScreenshot',
        input({ context, event }) {
          assertEvent(event, 'capture');
          return {
            capture: context.captureFunction!,
            options: event.options,
            requestId: event.requestId,
          };
        },
      },
      on: {
        screenshotCompleted: {
          target: 'registered',
          actions: 'forwardResult',
        },
        screenshotFailed: {
          target: 'registered',
          actions: 'forwardResult',
        },
        capture: {
          actions: 'queueCaptureRequest',
        },
        unregisterCapture: {
          target: 'waitingForRegistration',
          actions: 'unregisterCapture',
        },
      },
    },
    registrationFailed: {
      on: {
        registerCapture: {
          target: 'registered',
          actions: 'registerWithGraphics',
        },
        capture: {
          actions: enqueueActions(({ enqueue, context, event }) => {
            assertEvent(event, 'capture');
            // Immediately fail new capture requests when registration has failed
            enqueue.sendTo(context.graphicsRef, {
              type: 'screenshotFailed',
              error: context.registrationError ?? 'Screenshot capability not available',
              requestId: event.requestId,
            });
          }),
        },
      },
    },
  },
});
