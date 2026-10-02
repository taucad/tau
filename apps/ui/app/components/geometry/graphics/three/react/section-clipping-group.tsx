import * as React from 'react';
import type * as THREE from 'three';
import { ClippingGroup } from 'three/webgpu';
import { useFrame, useThree } from '@react-three/fiber';
import {
  collectClippableTargets,
  enforceMaterialClipping,
} from '#components/geometry/graphics/three/react/section-view.utils.js';
import { useThreeGraphicsBackend } from '#components/geometry/graphics/three/three-graphics-backend-context.js';

export type SectionClippingGroupProperties = Readonly<{
  plane: THREE.Plane;
  enabled: boolean;
  enableMesh: boolean;
  enableLines: boolean;
  // oxlint-disable-next-line @typescript-eslint/no-restricted-types -- React refs use null
  innerRef: React.RefObject<THREE.Group | null>;
  children: React.ReactNode;
}>;

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
  children,
}: SectionClippingGroupProperties): React.ReactNode {
  const backend = useThreeGraphicsBackend();
  const { gl } = useThree();
  const clippingGroupRef = React.useRef<ClippingGroup | undefined>(undefined);
  const webGlMeshesRef = React.useRef<readonly THREE.Mesh[]>([]);

  clippingGroupRef.current ??= new ClippingGroup();

  const clippingGroup = clippingGroupRef.current;

  React.useLayoutEffect(() => {
    if (backend === 'webgpu') {
      clippingGroup.clippingPlanes = [plane];
      clippingGroup.enabled = enabled && (enableMesh || enableLines);
      clippingGroup.clipIntersection = false;
      clippingGroup.clipShadows = false;
    }
  }, [backend, clippingGroup, enabled, enableLines, enableMesh, plane]);

  React.useLayoutEffect(() => {
    if (backend !== 'webgl' || !innerRef.current) {
      webGlMeshesRef.current = [];
      return;
    }

    const { meshes } = collectClippableTargets(innerRef.current, {
      enableSection: enabled,
      enableLines,
      enableMesh,
      plane,
    });

    webGlMeshesRef.current = meshes;
  }, [backend, children, enabled, enableLines, enableMesh, innerRef, plane]);

  React.useEffect(() => {
    if (backend !== 'webgl') {
      return;
    }

    gl.localClippingEnabled = enabled;

    return (): void => {
      gl.localClippingEnabled = false;
    };
  }, [backend, enabled, gl]);

  useFrame(() => {
    if (backend !== 'webgl' || !enabled || !innerRef.current) {
      return;
    }

    enforceMaterialClipping([...webGlMeshesRef.current], plane, enableMesh);
  });

  if (backend === 'webgpu') {
    return <primitive object={clippingGroup}>{children}</primitive>;
  }

  return children;
}
