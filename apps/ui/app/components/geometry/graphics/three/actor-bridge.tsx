import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useActorRef } from '@xstate/react';
import type { OrbitControls } from 'three/addons';
import { updateCameraFov } from '@taucad/three';
import { useViewerStore } from '@taucad/three/react';
import { controlsListenerMachine } from '#machines/controls-listener.machine.js';
import { useGraphics, useGraphicsSelector, useScreenshotCapability } from '#hooks/use-graphics.js';

/**
 * Bridges Three.js context with XState actors and syncs graphics machine
 * state to zustand viewer stores. Sets up screenshot capability, controls
 * listeners, and FOV updates.
 */
export function ActorBridge(): ReactNode {
  const { gl, scene, camera, controls, invalidate } = useThree();
  const screenshotCapabilityActor = useScreenshotCapability();
  const graphicsActor = useGraphics();

  const cameraFovAngle = useGraphicsSelector((state) => state.context.cameraFovAngle);
  const enableGrid = useGraphicsSelector((state) => state.context.enableGrid);
  const enableAxes = useGraphicsSelector((state) => state.context.enableAxes);
  const enableMatcap = useGraphicsSelector((state) => state.context.enableMatcap);
  const enableSurfaces = useGraphicsSelector((state) => state.context.enableSurfaces);
  const enableLines = useGraphicsSelector((state) => state.context.enableLines);
  const enableGizmo = useGraphicsSelector((state) => state.context.enableGizmo);
  const enablePostProcessing = useGraphicsSelector((state) => state.context.enablePostProcessing);

  const setFieldOfView = useViewerStore((s) => s.setFieldOfView);
  const setEnableGrid = useViewerStore((s) => s.setEnableGrid);
  const setEnableAxes = useViewerStore((s) => s.setEnableAxes);
  const setEnableMatcap = useViewerStore((s) => s.setEnableMatcap);
  const setEnableSurfaces = useViewerStore((s) => s.setEnableSurfaces);
  const setEnableLines = useViewerStore((s) => s.setEnableLines);
  const setEnableGizmo = useViewerStore((s) => s.setEnableGizmo);
  const setEnablePostProcessing = useViewerStore((s) => s.setEnablePostProcessing);

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

  useEffect(() => {
    updateCameraFov({ camera, cameraFovAngle, invalidate });
  }, [cameraFovAngle, camera, invalidate]);

  // Sync xstate graphics machine state → zustand viewer store
  useEffect(() => { setFieldOfView(cameraFovAngle); }, [cameraFovAngle, setFieldOfView]);
  useEffect(() => { setEnableGrid(enableGrid); }, [enableGrid, setEnableGrid]);
  useEffect(() => { setEnableAxes(enableAxes); }, [enableAxes, setEnableAxes]);
  useEffect(() => { setEnableMatcap(enableMatcap); }, [enableMatcap, setEnableMatcap]);
  useEffect(() => { setEnableSurfaces(enableSurfaces); }, [enableSurfaces, setEnableSurfaces]);
  useEffect(() => { setEnableLines(enableLines); }, [enableLines, setEnableLines]);
  useEffect(() => { setEnableGizmo(enableGizmo); }, [enableGizmo, setEnableGizmo]);
  useEffect(() => { setEnablePostProcessing(enablePostProcessing); }, [enablePostProcessing, setEnablePostProcessing]);

  useActorRef(controlsListenerMachine, {
    input: {
      graphicsActorRef: graphicsActor,
      controls: controls as OrbitControls,
    },
  });

  return null;
}
