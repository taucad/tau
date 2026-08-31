import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { fromThreeRenderBounds } from '@taucad/three/spatial';
import { useGraphics, useGraphicsSelector, useRenderFrame } from '#hooks/use-graphics.js';

// Reusable temporaries for per-frame bounding calculations (avoids GC pressure).
// Safe for multi-Canvas use because JavaScript is single-threaded and each
// Canvas's render loop runs sequentially. Values are snapshotted into locals
// before any state updater runs to prevent cross-contamination from batching.
const _box3 = new THREE.Box3();
const _centerPoint = new THREE.Vector3();
const _sphere = new THREE.Sphere();

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
 * exposes the bounding sphere radius and center as React state, and syncs
 * the radius to the graphics state machine.
 *
 * Integrates with the graphics machine's `geometryKey` to avoid expensive
 * scene traversals once bounds have stabilized — they are only recomputed
 * when new geometry loads (key change) and until the radius converges, then
 * skipped entirely during orbit/pan/zoom.
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
  const geometryKey = useGraphicsSelector((state) => state.context.geometryKey);
  const renderFrame = useRenderFrame();

  const [{ geometryRadius, geometryCenter, geometryBounds }, set] = useState<{
    geometryRadius: number;
    geometryCenter: THREE.Vector3;
    geometryBounds: THREE.Box3;
  }>({
    geometryRadius: 0,
    geometryCenter: new THREE.Vector3(),
    geometryBounds: new THREE.Box3(),
  });

  // Track geometry key changes to avoid expensive per-frame scene traversal.
  // When geometryKey changes, bounds are recomputed until they stabilize,
  // then skipped entirely during orbit/pan/zoom.
  const lastGeometryKeyRef = useRef<string | undefined>(undefined);
  const boundsStableRef = useRef(false);

  useFrame(() => {
    if (!innerRef.current) {
      return;
    }

    // When geometryKey changes, invalidate stability
    if (geometryKey !== lastGeometryKeyRef.current) {
      lastGeometryKeyRef.current = geometryKey;
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
      outerRef.current.updateWorldMatrix(true, true);
    }

    _box3.setFromObject(innerRef.current);

    // Don't mark stable or update state when the bounding box is empty
    // (geometry hasn't loaded yet -- GltfMesh parses GLTF asynchronously)
    if (_box3.isEmpty()) {
      return;
    }

    const physicalBounds = fromThreeRenderBounds({ renderFrame, bounds: _box3 });
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

    // Only update state when the measured bounds have actually changed.
    set((previous) => {
      const centerChanged = !previous.geometryCenter.equals(snapshotCenter);
      const boundsChanged = !previous.geometryBounds.equals(snapshotBounds);

      if (previous.geometryRadius === snapshotRadius && !centerChanged && !boundsChanged) {
        // Radius and center converged -- bounds are stable, stop polling
        boundsStableRef.current = true;
        return previous;
      }

      return {
        geometryRadius: snapshotRadius,
        geometryCenter: centerChanged ? snapshotCenter : previous.geometryCenter,
        geometryBounds: boundsChanged ? snapshotBounds : previous.geometryBounds,
      };
    });
  });

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

  return { geometryRadius, geometryCenter, geometryBounds };
}
