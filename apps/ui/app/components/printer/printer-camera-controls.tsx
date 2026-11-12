import { useEffect, useImperativeHandle, useLayoutEffect, useState } from 'react';
import type { Ref } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { EventManager, RootState } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import * as THREE from 'three';
import type { CameraControlsFeel } from '@taucad/viewer/graphics/three/controls/camera-controls-feel';

let installed = false;
const installCameraControls = (): void => {
  if (installed) {
    return;
  }
  installed = true;
  /* eslint-disable @typescript-eslint/naming-convention -- `camera-controls` requires this exact install shape. */
  CameraControlsImpl.install({
    THREE: {
      Box3: THREE.Box3,
      MathUtils: { clamp: THREE.MathUtils.clamp },
      Matrix4: THREE.Matrix4,
      Quaternion: THREE.Quaternion,
      Raycaster: THREE.Raycaster,
      Sphere: THREE.Sphere,
      Spherical: THREE.Spherical,
      Vector2: THREE.Vector2,
      Vector3: THREE.Vector3,
      Vector4: THREE.Vector4,
    },
  });
  /* eslint-enable @typescript-eslint/naming-convention -- The install shape ends here. */
};

/** The render requests a `camera-controls` instance makes while it moves the camera. */
const movingEvents = ['controlstart', 'transitionstart', 'update', 'wake'] as const;

/**
 * The print preview's own `camera-controls`: one instance on the scene's camera, listening on R3F's event source,
 * stepped each frame and installed as R3F's `controls`. The print preview has no graphics actor, so it drives its
 * camera directly; the CAD viewer's controls belong to its controls adapter instead.
 *
 * @param props - The controls' feel, a ref to the instance and a callback for each person-driven move.
 * @returns The controls as an R3F primitive.
 */
export function PrinterCameraControls({
  ref,
  onControl,
  ...feel
}: CameraControlsFeel &
  Readonly<{
    ref?: Ref<CameraControlsImpl>;
    /** The person moved the camera. */
    onControl?: () => void;
  }>): React.JSX.Element {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const events = useThree((state) => state.events) as EventManager<HTMLElement>;
  const invalidate = useThree((state) => state.invalidate);
  const set = useThree((state) => state.set);
  const get = useThree((state) => state.get);
  const [controls] = useState(() => {
    installCameraControls();
    return new CameraControlsImpl(camera);
  });
  useImperativeHandle(ref, () => controls, [controls]);
  useFrame((_state, delta) => {
    if (controls.enabled) {
      controls.update(delta);
    }
  }, -1);

  const domElement = events.connected ?? gl.domElement;
  useEffect(() => {
    controls.connect(domElement);
    return () => {
      controls.disconnect();
    };
  }, [controls, domElement]);

  useEffect(() => {
    const requestFrame = (): void => {
      invalidate();
    };
    const handleControl = (): void => {
      invalidate();
      onControl?.();
    };
    for (const type of movingEvents) {
      controls.addEventListener(type, requestFrame);
    }
    controls.addEventListener('control', handleControl);
    return () => {
      for (const type of movingEvents) {
        controls.removeEventListener(type, requestFrame);
      }
      controls.removeEventListener('control', handleControl);
    };
  }, [controls, invalidate, onControl]);

  useLayoutEffect(() => {
    const previous = get().controls;
    // `camera-controls` ships its own event dispatcher, whose listener API matches three's but not its typings.
    set({ controls: controls as RootState['controls'] });
    return () => {
      set({ controls: previous });
    };
  }, [controls, get, set]);

  return <primitive object={controls} {...feel} />;
}
