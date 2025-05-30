import { setup, sendTo, fromCallback, enqueueActions, assertEvent } from 'xstate';
import type { AnyActorRef } from 'xstate';

// Context type
type CameraCapabilityContext = {
  graphicsRef: AnyActorRef;
  resetFunction?: (options?: { withConfiguredAngles?: boolean }) => void;
};

// Event types
type CameraCapabilityEvent =
  | { type: 'registerReset'; reset: (options?: { withConfiguredAngles?: boolean }) => void }
  | { type: 'reset'; options?: { withConfiguredAngles?: boolean } }
  | { type: 'cameraResetCompleted' }
  | { type: 'cameraResetFailed'; error: unknown };

// Input type
type CameraCapabilityInput = {
  graphicsRef: AnyActorRef;
};

/**
 * Camera Capability Machine
 *
 * Bridges Three.js camera functionality with the graphics machine.
 * Handles registration of camera reset function and proxies requests.
 */
export const cameraCapabilityMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as CameraCapabilityContext,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as CameraCapabilityEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as CameraCapabilityInput,
  },
  actors: {
    resetCamera: fromCallback<
      { type: 'cameraResetCompleted' },
      { options?: { withConfiguredAngles?: boolean }; reset: CameraCapabilityContext['resetFunction'] }
    >(({ input, sendBack }) => {
      const { reset, options } = input;

      try {
        reset?.(options);
        console.log('Camera reset completed');
        sendBack({ type: 'cameraResetCompleted' });
      } catch (error) {
        console.error('Camera reset failed:', error);
        sendBack({ type: 'cameraResetFailed', error });
      }
    }),
  },
  actions: {
    registerWithGraphics: enqueueActions(({ enqueue, context, event, self }) => {
      assertEvent(event, 'registerReset');
      context.resetFunction = event.reset;
      enqueue.sendTo(context.graphicsRef, {
        type: 'registerCameraCapability',
        actorRef: self,
      });
    }),
    unregisterFromGraphics: sendTo(({ context }) => context.graphicsRef, { type: 'unregisterCameraCapability' }),
    forwardResult: sendTo(
      ({ context }) => context.graphicsRef,
      ({ event }) => event,
    ),
  },
}).createMachine({
  id: 'cameraCapability',
  context: ({ input }) => ({
    graphicsRef: input.graphicsRef,
    resetFunction: undefined,
  }),
  initial: 'unregistered',
  states: {
    unregistered: {
      on: {
        registerReset: {
          target: 'registered',
          actions: 'registerWithGraphics',
        },
      },
    },
    registered: {
      on: {
        reset: {
          target: 'resetting',
        },
      },
    },
    resetting: {
      invoke: {
        id: 'resetCamera',
        src: 'resetCamera',
        input({ context, event }) {
          assertEvent(event, 'reset');
          return {
            reset: context.resetFunction!,
            options: event.options,
          };
        },
      },
      on: {
        cameraResetCompleted: {
          target: 'registered',
          actions: 'forwardResult',
        },
        cameraResetFailed: {
          target: 'registered',
          actions: 'forwardResult',
        },
      },
    },
  },
});
