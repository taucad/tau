import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import type { OrbitControls } from 'three/addons';
import { ControlsListenerBridge } from '#components/geometry/graphics/three/controls-listener-bridge.js';
import { updateCameraFov } from '#components/geometry/graphics/three/utils/camera.utils.js';
import { useGraphics, useGraphicsSelector, useScreenshotCapability } from '#hooks/use-graphics.js';

/**
 * Component that bridges Three.js context with XState actors
 * Sets up screenshot capability, controls listeners, and FOV updates
 * Acts as the integration layer between Three.js and the graphics state machine
 */
export function ActorBridge(): ReactNode {
  const { gl, scene, camera, controls, invalidate } = useThree();
  const screenshotCapabilityActor = useScreenshotCapability();
  const graphicsActor = useGraphics();

  // Subscribe to camera FOV angle from graphics actor
  const cameraFovAngle = useGraphicsSelector((state) => state.context.cameraFovAngle);

  // Setup screenshot capability
  useEffect(() => {
    screenshotCapabilityActor.send({
      type: 'registerCapture',
      gl,
      scene,
      camera,
    });

    return () => {
      screenshotCapabilityActor.send({ type: 'unregisterCapture', captureMode: 'threejs' });
    };
  }, [gl, scene, camera, screenshotCapabilityActor]);

  // Update camera FOV when angle changes, without resetting position
  // This preserves user's zoom and viewing angle while updating the FOV
  useEffect(() => {
    updateCameraFov({ camera, cameraFovAngle, invalidate });
  }, [cameraFovAngle, camera, invalidate]);

  if (!controls) {
    return null;
  }

  return <ControlsListenerBridge controls={controls as OrbitControls} graphicsActor={graphicsActor} />;
}
