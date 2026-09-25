import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Vector3 } from 'three';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { getControlsListenerEventNames as resolveControlsListenerEventNames } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import { eventSchemas } from '#lib/xstate.lib.js';

export type CameraControlsAdapter = {
  addEventListener: (type: string, listener: ControlEventListener) => void;
  removeEventListener: (type: string, listener: ControlEventListener) => void;
  getTarget?: (target: Vector3, receiveEndValue?: boolean) => Vector3;
  target?: Vector3;
  update?: () => void;
};

export const getControlsListenerEventNames = resolveControlsListenerEventNames;

type ControlsListenerInput = {
  graphicsActorRef: ActorRefFrom<typeof graphicsMachine>;
  controls: CameraControlsAdapter;
};

type ControlsListenerEvent =
  | { type: 'stopListening' }
  | { type: 'controlsInteractionStart' }
  | { type: 'controlsInteractionMoved' }
  | { type: 'controlsInteractionEnd' };

const controlsListenerLogic = createCallbackLogic<ControlsListenerEvent, ControlsListenerInput>(
  ({ input, sendBack, receive }) => {
    const { controls } = input;
    let isListening = true;
    let isInteractionActive = false;
    let movementReported = false;

    const handleStart = (): void => {
      if (!isListening) {
        return;
      }
      isInteractionActive = true;
      movementReported = false;
      sendBack({ type: 'controlsInteractionStart' });
    };
    const handleMove = (): void => {
      if (!isListening || !isInteractionActive || movementReported) {
        return;
      }
      movementReported = true;
      sendBack({ type: 'controlsInteractionMoved' });
    };
    const handleEnd = (): void => {
      if (!isListening) {
        return;
      }
      isInteractionActive = false;
      movementReported = false;
      sendBack({ type: 'controlsInteractionEnd' });
    };
    const events = getControlsListenerEventNames(controls);
    const removeListeners = (): void => {
      controls.removeEventListener(events.start, handleStart);
      controls.removeEventListener(events.userMove, handleMove);
      controls.removeEventListener(events.end, handleEnd);
    };

    controls.addEventListener(events.start, handleStart);
    controls.addEventListener(events.userMove, handleMove);
    controls.addEventListener(events.end, handleEnd);

    receive((event) => {
      if (event.type === 'stopListening') {
        isListening = false;
        removeListeners();
      }
    });

    return () => {
      isListening = false;
      removeListeners();
    };
  },
);

export const controlsListenerMachine = setup({
  schemas: {
    input: types<ControlsListenerInput>(),
    events: eventSchemas<ControlsListenerEvent>(),
    context: types<ControlsListenerInput>(),
  },
  actors: { controlsMonitor: controlsListenerLogic },
}).createMachine({
  id: 'controlsListener',
  context: ({ input }) => input,
  initial: 'active',
  states: {
    active: {
      invoke: {
        id: 'controlsMonitor',
        src: 'controlsMonitor',
        input: ({ context }) => ({ graphicsActorRef: context.graphicsActorRef, controls: context.controls }),
      },
      exit: (_, enq) => {
        enq.sendTo('controlsMonitor', { type: 'stopListening' });
      },
      on: {
        controlsInteractionStart: ({ context }, enq) => {
          enq.sendTo(context.graphicsActorRef, { type: 'controlsInteractionStart' });
          return {};
        },
        controlsInteractionMoved: ({ context }, enq) => {
          enq.sendTo(context.graphicsActorRef, { type: 'controlsInteractionMoved' });
          return {};
        },
        controlsInteractionEnd: ({ context }, enq) => {
          enq.sendTo(context.graphicsActorRef, { type: 'controlsInteractionEnd' });
          return {};
        },
      },
    },
  },
});
