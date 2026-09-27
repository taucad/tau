/**
 * Kinematics in the Three viewer: loads the presented model's mechanism into the kinematics actor, keeps
 * the scene posed from it, drives playback ticks while playing and visible, owns drag-to-IK and, under the
 * `tauDebug` flag, exposes `window.__TAU_KINEMATICS_TEST__` for end-to-end assertions.
 */
import { useEffect, useRef } from 'react';
import { Box3, Matrix4, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { RootState, ThreeEvent } from '@react-three/fiber';
import type { GeometryComponentManifest } from '@taucad/types';
import { useKinematicsPoseComposer } from '#components/geometry/graphics/three/react/kinematics-pose-composer.js';
import { useKinematicsDragControls } from '#components/geometry/graphics/three/react/kinematics-drag-controls.js';
import { getModelComponentId } from '#components/geometry/graphics/three/utils/model-component-owner.js';
import { useFeature } from '#flags/use-feature.js';
import { useKinematicsRef } from '#hooks/use-graphics.js';
import type { KinematicsRef } from '#machines/graphics.machine.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import type { KinematicsUnitState } from '#machines/kinematics.machine.js';

/** Longest wall-clock step one playback tick may take, so a stalled or resumed tab does not jump. */
const maxTickMilliseconds = 100;

export type KinematicsTestState = Pick<
  KinematicsUnitState,
  'coordinates' | 'revision' | 'playback' | 'drag' | 'atLimit'
>;

export type KinematicsTestBridgeApi = Readonly<{
  getState: (unitId: string) => KinematicsTestState | undefined;
  /**
   * The component's rendered placement in the mechanism frame (GLB space): identity as built, the link
   * delta when posed. Column-major, 16 numbers; `undefined` when the component is not in the scene.
   */
  getComponentWorldMatrix: (unitId: string, componentId: string) => number[] | undefined;
  /** Viewport (client) pixel of the component's rendered bounds centre, for pointer-driven drags. */
  projectComponent: (unitId: string, componentId: string) => Readonly<{ x: number; y: number }> | undefined;
}>;

type KinematicsTestViewer = Readonly<{ kinematicsRef: KinematicsRef; scene: Object3D; get: () => RootState }>;

type KinematicsTestGlobal = typeof globalThis & { __TAU_KINEMATICS_TEST__?: KinematicsTestBridgeApi };

const testViewers = new Map<string, KinematicsTestViewer>();

const collectComponentObjects = (scene: Object3D, componentId: string): Object3D[] => {
  const objects: Object3D[] = [];
  scene.traverse((object) => {
    if (getModelComponentId(object) === componentId) {
      objects.push(object);
    }
  });
  return objects;
};

const kinematicsTestBridge: KinematicsTestBridgeApi = {
  getState(unitId) {
    const viewer = testViewers.get(unitId);
    if (!viewer) {
      return undefined;
    }
    const { coordinates, revision, playback, drag, atLimit } = getKinematicsUnitState(
      viewer.kinematicsRef.getSnapshot().context,
      unitId,
    );
    return { coordinates, revision, playback, drag, atLimit };
  },
  getComponentWorldMatrix(unitId, componentId) {
    const viewer = testViewers.get(unitId);
    const [object] = viewer ? collectComponentObjects(viewer.scene, componentId) : [];
    if (!viewer || !object) {
      return undefined;
    }
    viewer.scene.updateWorldMatrix(true, true);
    return new Matrix4().copy(viewer.scene.matrixWorld).invert().multiply(object.matrixWorld).toArray();
  },
  projectComponent(unitId, componentId) {
    const viewer = testViewers.get(unitId);
    const objects = viewer ? collectComponentObjects(viewer.scene, componentId) : [];
    if (!viewer || objects.length === 0) {
      return undefined;
    }
    viewer.scene.updateWorldMatrix(true, true);
    const bounds = new Box3();
    for (const object of objects) {
      bounds.expandByObject(object);
    }
    const { camera, gl } = viewer.get();
    const rect = gl.domElement.getBoundingClientRect();
    const projected = bounds.getCenter(new Vector3()).project(camera);
    return {
      x: rect.left + ((projected.x + 1) / 2) * rect.width,
      y: rect.top + ((1 - projected.y) / 2) * rect.height,
    };
  },
};

function useKinematicsTestBridge(unitId: string, scene: Object3D | undefined): void {
  const isTauDebugEnabled = useFeature('tauDebug');
  const kinematicsRef = useKinematicsRef();
  const get = useThree((state) => state.get);

  useEffect(() => {
    if (!isTauDebugEnabled || !scene) {
      return undefined;
    }
    const viewer: KinematicsTestViewer = { kinematicsRef, scene, get };
    const bridgeGlobal = globalThis as KinematicsTestGlobal;
    testViewers.set(unitId, viewer);
    bridgeGlobal.__TAU_KINEMATICS_TEST__ = kinematicsTestBridge;
    return () => {
      if (testViewers.get(unitId) === viewer) {
        testViewers.delete(unitId);
      }
      if (testViewers.size === 0) {
        delete bridgeGlobal.__TAU_KINEMATICS_TEST__;
      }
    };
  }, [get, isTauDebugEnabled, kinematicsRef, scene, unitId]);
}

/** Advances playback from the render loop, only while playing and while the document is visible. */
function useKinematicsPlaybackClock(unitId: string): void {
  const kinematicsRef = useKinematicsRef();
  const invalidate = useThree((state) => state.invalidate);
  const lastFrameAtRef = useRef<number | undefined>(undefined);

  useFrame(() => {
    const { playback } = getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId);
    if (playback.status !== 'playing' || document.visibilityState === 'hidden') {
      lastFrameAtRef.current = undefined;
      return;
    }
    const now = performance.now();
    const lastFrameAt = lastFrameAtRef.current;
    lastFrameAtRef.current = now;
    if (lastFrameAt !== undefined) {
      kinematicsRef.send({ type: 'tick', unitId, elapsed: Math.min(now - lastFrameAt, maxTickMilliseconds) / 1000 });
    }
    // Demand rendering: request the next frame only while the clip runs.
    invalidate();
  });

  // `play` changes the pose, which invalidates; a tab returning to view needs one frame to resume the clock.
  useEffect(() => {
    const resume = (): void => {
      invalidate();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
    };
  }, [invalidate]);
}

