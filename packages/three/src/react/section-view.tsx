/**
 * Credit to https://github.com/r3f-cutter/r3f-cutter for the original implementation.
 *
 * This has been modified to support conditional cutting of meshes and lines.
 */

import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Plane } from '@react-three/drei';

// Reusable temporaries for per-frame plane positioning (avoids GC pressure)
const _defaultNormal = new THREE.Vector3(0, 0, 1);
const _quaternion = new THREE.Quaternion();
const _worldPosition = new THREE.Vector3();

export type CutterProperties = {
  readonly children: React.ReactNode;
  readonly plane: THREE.Plane;
  readonly enableSection?: boolean;
  readonly enableLines?: boolean;
  readonly enableMesh?: boolean;
  readonly cappingMaterial: THREE.Material;
};

type PlaneStencilGroupProperties = {
  readonly meshObj: THREE.Mesh;
  readonly plane: THREE.Plane;
  readonly renderOrder: number;
};

export const SectionView = React.forwardRef<{ update: () => void }, CutterProperties>(
  (
    { children, plane, enableSection = true, enableLines = true, enableMesh = true, cappingMaterial },
    ref,
  ): React.JSX.Element => {
    const { gl } = useThree();
    const rootGroupRef = React.useRef<THREE.Group>(null);

    const [meshList, setMeshList] = React.useState<THREE.Mesh[]>([]);
    const [planeSize, setPlaneSize] = React.useState(10);
    // Track the previous set of mesh IDs to avoid unnecessary setMeshList calls
    // when only clipping plane values changed (the mesh list itself is stable).
    const previousMeshIdsRef = React.useRef<string>('');

    const update: () => void = React.useCallback(() => {
      // Early return if cutting is disabled
      if (!enableSection) {
        setMeshList([]);

        // Remove clipping planes from all objects when cutting is disabled
        const rootGroup = rootGroupRef.current;

        if (rootGroup) {
          rootGroup.traverse((child: THREE.Object3D) => {
            const isMeshOrLine = child instanceof THREE.Mesh || child instanceof THREE.LineSegments;

            if (isMeshOrLine && child.material) {
              if (Array.isArray(child.material)) {
                for (const mat of child.material) {
                  mat.clippingPlanes = [];
                }
              } else {
                child.material.clippingPlanes = [];
              }
            }
          });
        }

        return;
      }

      const meshChildren: THREE.Mesh[] = [];
      const rootGroup = rootGroupRef.current;

      if (rootGroup) {
        rootGroup.traverse((child: THREE.Object3D) => {
          // Handle LineSegments - apply/clear clipping but no caps
          if (child instanceof THREE.LineSegments) {
            if (child.material) {
              if (Array.isArray(child.material)) {
                for (const mat of child.material) {
                  mat.clippingPlanes = enableLines ? [plane] : [];
                }
              } else {
                child.material.clippingPlanes = enableLines ? [plane] : [];
              }
            }

            return; // Lines don't get caps, so return early
          }

          // Clear clipping planes from meshes if not enabled
          if (child instanceof THREE.Mesh && !enableMesh) {
            if (child.material) {
              if (Array.isArray(child.material)) {
                for (const mat of child.material) {
                  mat.clippingPlanes = [];
                }
              } else {
                child.material.clippingPlanes = [];
              }
            }

            return;
          }

          if (child instanceof THREE.Mesh && child.material && child.geometry) {
            child.matrixAutoUpdate = false;

            // Add clipping planes to each mesh and make sure that the material is
            // double sided. This is needed to create PlaneStencilGroup for the mesh.
            if (Array.isArray(child.material)) {
              for (const mat of child.material) {
                mat.clippingPlanes = [plane];
                mat.side = THREE.DoubleSide;
              }
            } else {
              child.material.clippingPlanes = [plane];
              child.material.side = THREE.DoubleSide;
            }

            // Three.js mesh types are complex and involve generics
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Mesh type generics are complex
            meshChildren.push(child);
          }
        });

        // Only update the mesh list and recompute bounds when the set of meshes
        // actually changed (not on every plane drag). The mesh list is stable during
        // plane manipulation -- only clipping plane values on materials change.
        const meshIdsKey = meshChildren.map((m) => m.id).join(',');
        if (meshIdsKey !== previousMeshIdsRef.current) {
          previousMeshIdsRef.current = meshIdsKey;

          const bbox = new THREE.Box3();
          bbox.setFromObject(rootGroup);

          const boxSize = new THREE.Vector3();
          bbox.getSize(boxSize);

          const calculatedPlaneSize = 2 * boxSize.length();
          setPlaneSize(calculatedPlaneSize);
          setMeshList(meshChildren);
        }
      }
      // Depend on primitive values instead of plane object to avoid infinite loop
      // eslint-disable-next-line react-hooks/exhaustive-deps -- plane.normal and plane.constant are extracted below
    }, [
      plane.normal.x,
      plane.normal.y,
      plane.normal.z,
      plane.constant,
      enableSection,
      enableLines,
      enableMesh,
      cappingMaterial,
    ]);

    const planeListRef = React.useRef<Map<number, React.ComponentRef<typeof Plane>> | undefined>(undefined);

    // See
    // https://react.dev/learn/manipulating-the-dom-with-refs#how-to-manage-a-list-of-refs-using-a-ref-callback
    function getPlaneListMap(): Map<number, React.ComponentRef<typeof Plane>> {
      planeListRef.current ??= new Map<number, React.ComponentRef<typeof Plane>>();
      return planeListRef.current;
    }

    useFrame(() => {
      if (enableSection && planeListRef.current && rootGroupRef.current) {
        // Reuse module-scoped temporaries to avoid per-frame allocations
        _defaultNormal.set(0, 0, 1);
        _quaternion.setFromUnitVectors(_defaultNormal, plane.normal);

        for (const [, planeObject] of planeListRef.current) {
          // Get a point on the clipping plane in world space
          plane.coplanarPoint(_worldPosition);

          // Offset slightly opposite to the plane normal to prevent z-fighting with the mesh surface
          const zFightingOffset = 0.1;
          _worldPosition.addScaledVector(plane.normal, -zFightingOffset);

          // Transform the world position to the local space of the root group
          // This accounts for any centering or translation applied to the parent group
          rootGroupRef.current.worldToLocal(planeObject.position.copy(_worldPosition));

          // Orient the plane to match the clipping plane's normal
          planeObject.quaternion.copy(_quaternion);
        }
      }
    });

    React.useEffect(() => {
      update();
    }, [update, children]);

    // Enable/disable local clipping and stencil based on cutting state
    React.useEffect(() => {
      const shouldEnable = enableSection && (meshList.length > 0 || enableLines);
      gl.localClippingEnabled = shouldEnable;

      return () => {
        gl.localClippingEnabled = false;
      };
    }, [gl, enableSection, enableLines, meshList.length]);

    React.useImperativeHandle(ref, () => ({ update }), [update]);

    return (
      <group>
        <group ref={rootGroupRef}>{children}</group>
        {enableSection && meshList.length > 0 ? (
          <>
            <group>
              {meshList.map((meshObject, index) => (
                <PlaneStencilGroup key={meshObject.id} meshObj={meshObject} plane={plane} renderOrder={index + 1} />
              ))}
            </group>
            {meshList.map((meshObject, index) => (
              <group key={meshObject.id}>
                <Plane
                  ref={(node) => {
                    const map = getPlaneListMap();
                    if (node) {
                      map.set(index, node);
                    } else {
                      map.delete(index);
                    }
                  }}
                  args={[planeSize, planeSize]}
                  renderOrder={index + 1}
                  material={cappingMaterial}
                  onAfterRender={(renderer) => {
                    renderer.clearStencil();
                  }}
                />
              </group>
            ))}
          </>
        ) : null}
      </group>
    );
  },
);

