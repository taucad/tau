import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useThree } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import { OrthographicCamera, Vector3 } from 'three';
import { perspectiveVerticalSpan } from '@taucad/camera';
import { selectCameraDriverSnapshot } from '@taucad/camera/machine';
import type { CameraDriverSnapshot } from '@taucad/camera/machine';
import { resolveMetersPerRenderUnit, shouldRebaseRenderFrame, shouldRescaleRenderFrame } from '@taucad/spatial';
import type { ThreeCamera } from '@taucad/three/camera';
import { fromThreeRenderPoint, toThreeRenderPoint } from '@taucad/three/spatial';
import { ControlsListenerBridge } from '#components/geometry/graphics/three/controls-listener-bridge.js';
import { retargetCameraControls } from '#components/geometry/graphics/three/controls/tau-camera-controls.js';
import { syncControlsLookAt } from '#components/geometry/graphics/three/utils/camera-controls-adapter.js';
import {
  useCameraConnectorRef,
  useCameraConsumersRef,
  useCameraRig,
  useGraphics,
  useRenderFrame,
  useSetRenderFrame,
} from '#hooks/use-graphics.js';
import type { CameraControlsAdapter } from '#machines/controls-listener.machine.js';

const getPixelRatio = (): number => {
  const pixelRatio = Reflect.get(globalThis, 'devicePixelRatio');
  return Math.min(typeof pixelRatio === 'number' && pixelRatio > 0 ? pixelRatio : 1, 2);
};

const setCameraConnector = (
  ref: RefObject<((camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void) | undefined>,
  connector: ((camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void) | undefined,
): void => {
  ref.current = connector;
};

const publishInitialCamera = (
  publish: (camera: ThreeCamera, snapshot: CameraDriverSnapshot) => void,
  rig: ReturnType<typeof useCameraRig>,
): void => {
  publish(rig.activeCamera, selectCameraDriverSnapshot(rig.actorRef.getSnapshot()));
};

/**
 * Component that bridges Three.js context with XState actors
 * Publishes the portable rig camera atomically and sets up controls listeners.
 * Acts as the integration layer between Three.js and the graphics state machine
 */
export function ActorBridge(): ReactNode {
  const { controls, get, invalidate, set, size } = useThree();
  const graphicsActor = useGraphics();
  const rig = useCameraRig();
  const connectorRef = useCameraConnectorRef();
  const consumersRef = useCameraConsumersRef();
  const renderFrame = useRenderFrame();
  const setRenderFrame = useSetRenderFrame();
  const synchronizingControlsRef = useRef(false);
  const lastPublicationRef = useRef<{ camera: ThreeCamera; revision: number; near: number; far: number } | undefined>(
    undefined,
  );

  useLayoutEffect(() => {
    Reflect.set(rig.perspectiveCamera, 'manual', true);
    Reflect.set(rig.orthographicCamera, 'manual', true);

    const publish = (camera: ThreeCamera, snapshot: CameraDriverSnapshot): void => {
      const previous = lastPublicationRef.current;
      if (
        previous?.camera === camera &&
        previous.revision === snapshot.revision &&
        previous.near === camera.near &&
        previous.far === camera.far
      ) {
        return;
      }
      const currentControls = get().controls;
      synchronizingControlsRef.current = true;
      try {
        if (currentControls instanceof CameraControlsImpl) {
          retargetCameraControls({ controls: currentControls, camera });
          const [targetX, targetY, targetZ] = snapshot.view.target;
          syncControlsLookAt({
            camera,
            controls: currentControls,
            target: toThreeRenderPoint({ renderFrame: rig.renderFrame, pointMeters: [targetX, targetY, targetZ] }),
            transition: false,
          });
          currentControls.update(0);
        }
        for (const retarget of consumersRef.current) {
          retarget(camera, snapshot);
        }
      } finally {
        synchronizingControlsRef.current = false;
      }

      const state = get();
      state.raycaster.near = camera.near;
      state.raycaster.far = camera.far;
      graphicsActor.send({ type: 'cameraViewChanged', verticalSpan: snapshot.view.verticalSpan });
      if (state.camera !== camera) {
        set({ camera });
      }
      lastPublicationRef.current = { camera, revision: snapshot.revision, near: camera.near, far: camera.far };
      invalidate();
    };

    setCameraConnector(connectorRef, publish);
    publishInitialCamera(publish, rig);
    return () => {
      if (connectorRef.current === publish) {
        setCameraConnector(connectorRef, undefined);
      }
    };
  }, [connectorRef, consumersRef, get, graphicsActor, invalidate, rig, set]);

  useLayoutEffect(() => {
    if (size.width <= 0 || size.height <= 0) {
      return;
    }
    rig.actorRef.send({
      type: 'setViewport',
      viewport: { width: size.width, height: size.height, pixelRatio: getPixelRatio() },
    });
  }, [rig, size.height, size.width]);

  useEffect(() => {
    if (!(controls instanceof CameraControlsImpl)) {
      return;
    }

    const handleControlsUpdate = (): void => {
      if (synchronizingControlsRef.current) {
        return;
      }
      const { camera } = controls;
      const target = controls.getTarget(new Vector3(), false);
      const offset = camera.position.clone().sub(target);
      if (offset.lengthSq() === 0) {
        return;
      }
      const physicalTarget = fromThreeRenderPoint({ renderFrame, point: target });
      const verticalSpan =
        camera instanceof OrthographicCamera
          ? ((camera.top - camera.bottom) / camera.zoom) * renderFrame.metersPerRenderUnit
          : perspectiveVerticalSpan({
              distance: offset.length() * renderFrame.metersPerRenderUnit,
              verticalFieldOfView: camera.fov,
              zoom: camera.zoom,
            });
      rig.actorRef.send({
        type: 'setView',
        target: physicalTarget,
        direction: [offset.x / offset.length(), offset.y / offset.length(), offset.z / offset.length()],
        up: [camera.up.x, camera.up.y, camera.up.z],
        verticalSpan,
        ...(camera instanceof OrthographicCamera ? {} : { perspectiveZoom: camera.zoom }),
      });
      const rescale = shouldRescaleRenderFrame({ renderFrame, visibleSpanMeters: verticalSpan });
      if (rescale || shouldRebaseRenderFrame({ renderFrame, targetMeters: physicalTarget })) {
        setRenderFrame({
          anchorFrameId: renderFrame.anchorFrameId,
          originMeters: physicalTarget,
          metersPerRenderUnit: rescale
            ? resolveMetersPerRenderUnit({ characteristicLengthMeters: verticalSpan })
            : renderFrame.metersPerRenderUnit,
        });
      }
    };

    controls.addEventListener('update', handleControlsUpdate);
    return () => {
      controls.removeEventListener('update', handleControlsUpdate);
    };
  }, [controls, renderFrame, rig, setRenderFrame]);

  if (!controls) {
    return null;
  }

  return <ControlsListenerBridge controls={controls as CameraControlsAdapter} graphicsActor={graphicsActor} />;
}
