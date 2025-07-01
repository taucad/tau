import { setup, sendTo, fromCallback } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { graphicsMachine } from '~/machines/graphics.machine.js';

type ControlsListenerInput = {
  graphicsActorRef: ActorRefFrom<typeof graphicsMachine>;
  controls: OrbitControls;
};

type ControlsListenerEvent =
  | { type: 'stopListening' }
  | { type: 'controlsInteractionStart' }
  | { type: 'controlsInteractionEnd' }
  | { type: 'controlsChanged'; zoom: number; position: number; fov: number };

const controlsListenerLogic = fromCallback<ControlsListenerEvent, ControlsListenerInput>(
  ({ input, sendBack, receive }) => {
    const { controls } = input;
    let originalDistance: number | undefined;
    let isListening = true;

    // Add variables to track last values for threshold checking
    let lastZoom = 1;
    let lastPosition = 0;
    let lastFov = 75;

    const calculateZoom = (): number => {
      const distance = controls.getDistance();
      if (distance && originalDistance) {
        return originalDistance / distance;
      }

      return 1;
    };

    const getCameraProperties = () => {
      const camera = controls.object;
      const position = camera.position.length();
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 75;
      return { position, fov };
    };

    // Extract common logic for calculating and sending control values
    const sendCurrentControlsState = (forceUpdate = false) => {
      if (!isListening) return;

      const zoom = calculateZoom();
      const { position, fov } = getCameraProperties();

      // Only send updates if values have changed significantly or forced
      if (
        forceUpdate ||
        Math.abs(zoom - lastZoom) > 0.1 ||
        Math.abs(position - lastPosition) > 0.1 ||
        Math.abs(fov - lastFov) > 0.1
      ) {
        lastZoom = zoom;
        lastPosition = position;
        lastFov = fov;

        sendBack({
          type: 'controlsChanged',
          zoom,
          position,
          fov,
        });
      }
    };

    const handleControlsStart = () => {
      if (!isListening) return;
      sendBack({ type: 'controlsInteractionStart' });
    };

    const handleControlsChange = () => {
      if (!isListening) return;

      // Set original distance on first change if not set
      if (!originalDistance && controls.getDistance) {
        originalDistance = controls.getDistance();
      }

      sendCurrentControlsState();
    };

    const handleControlsEnd = () => {
      if (!isListening) return;
      sendBack({ type: 'controlsInteractionEnd' });
    };

    const removeListeners = () => {
      controls.removeEventListener('start', handleControlsStart);
      controls.removeEventListener('change', handleControlsChange);
      controls.removeEventListener('end', handleControlsEnd);
    };

    // Add event listeners
    controls.addEventListener('start', handleControlsStart);
    controls.addEventListener('change', handleControlsChange);
    controls.addEventListener('end', handleControlsEnd);

    // Set initial distance and send initial state
    if (controls.getDistance) {
      originalDistance = controls.getDistance();
    }

    // Send initial controls state
    sendCurrentControlsState(true);

    // Listen for commands from parent machine
    receive((event) => {
      if (event.type === 'stopListening') {
        console.log('Controls listener stopping');
        isListening = false;
        removeListeners();
      }
    });

    // Cleanup function (called when actor is stopped)
    return () => {
      isListening = false;
      removeListeners();
    };
  },
);

export const controlsListenerMachine = setup({
  types: {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as ControlsListenerInput,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as ControlsListenerEvent,
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    context: {} as ControlsListenerInput,
  },
  actors: {
    controlsMonitor: controlsListenerLogic,
  },
  actions: {
    stopControlsMonitoring: sendTo('controlsMonitor', { type: 'stopListening' }),
    forwardZoomUpdate: sendTo('controlsMonitor', ({ event }) => event),
    sendControlsInteractionStart: sendTo(({ context }) => context.graphicsActorRef, {
      type: 'controlsInteractionStart',
    }),
    sendControlsInteractionEnd: sendTo(({ context }) => context.graphicsActorRef, { type: 'controlsInteractionEnd' }),
    sendControlsChanged: sendTo(
      ({ context }) => context.graphicsActorRef,
      ({ event }) => {
        if (event.type === 'controlsChanged') {
          return {
            type: 'controlsChanged',
            zoom: event.zoom,
            position: event.position,
            fov: event.fov,
          };
        }

        // This should never happen, but TypeScript requires it
        return { type: 'controlsChanged', zoom: 1, position: 0, fov: 75 };
      },
    ),
  },
}).createMachine({
  id: 'controlsListener',
  context: ({ input }) => input,
  initial: 'active',
  states: {
    active: {
      invoke: {
        id: 'controlsMonitor',
        src: 'controlsMonitor',
        input: ({ context }): ControlsListenerInput => ({
          graphicsActorRef: context.graphicsActorRef,
          controls: context.controls,
        }),
      },
      exit: 'stopControlsMonitoring',
      on: {
        controlsInteractionStart: {
          actions: 'sendControlsInteractionStart',
        },
        controlsInteractionEnd: {
          actions: 'sendControlsInteractionEnd',
        },
        controlsChanged: {
          actions: 'sendControlsChanged',
        },
      },
    },
  },
});
