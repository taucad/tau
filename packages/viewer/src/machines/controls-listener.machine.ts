import { createCallbackLogic, setup, types } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import type { Vector3 } from 'three';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { getControlsListenerEventNames as resolveControlsListenerEventNames } from '#graphics/three/utils/camera-controls-adapter.js';
import type { ControlEventListener } from '#graphics/three/utils/camera-controls-adapter.js';
import { eventSchemas } from '#machines/machine-schemas.js';

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

/** Events the controls listener and its monitor share. */
export type ControlsListenerEvent =
  | { type: 'stopListening' }
  | { type: 'controlsInteractionStart' }
  | { type: 'controlsInteractionMoved' }
  | { type: 'controlsInteractionEnd' };

/** The controls listener's public alphabet: every {@link ControlsListenerEvent} type, in the union's order. */
export const controlsListenerEventTypes = [
  'stopListening',
  'controlsInteractionStart',
  'controlsInteractionMoved',
  'controlsInteractionEnd',
] as const satisfies ReadonlyArray<ControlsListenerEvent['type']>;

/**
 * The (state, event) pairs the controls listener leaves unanswered today (MC-R17): its totality baseline.
 * `stopListening` is the machine's message to its monitor, which the machine itself never handles.
 */
export const controlsListenerIgnoredEvents: ReadonlyArray<readonly [state: string, eventType: string]> = [
  ['active', 'stopListening'],
];

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
