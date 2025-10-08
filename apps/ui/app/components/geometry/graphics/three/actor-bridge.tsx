import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useActorRef } from '@xstate/react';
import type { OrbitControls } from 'three/addons';
import { graphicsActor, screenshotCapabilityActor } from '#routes/builds_.$id/graphics-actor.js';
import { controlsListenerMachine } from '#machines/controls-listener.machine.js';

/**
 * Component that bridges Three.js context with XState actors
 * Sets up screenshot capability and controls listeners
 * Acts as the integration layer between Three.js and the graphics state machine
 */
export function ActorBridge(): ReactNode {
  const { gl, scene, camera, controls } = useThree();

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

  return null;
}
