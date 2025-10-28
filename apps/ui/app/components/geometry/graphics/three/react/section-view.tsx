/**
 * Credit to https://github.com/r3f-cutter/r3f-cutter for the original implementation.
 *
 * This has been modified to support conditional cutting of meshes and lines.
 */

import * as React from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Plane } from '@react-three/drei';

/**
 * Creates a green material for the capping surface with stencil operations
 */
export function createGreenMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: 0x00_ff_00, // Green color
    side: THREE.DoubleSide,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.ReplaceStencilOp,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API naming
    stencilZFail: THREE.ReplaceStencilOp,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Three.js API naming
    stencilZPass: THREE.ReplaceStencilOp,
  });
}

export type CutterProperties = {
  readonly children: React.ReactNode;
  readonly plane: THREE.Plane;
  readonly enableSection?: boolean;
  readonly enableLines?: boolean;
  readonly enableMesh?: boolean;
  readonly cappingMaterial?: THREE.Material;
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
    const [capMaterialList, setCapMaterialList] = React.useState<THREE.Material[]>([]);
    const [planeSize, setPlaneSize] = React.useState(10);

    // Use ref to track materials for disposal without causing re-renders
    const capMaterialListRef = React.useRef<THREE.Material[]>([]);

    const update: () => void = React.useCallback(() => {
      // Early return if cutting is disabled
      if (!enableSection) {
        setMeshList([]);
        setCapMaterialList([]);

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
      const capMatList: THREE.Material[] = [];
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

          // Skip meshes if not enabled
          if (child instanceof THREE.Mesh && !enableMesh) {
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

            // Use the provided capping material or create default green material
            // Note: We don't clone because onBeforeCompile callbacks aren't copied
            // The stencil operations ensure it only renders at the mesh/plane intersection
            const capMaterial = cappingMaterial ?? createGreenMaterial();
            capMatList.push(capMaterial);
          }
        });

        const bbox = new THREE.Box3();
        bbox.setFromObject(rootGroup);

        const boxSize = new THREE.Vector3();
        bbox.getSize(boxSize);

        const calculatedPlaneSize = 2 * boxSize.length();
        setPlaneSize(calculatedPlaneSize);
      }

      // Update the list of children that are meshes
      setMeshList(meshChildren);

      // Dispose old cap materials using ref to avoid infinite loop
      // Don't dispose the cappingMaterial prop if it's being reused
      for (const material of capMaterialListRef.current) {
        if (material !== cappingMaterial) {
          material.dispose();
        }
      }

      // Save the new cap material list
      capMaterialListRef.current = capMatList;
      setCapMaterialList(capMatList);
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
        // Create a quaternion to rotate from default plane normal (0,0,1) to clipping plane normal
        const defaultNormal = new THREE.Vector3(0, 0, 1);
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(defaultNormal, plane.normal);

        for (const [, planeObject] of planeListRef.current) {
          // Get a point on the clipping plane in world space
          const worldPosition = new THREE.Vector3();
          plane.coplanarPoint(worldPosition);

          // Offset slightly opposite to the plane normal to prevent z-fighting with the mesh surface
          const zFightingOffset = 0.1;
          worldPosition.addScaledVector(plane.normal, -zFightingOffset);

          // Transform the world position to the local space of the root group
          // This accounts for any centering or translation applied to the parent group
          rootGroupRef.current.worldToLocal(planeObject.position.copy(worldPosition));

          // Orient the plane to match the clipping plane's normal
          planeObject.quaternion.copy(quaternion);
        }
      }
    });

    React.useEffect(() => {
      update();
    }, [update, children]);

    // Enable/disable local clipping and stencil based on cutting state
    React.useEffect(() => {
      const shouldEnable = enableSection && meshList.length > 0;
      gl.localClippingEnabled = shouldEnable;

      return () => {
        gl.localClippingEnabled = false;
      };
    }, [gl, enableSection, meshList.length]);

    // Cleanup materials on unmount
    React.useEffect(() => {
      return () => {
        for (const material of capMaterialListRef.current) {
          // Don't dispose the cappingMaterial prop as it's managed by the parent
          if (material !== cappingMaterial) {
            material.dispose();
          }
        }
      };
    }, [cappingMaterial]);

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
            {meshList.map((meshObject, index) => {
              // Toggle this to debug cap plane positioning (shows red plane instead of stencil cap)
              const debugMode = false;

              return (
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
                    renderOrder={index + 1.1}
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Debug flag can be toggled
                    material={debugMode ? undefined : capMaterialList[index]}
                    onAfterRender={(renderer) => {
                      renderer.clearStencil();
                    }}
                  >
                    {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Debug flag can be toggled */}
                    {debugMode ? (
                      <meshBasicMaterial transparent color="red" opacity={0.5} side={THREE.DoubleSide} />
                    ) : null}
                  </Plane>
                </group>
              );
            })}
          </>
        ) : null}
      </group>
    );
  },
);

SectionView.displayName = 'Cutter';

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
