import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useActorRef, useSelector } from '@xstate/react';
import type { OrbitControls } from 'three/addons';
import { graphicsActor, screenshotCapabilityActor } from '#routes/builds_.$id/graphics-actor.js';
import { controlsListenerMachine } from '#machines/controls-listener.machine.js';
import { updateCameraFov } from '#components/geometry/graphics/three/camera-reset.js';

/**
 * Component that bridges Three.js context with XState actors
 * Sets up screenshot capability, controls listeners, and FOV updates
 * Acts as the integration layer between Three.js and the graphics state machine
 */
export function ActorBridge(): ReactNode {
  const { gl, scene, camera, controls, invalidate } = useThree();

  // Subscribe to camera FOV angle from graphics actor
  const cameraFovAngle = useSelector(graphicsActor, (state) => state.context.cameraFovAngle);

  // Setup screenshot capability
  useEffect(() => {
    screenshotCapabilityActor.send({
      type: 'registerCapture',
      gl,
      scene,
      camera,
    });

    return () => {
      screenshotCapabilityActor.send({ type: 'unregisterCapture' });
    };
  }, [gl, scene, camera]);

  // Update camera FOV when angle changes, without resetting position
  // This preserves user's zoom and viewing angle while updating the FOV
  useEffect(() => {
    updateCameraFov({ camera, cameraFovAngle, invalidate });
  }, [cameraFovAngle, camera, invalidate]);

  // Setup controls listener
  useActorRef(controlsListenerMachine, {
    input: {
      graphicsActorRef: graphicsActor,
      controls: controls as OrbitControls,
    },
  });

  return null;
}
