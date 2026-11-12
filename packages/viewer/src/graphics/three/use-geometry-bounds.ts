import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { SnapshotFrom } from 'xstate';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { CameraView } from '@taucad/camera';
import type { ThreeCameraRig } from '@taucad/three/camera';
import { fromThreeRenderBounds } from '@taucad/three/spatial';
import {
  useCameraRig,
  useGraphics,
  useGraphicsSelector,
  useKinematicsSelector,
  useRenderFrame,
} from '#hooks/use-graphics.jsx';
import { selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import { sceneTag } from '#graphics/three/utils/scene-tags.js';
import { resolveFramingStage } from '#graphics/three/framing-stage.js';
import type { StageOptions } from '#graphics/three/stage-options.js';
import type { KinematicsMachineContext, kinematicsMachine } from '#machines/kinematics.machine.js';

/** Retains Three's default object bounds while omitting presentation-only subtrees. */
class GeometryBoundsBox extends THREE.Box3 {
  public override expandByObject(object: THREE.Object3D, precise = false): this {
    return object.userData[sceneTag.gltfSurfacePresentation] ? this : super.expandByObject(object, precise);
  }
}

// Reusable temporaries for per-frame bounding calculations (avoids GC pressure).
// Safe for multi-Canvas use because JavaScript is single-threaded and each
// Canvas's render loop runs sequentially. Values are snapshotted into locals
// before any state updater runs to prevent cross-contamination from batching.
const _box3 = new GeometryBoundsBox();
const _centerPoint = new THREE.Vector3();
const _sphere = new THREE.Sphere();

/** Whether a drag or a playing clip is still moving a unit's pose. */
const isPoseMoving = ({ unitsById }: KinematicsMachineContext): boolean =>
  Object.values(unitsById).some((unit) => unit.drag !== undefined || unit.playback.status === 'playing');

/**
 * The pose revision once it has settled, and `undefined` while a drag or a clip still moves it. A settled revision
 * covers every pose change: the drags `poseSettled` reports, and the slider edits, resets, seeks and finished clips it
 * does not.
 */
const selectSettledPoseRevision = ({ context }: SnapshotFrom<typeof kinematicsMachine>): number | undefined =>
  isPoseMoving(context) ? undefined : context.revision;

/** The revision of the presentation on screen, which each committed presentation advances. */
const selectPresentedRevision = ({ context }: SnapshotFrom<typeof graphicsMachine>): number =>
  context.gltfPresentation.presentedRevision;

/** The camera's view, which supplies the up a configured orientation keeps and the surface's pixel ratio. */
const selectCameraView = (rig: ThreeCameraRig): CameraView => rig.actorRef.getSnapshot().context.view;

type GeometryBoundsResult = {
  /** The bounding sphere radius of the geometry. */
  geometryRadius: number;
  /** The bounding box center of the geometry. */
  geometryCenter: THREE.Vector3;
  /** Immutable snapshot of the geometry's world-space bounding box. */
  geometryBounds: THREE.Box3;
};

/**
 * Tracks the axis-aligned bounding box of the geometry inside `innerRef`,
 * exposes the bounding sphere radius and center as React state, and reports
 * each new measurement to the graphics actor as `geometryBoundsMeasured`,
 * which anchors the render frame and frames the camera (charter G5).
 *
 * Integrates with the graphics machine's `geometryKey` to avoid expensive
 * scene traversals once bounds have stabilized — they are only recomputed
 * when new geometry loads (key change) or a kinematic pose settles, then skipped
 * entirely during orbit/pan/zoom.
 *
 * Native render-local bounds are inverted through the current render frame;
 * callers therefore always receive physical metres.
 *
 * ponytail: the measuring half of the framing wiring until the presentation actor (G11b) measures on commit.
 */
export function useGeometryBounds(
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: RefObject<THREE.Group | null>,
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  outerRef: RefObject<THREE.Group | null>,
  stageOptions?: StageOptions,
): GeometryBoundsResult {
  const geometryKey = useGraphicsSelector(selectPresentedGeometryKey);
  const renderFrame = useRenderFrame();
  const graphicsActor = useGraphics();
  const cameraRig = useCameraRig();
  const get = useThree((state) => state.get);
  const invalidate = useThree((state) => state.invalidate);

  const [{ geometryRadius, geometryCenter, geometryBounds }, set] = useState<GeometryBoundsResult>({
    geometryRadius: 0,
    geometryCenter: new THREE.Vector3(),
    geometryBounds: new THREE.Box3(),
  });

  // Track geometry key changes to avoid expensive per-frame scene traversal.
  // When geometryKey changes, bounds are recomputed until they stabilize,
  // then skipped entirely during orbit/pan/zoom.
  const lastGeometryKeyRef = useRef<string | undefined>(undefined);
  const boundsStableRef = useRef(false);

  // A pose moves parts without a new geometry key, so bounds are measured again once it settles. Measuring
  // mid-drag would move the bounds under the pointer. The same key re-measured only refreshes the camera's bounds,
  // so settled pose bounds keep the camera where the person put it.
  const settledPoseRevision = useKinematicsSelector(selectSettledPoseRevision);
  const lastPoseRevisionRef = useRef(settledPoseRevision);

  // Each committed presentation is measured, so a new entry whose geometry keeps its key (an identical artifact)
  // still gets its first frame. An entry switch alone measures nothing; a remount or a settled pose before the new
  // entry's presentation commits still measures the geometry on screen, as before this lane.
  const presentedRevision = useGraphicsSelector(selectPresentedRevision);
  const lastPresentedRevisionRef = useRef(presentedRevision);

  // Framing keeps the stage of the last measurement for Fit view, so a new fit margin is measured again.
  const fitMargin = stageOptions?.fitMargin;
  const lastFitMarginRef = useRef(fitMargin);

  const measureBounds = useCallback(() => {
    if (!innerRef.current) {
      return;
    }

    // When geometryKey changes, invalidate stability
    if (geometryKey !== lastGeometryKeyRef.current) {
      lastGeometryKeyRef.current = geometryKey;
      boundsStableRef.current = false;
    }
    if (presentedRevision !== lastPresentedRevisionRef.current) {
      lastPresentedRevisionRef.current = presentedRevision;
      boundsStableRef.current = false;
    }
    if (settledPoseRevision !== undefined && settledPoseRevision !== lastPoseRevisionRef.current) {
      lastPoseRevisionRef.current = settledPoseRevision;
      boundsStableRef.current = false;
    }
    if (fitMargin !== lastFitMarginRef.current) {
      lastFitMarginRef.current = fitMargin;
      boundsStableRef.current = false;
    }

    // Skip expensive scene traversal and matrix updates once bounds have
    // stabilized. updateWorldMatrix(true, true) walks the full parent chain
    // and all descendants, so gating it behind the stability check avoids
    // unnecessary work during orbit/pan/zoom/resize.
    if (boundsStableRef.current) {
      return;
    }

    if (outerRef.current) {
      outerRef.current.updateWorldMatrix(true, false);
    }

    _box3.setFromObject(innerRef.current);

    // Don't mark stable or update state when the bounding box is empty
    // (geometry hasn't loaded yet -- GltfMesh parses GLTF asynchronously)
    if (_box3.isEmpty()) {
      return;
    }

    if (
      ![_box3.min.x, _box3.min.y, _box3.min.z, _box3.max.x, _box3.max.y, _box3.max.z].every((value) =>
        Number.isFinite(value),
      )
    ) {
      boundsStableRef.current = true;
      console.warn('Geometry produced non-finite viewport bounds', { key: geometryKey });
      return;
    }
    // The complete committed scene/settled pose is already in this frame. No convergence poll is needed.
    boundsStableRef.current = true;

    const physicalBounds = fromThreeRenderBounds({
      renderFrame,
      bounds: _box3,
    });
    const snapshotBounds = new THREE.Box3(
      new THREE.Vector3(...physicalBounds.min),
      new THREE.Vector3(...physicalBounds.max),
    );
    snapshotBounds.getCenter(_centerPoint);
    snapshotBounds.getBoundingSphere(_sphere);
    const snapshotCenter = _centerPoint.clone();

    // Snapshot values from shared temporaries BEFORE the state updater runs,
    // to guard against cross-contamination if React batches updates across
    // multiple Canvas instances sharing the same module-level _sphere / _centerPoint.
    const snapshotRadius = _sphere.radius;

    // The graphics actor anchors the render frame on a new key's geometry and the framing actor frames the camera,
    // before this frame draws. The stage is resolved now: the configured orientation keeps the camera's current up.
    const { size } = get();
    const view = selectCameraView(cameraRig);
    graphicsActor.send({
      type: 'geometryBoundsMeasured',
      key: geometryKey,
      bounds: { min: [...physicalBounds.min], max: [...physicalBounds.max] },
      radius: snapshotRadius,
      viewport: { ...view.viewport, width: size.width, height: size.height },
      stage: resolveFramingStage(stageOptions, view.up),
    });

    // Only update state when the measured bounds have actually changed.
    set((previous) => {
      const centerChanged = !previous.geometryCenter.equals(snapshotCenter);
      const boundsChanged = !previous.geometryBounds.equals(snapshotBounds);

      if (previous.geometryRadius === snapshotRadius && !centerChanged && !boundsChanged) {
        // Nothing physical changed.
        return previous;
      }

      return {
        geometryRadius: snapshotRadius,
        geometryCenter: centerChanged ? snapshotCenter : previous.geometryCenter,
        geometryBounds: boundsChanged ? snapshotBounds : previous.geometryBounds,
      };
    });
  }, [
    cameraRig,
    fitMargin,
    presentedRevision,
    geometryKey,
    get,
    graphicsActor,
    innerRef,
    outerRef,
    renderFrame,
    settledPoseRevision,
    stageOptions,
  ]);

  // The frame callback runs before each draw, so committed geometry and a settled pose are measured, and the camera
  // framed, before the frame that first shows them. The canvas draws on demand, so each one asks for that frame.
  useLayoutEffect(() => {
    invalidate();
  }, [fitMargin, geometryKey, invalidate, presentedRevision, settledPoseRevision]);
  useFrame(measureBounds);

  // Sync the real bounding-sphere radius to the graphics machine so other
  // components (and downstream consumers of geometryRadius) get the actual value
  // computed from the Three.js scene graph, not a placeholder.
  useEffect(() => {
    if (geometryRadius > 0) {
      graphicsActor.send({
        type: 'sceneRadiusUpdated',
        radius: geometryRadius,
        centerMeters: [geometryCenter.x, geometryCenter.y, geometryCenter.z],
      });
    }
  }, [geometryCenter, graphicsActor, geometryRadius]);

  return { geometryRadius, geometryCenter, geometryBounds };
}
