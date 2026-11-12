/**
 * Kinematics in the Three viewer: hands graphics the presented scene's pose adapter, drives playback ticks while
 * playing and visible, owns drag-to-IK and, under the `tauDebug` flag, exposes `window.__TAU_KINEMATICS_TEST__` for
 * end-to-end assertions. Graphics loads the presented unit's mechanism into its kinematics child.
 */
import { useEffect, useMemo, useState } from 'react';
import { Box3, Matrix4, Vector3 } from 'three';
import type { Mesh, Object3D } from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { RootState, ThreeEvent } from '@react-three/fiber';
import { createCallbackLogic } from 'xstate';
import { createKinematicsPoseComposer } from '#graphics/three/react/kinematics-pose-composer.js';
import { useKinematicsDragControls } from '#graphics/three/react/kinematics-drag-controls-adapter.js';
import { getModelComponentId } from '#graphics/three/utils/model-component-owner.js';
import { useGraphics, useKinematicsRef } from '#hooks/use-graphics.jsx';
import type { KinematicsRef, KinematicsSceneAdapterLogic } from '#machines/graphics.machine.js';
import { getKinematicsUnitState } from '#machines/kinematics.machine.js';
import type { KinematicsUnitState } from '#machines/kinematics.machine.js';
import { useViewerFeature } from '#environment/viewer-environment.jsx';

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

/** One unit's playback, read on each render-loop frame. */
const selectUnitPlayback = (kinematicsRef: KinematicsRef, unitId: string): KinematicsUnitState['playback'] =>
  getKinematicsUnitState(kinematicsRef.getSnapshot().context, unitId).playback;

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
  const isTauDebugEnabled = useViewerFeature('tauDebug');
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

/** The playback clock's last frame time, which the scene adapter forgets when playback starts, stops or resumes. */
type PlaybackClock = { current: number | undefined };

/** Advances playback from the render loop, only while playing and while the document is visible. */
function useKinematicsPlaybackClock(unitId: string, clock: PlaybackClock): void {
  const kinematicsRef = useKinematicsRef();
  const invalidate = useThree((state) => state.invalidate);

  useFrame(() => {
    const playback = selectUnitPlayback(kinematicsRef, unitId);
    if (playback.status !== 'playing' || document.visibilityState === 'hidden') {
      clock.current = undefined;
      return;
    }
    const now = performance.now();
    const lastFrameAt = clock.current;
    clock.current = now;
    if (lastFrameAt !== undefined) {
      kinematicsRef.send({ type: 'tick', unitId, elapsed: Math.min(now - lastFrameAt, maxTickMilliseconds) / 1000 });
    }
    // Demand rendering: request the next frame only while the clip runs.
    invalidate();
  });
}

/** What a presented scene's kinematics adapter works on. */
export type KinematicsSceneHost = Readonly<{
  scene: Object3D;
  unitId: string;
  invalidate: () => void;
  clock: PlaybackClock;
}>;

/**
 * A presented scene's kinematics adapter, which graphics spawns with its kinematics child (charter D4). It keeps the
 * scene posed from each kinematics snapshot, so a playback or drag frame costs one matrix pass and one `invalidate()`
 * and never a React render. Playback is a demand-frame source even when its first pose equals the current pose, so a
 * start, and a return to a visible page while playing, request a frame. It returns the scene to its as-built pose
 * when it stops.
 *
 * @param host - The scene, its unit, the canvas's `invalidate` and the playback clock.
 * @returns Logic graphics spawns when the scene's ref callback hands it over.
 * @public
 */
export function createKinematicsSceneAdapter(host: KinematicsSceneHost): KinematicsSceneAdapterLogic {
  return createCallbackLogic(({ input }: { input: Readonly<{ kinematics: KinematicsRef }> }) => {
    const { scene, unitId, invalidate, clock } = host;
    const composer = createKinematicsPoseComposer(scene);
    let wasPlaying = false;
    const sync = (): void => {
      const unit = getKinematicsUnitState(input.kinematics.getSnapshot().context, unitId);
      let changed = composer.update(unit);
      const playing = unit.playback.status === 'playing';
      if (playing !== wasPlaying) {
        clock.current = undefined;
        wasPlaying = playing;
        changed ||= playing && document.visibilityState !== 'hidden';
      }
      if (changed) {
        invalidate();
      }
    };
    sync();
    const subscription = input.kinematics.subscribe(sync);
    const resume = (): void => {
      clock.current = undefined;
      if (wasPlaying && document.visibilityState !== 'hidden') {
        invalidate();
      }
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', resume);
      composer.reset();
      invalidate();
    };
  });
}

let nextKinematicsSceneId = 0;

/**
 * The presented scene's ref callback, which hands graphics the scene's kinematics adapter while the scene is attached
 * and takes it back when it leaves. It only sends attach and detach, the sanctioned way to hand a host to an actor; a
 * call with another scene (R3F re-sets a rebuilt primitive's earlier refs) is ignored.
 *
 * @public
 */
export function createKinematicsSceneAttach(
  graphicsActor: Readonly<{ send: ReturnType<typeof useGraphics>['send'] }>,
  scene: Readonly<{ sceneId: string; object: Object3D; adapter: KinematicsSceneAdapterLogic }> | undefined,
): (object: unknown) => void {
  return (object) => {
    // Another Three object is an earlier presentation's scene; a host node that is not one (a DOM test host) is ours.
    if (
      !scene ||
      (typeof object === 'object' && object !== null && 'isObject3D' in object && object !== scene.object)
    ) {
      return;
    }
    graphicsActor.send(
      object
        ? { type: 'kinematicsSceneAttached', sceneId: scene.sceneId, adapter: scene.adapter }
        : { type: 'kinematicsSceneDetached', sceneId: scene.sceneId },
    );
  };
}

type KinematicsViewerOptions = Readonly<{
  unitId: string;
  scene: Object3D | undefined;
  getPickableMeshes: () => readonly Mesh[];
}>;

/**
 * Wires one presented glTF unit to its kinematics actor. Graphics loads the unit's mechanism when the presentation
 * commits; this returns the scene's ref callback, which hands graphics the scene's pose adapter, and the primary
 * pointer-down handler that starts drag-to-IK.
 */
export function useKinematicsViewer({ unitId, scene, getPickableMeshes }: KinematicsViewerOptions): Readonly<{
  attachScene: (object: unknown) => void;
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void;
}> {
  const graphicsActor = useGraphics();
  const invalidate = useThree((state) => state.invalidate);
  const [clock] = useState<PlaybackClock>(() => ({ current: undefined }));

  const attachScene = useMemo(() => {
    if (!scene) {
      return createKinematicsSceneAttach(graphicsActor, undefined);
    }
    nextKinematicsSceneId += 1;
    return createKinematicsSceneAttach(graphicsActor, {
      sceneId: `kinematics-scene-${nextKinematicsSceneId}`,
      object: scene,
      adapter: createKinematicsSceneAdapter({ scene, unitId, invalidate, clock }),
    });
  }, [clock, graphicsActor, invalidate, scene, unitId]);

  useKinematicsPlaybackClock(unitId, clock);
  useKinematicsTestBridge(unitId, scene);
  const onPointerDown = useKinematicsDragControls({ unitId, scene, getPickableMeshes });
  return { attachScene, onPointerDown };
}
