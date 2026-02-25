import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useViewerStore } from '#react/stores/store-context.js';

const _box3 = new THREE.Box3();
const _centerPoint = new THREE.Vector3();
const _sphere = new THREE.Sphere();

type GeometryBoundsOptions = {
  enableCentering?: boolean;
  geometryKey?: string;
  onSceneRadiusChange?: (radius: number) => void;
};

type GeometryBoundsResult = {
  geometryRadius: number;
  geometryCenter: THREE.Vector3;
};

/**
 * Tracks the axis-aligned bounding box of the geometry inside `innerRef`,
 * exposes the bounding sphere radius and center as React state, and syncs
 * the radius to the viewer store.
 *
 * Uses `geometryKey` to avoid expensive scene traversals once bounds have
 * stabilized -- they are only recomputed when new geometry loads (key change)
 * and until the radius converges, then skipped entirely during orbit/pan/zoom.
 *
 * Optionally applies a centering transform to `outerRef` so the geometry's
 * bounding box center sits at the world origin.
 */
export function useGeometryBounds(
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: RefObject<THREE.Group | null>,
  // eslint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  outerRef: RefObject<THREE.Group | null>,
  options: GeometryBoundsOptions = {},
): GeometryBoundsResult {
  const { enableCentering = false, geometryKey, onSceneRadiusChange } = options;

  const setStoreSceneRadius = useViewerStore((state) => state.setSceneRadius);

  const [{ geometryRadius, geometryCenter }, set] = useState<{
    geometryRadius: number;
    geometryCenter: THREE.Vector3;
  }>({
    geometryRadius: 0,
    geometryCenter: new THREE.Vector3(),
  });

  const lastGeometryKeyRef = useRef<string | undefined>(undefined);
  const boundsStableRef = useRef(false);

  useFrame(() => {
    if (!innerRef.current) {
      return;
    }

    if (geometryKey !== lastGeometryKeyRef.current) {
      lastGeometryKeyRef.current = geometryKey;
      boundsStableRef.current = false;
    }

    if (boundsStableRef.current) {
      return;
    }

    if (outerRef.current) {
      outerRef.current.updateWorldMatrix(true, true);
    }

    _box3.setFromObject(innerRef.current);

    if (_box3.isEmpty()) {
      return;
    }

    _box3.getCenter(_centerPoint);
    _box3.getBoundingSphere(_sphere);

    if (enableCentering && outerRef.current) {
      outerRef.current.position.set(-_centerPoint.x, -_centerPoint.y, -_centerPoint.z);
    }

    const snapshotRadius = _sphere.radius;
    const snapshotCenter = _centerPoint.clone();

    set((previous) => {
      const centerChanged = !previous.geometryCenter.equals(snapshotCenter);

      if (previous.geometryRadius === snapshotRadius && !centerChanged) {
        boundsStableRef.current = true;
        return previous;
      }

      return {
        geometryRadius: snapshotRadius,
        geometryCenter: centerChanged ? snapshotCenter : previous.geometryCenter,
      };
    });
  });

  useEffect(() => {
    if (geometryRadius > 0) {
      setStoreSceneRadius(geometryRadius);
      onSceneRadiusChange?.(geometryRadius);
    }
  }, [geometryRadius, setStoreSceneRadius, onSceneRadiusChange]);

  return { geometryRadius, geometryCenter };
}
