import { setup, sendTo, fromCallback, assertEvent } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import * as THREE from 'three';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import {
  getControlsDistance,
  getControlsListenerEventNames as resolveControlsListenerEventNames,
  isCameraControls,
  isClassicTargetControls,
} from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import type { ControlEventListener } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';

export type CameraControlsAdapter = {
  addEventListener: (type: string, listener: ControlEventListener) => void;
  removeEventListener: (type: string, listener: ControlEventListener) => void;
  object?: THREE.Camera;
  camera?: THREE.Camera;
  target?: THREE.Vector3;
  getDistance?: () => number;
  getTarget?: (target: THREE.Vector3, receiveEndValue?: boolean) => THREE.Vector3;
  distance?: number;
};

export const getControlsListenerCamera = (controls: CameraControlsAdapter): THREE.Camera | undefined =>
  controls.object ?? controls.camera;

export const getControlsListenerEventNames = resolveControlsListenerEventNames;

export const getControlsListenerDistance = (controls: CameraControlsAdapter): number => {
  const camera = getControlsListenerCamera(controls);
  if (!camera) {
    return 0;
  }

  if (isCameraControls(controls) || isClassicTargetControls(controls)) {
    return getControlsDistance({ camera, controls });
  }

  return camera.position.length();
};

type ControlsListenerInput = {
  graphicsActorRef: ActorRefFrom<typeof graphicsMachine>;
  controls: CameraControlsAdapter;
};

type ControlsListenerEvent =
  | { type: 'stopListening' }
  | { type: 'controlsInteractionStart' }
  | { type: 'controlsInteractionMoved' }
  | {
      type: 'controlsInteractionEnd';
      zoom: number;
    }
  | {
      type: 'controlsChanged';
      zoom: number;
      position: number;
      fov: number;
    };

const controlsListenerLogic = fromCallback<ControlsListenerEvent, ControlsListenerInput>(
  ({ input, sendBack, receive }) => {
    const { controls } = input;
    // oxlint-disable-next-line prefer-const -- false positive, it is reassigned in the code
    let originalDistance: number | undefined;
    let isListening = true;
    let isControlsInteractionActive = false;
    let hasSentMovementForInteraction = false;

    // Add variables to track last values for threshold checking
    let lastZoom = 1;
    let lastPosition = 0;
    let lastFov = 75;

    const calculateZoom = (): number => {
      const distance =
        typeof controls.getDistance === 'function'
          ? controls.getDistance()
          : (controls.distance ?? getControlsListenerDistance(controls));
      if (distance && originalDistance) {
        return originalDistance / distance;
      }

      return 1;
    };

    const getCameraProperties = () => {
      const camera = controls.object ?? controls.camera;
      if (!camera) {
        return { position: 0, fov: 75 };
      }
      const position = getControlsListenerDistance(controls);
      const fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : 75;
      return { position, fov };
    };

    // Extract common logic for calculating and sending control values
    const sendCurrentControlsState = (forceUpdate = false) => {
      if (!isListening) {
        return;
      }

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
      if (!isListening) {
        return;
      }

      isControlsInteractionActive = true;
      hasSentMovementForInteraction = false;
      sendBack({ type: 'controlsInteractionStart' });
    };

    const markControlsInteractionMoved = () => {
      if (!isListening) {
        return;
      }

      if (isControlsInteractionActive && !hasSentMovementForInteraction) {
        hasSentMovementForInteraction = true;
        sendBack({ type: 'controlsInteractionMoved' });
      }
    };

    const handleControlsStateChange = () => {
      if (!isListening) {
        return;
      }

      if (stateChangeEvent === userMoveEvent) {
        markControlsInteractionMoved();
      }

      // Set original distance on first change if not set
      originalDistance ??=
        typeof controls.getDistance === 'function'
          ? controls.getDistance()
          : (controls.distance ?? getControlsListenerDistance(controls));

      sendCurrentControlsState();
    };

    const handleControlsEnd = () => {
      if (!isListening) {
        return;
      }

      isControlsInteractionActive = false;
      hasSentMovementForInteraction = false;
      const zoom = calculateZoom();

      sendBack({ type: 'controlsInteractionEnd', zoom });
    };

    const {
      start: startEvent,
      stateChange: stateChangeEvent,
      userMove: userMoveEvent,
      end: endEvent,
    } = getControlsListenerEventNames(controls);

    const removeListeners = () => {
      controls.removeEventListener(startEvent, handleControlsStart);
      controls.removeEventListener(stateChangeEvent, handleControlsStateChange);
      if (userMoveEvent !== stateChangeEvent) {
        controls.removeEventListener(userMoveEvent, markControlsInteractionMoved);
      }
      controls.removeEventListener(endEvent, handleControlsEnd);
    };

    // Add event listeners
    controls.addEventListener(startEvent, handleControlsStart);
    controls.addEventListener(stateChangeEvent, handleControlsStateChange);
    if (userMoveEvent !== stateChangeEvent) {
      controls.addEventListener(userMoveEvent, markControlsInteractionMoved);
    }
    controls.addEventListener(endEvent, handleControlsEnd);

    // Set initial distance and send initial state
    originalDistance =
      typeof controls.getDistance === 'function'
        ? controls.getDistance()
        : (controls.distance ?? getControlsListenerDistance(controls));

    // Send initial controls state
    sendCurrentControlsState(true);

    // Listen for commands from parent machine
    receive((event) => {
      if (event.type === 'stopListening') {
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
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    input: {} as ControlsListenerInput,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
    events: {} as ControlsListenerEvent,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- xstate config
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
    sendControlsInteractionMoved: sendTo(({ context }) => context.graphicsActorRef, {
      type: 'controlsInteractionMoved',
    }),
    sendControlsInteractionEnd: sendTo(
      ({ context }) => context.graphicsActorRef,
      ({ event }) => {
        assertEvent(event, 'controlsInteractionEnd');
        return {
          type: 'controlsInteractionEnd',
          zoom: event.zoom,
        };
      },
    ),
    sendControlsChanged: sendTo(
      ({ context }) => context.graphicsActorRef,
      ({ event }) => {
        assertEvent(event, 'controlsChanged');
        return {
          type: 'controlsChanged',
          zoom: event.zoom,
          position: event.position,
          fov: event.fov,
        };
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
        controlsInteractionMoved: {
          actions: 'sendControlsInteractionMoved',
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