function PlaneStencilGroup({ meshObj, plane, renderOrder }: PlaneStencilGroupProperties): React.JSX.Element {
  return (
    <group>
      <mesh geometry={meshObj.geometry} renderOrder={renderOrder}>
        <meshBasicMaterial
          stencilWrite
          depthWrite={false}
          depthTest={false}
          colorWrite={false}
          stencilFunc={THREE.AlwaysStencilFunc}
          side={THREE.FrontSide}
          clippingPlanes={[plane]}
          stencilFail={THREE.DecrementWrapStencilOp}
          stencilZFail={THREE.DecrementWrapStencilOp}
          stencilZPass={THREE.DecrementWrapStencilOp}
        />
      </mesh>
      <mesh geometry={meshObj.geometry} renderOrder={renderOrder}>
        <meshBasicMaterial
          stencilWrite
          depthWrite={false}
          depthTest={false}
          colorWrite={false}
          stencilFunc={THREE.AlwaysStencilFunc}
          side={THREE.BackSide}
          clippingPlanes={[plane]}
          stencilFail={THREE.IncrementWrapStencilOp}
          stencilZFail={THREE.IncrementWrapStencilOp}
          stencilZPass={THREE.IncrementWrapStencilOp}
        />
      </mesh>
    </group>
  );
}
