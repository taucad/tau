import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { fromThreeRenderBounds } from '@taucad/three/spatial';
import { useGraphics, useGraphicsSelector, useKinematicsRef, useRenderFrame } from '#hooks/use-graphics.js';
import { selectPresentedGeometryKey } from '#machines/graphics.machine.js';
import type { KinematicsMachineContext } from '#machines/kinematics.machine.js';

// Reusable temporaries for per-frame bounding calculations (avoids GC pressure).
// Safe for multi-Canvas use because JavaScript is single-threaded and each
// Canvas's render loop runs sequentially. Values are snapshotted into locals
// before any state updater runs to prevent cross-contamination from batching.
const _box3 = new THREE.Box3();
const _centerPoint = new THREE.Vector3();
const _sphere = new THREE.Sphere();

/** Whether a drag or a playing clip is still moving a unit's pose. */
const isPoseMoving = ({ unitsById }: KinematicsMachineContext): boolean =>
  Object.values(unitsById).some((unit) => unit.drag !== undefined || unit.playback.status === 'playing');

type GeometryBoundsResult = {
  /** The bounding sphere radius of the geometry. */
  geometryRadius: number;
  /** The bounding box center of the geometry. */
  geometryCenter: THREE.Vector3;
  /** Immutable snapshot of the geometry's world-space bounding box. */
  geometryBounds: THREE.Box3;
  /** Whether these bounds came from posing existing geometry rather than loading new geometry. */
  isPoseUpdate: boolean;
};

/**
 * Tracks the axis-aligned bounding box of the geometry inside `innerRef`,
 * exposes the bounding sphere radius and center as React state, and syncs
 * the radius to the graphics state machine.
 *
 * Integrates with the graphics machine's `geometryKey` to avoid expensive
 * scene traversals once bounds have stabilized — they are only recomputed
 * when new geometry loads (key change) or a kinematic pose settles, then skipped
 * entirely during orbit/pan/zoom.
 *
 * Native render-local bounds are inverted through the current render frame;
 * callers therefore always receive physical metres.
 */
export function useGeometryBounds(
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: RefObject<THREE.Group | null>,
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  outerRef: RefObject<THREE.Group | null>,
): GeometryBoundsResult {
  const geometryKey = useGraphicsSelector(selectPresentedGeometryKey);
  const renderFrame = useRenderFrame();

  const [{ geometryRadius, geometryCenter, geometryBounds, isPoseUpdate }, set] = useState<GeometryBoundsResult>({
    geometryRadius: 0,
    geometryCenter: new THREE.Vector3(),
    geometryBounds: new THREE.Box3(),
    isPoseUpdate: false,
  });

  // Track geometry key changes to avoid expensive per-frame scene traversal.
  // When geometryKey changes, bounds are recomputed until they stabilize,
  // then skipped entirely during orbit/pan/zoom.
  const lastGeometryKeyRef = useRef<string | undefined>(undefined);
  const boundsStableRef = useRef(false);
  const isPoseUpdateRef = useRef(false);

  // A pose moves parts without a new geometry key, so bounds are measured again once it settles. Measuring
  // mid-drag would move the bounds under the pointer. Settled pose bounds keep the camera where the user put it.
  const kinematicsRef = useKinematicsRef();
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    let measuredRevision = kinematicsRef.getSnapshot().context.revision;
    const subscription = kinematicsRef.subscribe(({ context }) => {
      if (context.revision === measuredRevision || isPoseMoving(context)) {
        return;
      }
      measuredRevision = context.revision;
      isPoseUpdateRef.current = true;
      boundsStableRef.current = false;
      invalidate();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [invalidate, kinematicsRef]);

  const measureBounds = useCallback(() => {
    if (!innerRef.current) {
      return;
    }

    // When geometryKey changes, invalidate stability
    if (geometryKey !== lastGeometryKeyRef.current) {
      lastGeometryKeyRef.current = geometryKey;
      boundsStableRef.current = false;
      isPoseUpdateRef.current = false;
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
    const snapshotIsPoseUpdate = isPoseUpdateRef.current;

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
        isPoseUpdate: snapshotIsPoseUpdate,
      };
    });
  }, [geometryKey, innerRef, outerRef, renderFrame]);

  // Committed geometry and saved pose are attached before layout effects. Fit the
  // active camera before its first draw; the frame callback handles settled poses.
  useLayoutEffect(measureBounds, [measureBounds]);
  useFrame(measureBounds);

  // Sync the real bounding-sphere radius to the graphics machine so other
  // components (and downstream consumers of geometryRadius) get the actual value
  // computed from the Three.js scene graph, not a placeholder.
  const graphicsActor = useGraphics();
  useEffect(() => {
    if (geometryRadius > 0) {
      graphicsActor.send({
        type: 'sceneRadiusUpdated',
        radius: geometryRadius,
        centerMeters: [geometryCenter.x, geometryCenter.y, geometryCenter.z],
      });
    }
  }, [geometryCenter, graphicsActor, geometryRadius]);

  return { geometryRadius, geometryCenter, geometryBounds, isPoseUpdate };
}
