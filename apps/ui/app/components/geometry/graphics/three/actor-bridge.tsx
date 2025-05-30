import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useActorRef, useSelector } from '@xstate/react';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useCameraProjection } from '~/components/geometry/graphics/three/use-camera-projection.js';
import { controlsListenerMachine } from '~/machines/controls-listener.js';
import { graphicsActor, screenshotCapabilityActor } from '~/routes/builds_.$id/graphics-actor.js';

/**
 * Component that bridges Three.js context with XState actors
 * Sets up screenshot capability and controls listeners
 * Acts as the integration layer between Three.js and the graphics state machine
 */
export function ActorBridge(): ReactNode {
  const { gl, scene, camera, controls, invalidate } = useThree();
  const cameraAngle = useSelector(graphicsActor, (state) => state.context.cameraAngle);

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

  // Setup controls listener
  useActorRef(controlsListenerMachine, {
    input: {
      graphicsActorRef: graphicsActor,
      controls: controls as OrbitControls,
    },
  });

  // Handle camera projection updates
  useCameraProjection(camera, cameraAngle, invalidate);

  return null;
}
