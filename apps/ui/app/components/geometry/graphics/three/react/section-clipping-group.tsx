import * as React from 'react';
import type * as THREE from 'three';
import type { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { ClippingGroup } from 'three/webgpu';
import { useFrame, useThree } from '@react-three/fiber';
import {
  collectClippableTargets,
  enforceMaterialClipping,
} from '#components/geometry/graphics/three/react/section-view.utils.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';
import type { SectionViewSafeSnapshotStore } from '#components/geometry/graphics/three/utils/section-view-safe-snapshot.js';

export type SectionClippingGroupProperties = Readonly<{
  plane: THREE.Plane;
  enabled: boolean;
  enableMesh: boolean;
  enableLines: boolean;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
  snapshotRef: React.RefObject<SectionViewSafeSnapshotStore>;
  children: React.ReactNode;
}>;

const setLocalClippingEnabled = (renderer: THREE.WebGLRenderer, enabled: boolean): void => {
  renderer.localClippingEnabled = enabled;
};

const resetClippingGroup = (group: ClippingGroup): void => {
  group.clippingPlanes = [];
  group.enabled = false;
  group.clipIntersection = false;
  group.clipShadows = false;
};

const applyClippingGroupPlane = (group: ClippingGroup, plane: THREE.Plane | undefined): void => {
  group.clippingPlanes = plane ? [plane] : [];
  group.enabled = Boolean(plane);
};

/**
 * Backend-aware clipping boundary for section view: `THREE.ClippingGroup` on WebGPU
 * (scene-graph clipping context), per-material `clippingPlanes` + `gl.localClippingEnabled` on WebGL.
 */
export function SectionClippingGroup({
  plane,
  enabled,
  enableMesh,
  enableLines,
  innerRef,
  snapshotRef,
  children,
}: SectionClippingGroupProperties): React.ReactNode {
  const backend = useThreeGraphicsBackend();
  const { gl } = useThree();
  const [clippingGroup] = React.useState(() => new ClippingGroup());
  const webGlMeshesRef = React.useRef<readonly THREE.Mesh[]>([]);
  const webGlLinesRef = React.useRef<ReadonlyArray<THREE.LineSegments | LineSegments2>>([]);

  React.useLayoutEffect(() => {
    if (backend !== 'webgpu') {
      return;
    }
    resetClippingGroup(clippingGroup);
  }, [backend, clippingGroup]);

  React.useLayoutEffect(() => {
    if (backend !== 'webgl' || !innerRef.current) {
      webGlMeshesRef.current = [];
      webGlLinesRef.current = [];
      return;
    }

    const { lines, meshes } = collectClippableTargets(innerRef.current, {
      enableSection: false,
      enableLines,
      enableMesh,
      plane,
    });

    webGlMeshesRef.current = meshes;
    webGlLinesRef.current = lines;
  }, [backend, children, enabled, enableLines, enableMesh, innerRef, plane]);

  const applyCommittedSnapshot = React.useCallback((): void => {
    const committed = enabled ? snapshotRef.current.committed : undefined;
    const committedPlane = committed?.plane ?? (enabled && !enableMesh && enableLines ? plane : undefined);
    if (backend === 'webgpu') {
      applyClippingGroupPlane(clippingGroup, committedPlane);
      return;
    }
    setLocalClippingEnabled(gl, Boolean(committedPlane));
    enforceMaterialClipping([...webGlMeshesRef.current], committedPlane ?? plane, Boolean(committed && enableMesh));
    enforceMaterialClipping(
      [...webGlLinesRef.current],
      committedPlane ?? plane,
      Boolean(committedPlane && enableLines),
    );
  }, [backend, clippingGroup, enableLines, enableMesh, enabled, gl, plane, snapshotRef]);

  React.useLayoutEffect(applyCommittedSnapshot, [applyCommittedSnapshot, children]);
  useFrame(applyCommittedSnapshot);

  React.useEffect(
    () => () => {
      if (backend === 'webgl') {
        setLocalClippingEnabled(gl, false);
      }
    },
    [backend, gl],
  );

  if (backend === 'webgpu') {
    return <primitive object={clippingGroup}>{children}</primitive>;
  }

  return children;
}