type KinematicsViewerOptions = Readonly<{
  unitId: string;
  scene: Object3D | undefined;
  manifest: GeometryComponentManifest | undefined;
  getPickableMeshes: () => readonly Mesh[];
}>;

/**
 * Wires one presented glTF unit to its kinematics actor and returns the primary pointer-down handler
 * that starts drag-to-IK.
 */
export function useKinematicsViewer({
  unitId,
  scene,
  manifest,
  getPickableMeshes,
}: KinematicsViewerOptions): (event: ThreeEvent<PointerEvent>) => void {
  const kinematicsRef = useKinematicsRef();
  const mechanism = manifest?.mechanism;

  // Load alongside `loadManifest`: every presentation carries (or drops) its mechanism.
  useEffect(() => {
    if (!manifest) {
      return;
    }
    kinematicsRef.send(mechanism ? { type: 'loadMechanism', unitId, mechanism } : { type: 'clearMechanism', unitId });
  }, [kinematicsRef, manifest, mechanism, unitId]);

  useEffect(
    () => () => {
      kinematicsRef.send({ type: 'clearMechanism', unitId });
    },
    [kinematicsRef, unitId],
  );

  useKinematicsPoseComposer(unitId, scene);
  useKinematicsPlaybackClock(unitId);
  useKinematicsTestBridge(unitId, scene);
  return useKinematicsDragControls({ unitId, scene, getPickableMeshes });
}
