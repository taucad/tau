/* eslint-disable react/no-unknown-property -- TODO: fix this */
import { useThree } from '@react-three/fiber';
import { useState, useRef, useLayoutEffect } from 'react';
import type { Mesh, Material, Object3D, LineSegments, BufferGeometry } from 'three';
import { LineBasicMaterial, EdgesGeometry, Matrix4 } from 'three';
import { GLTFLoader } from 'three-stdlib';
import { MatcapMaterial } from '#components/geometry/graphics/three/matcap-material.js';
import type { GeometryGltf } from '#types/cad.types.js';

type MeshDataItem = {
  readonly geometry: BufferGeometry;
  readonly materialColor?: string;
  readonly materialOpacity?: number;
  readonly hasVertexColors: boolean;
  readonly name: string;
  readonly id: string;
};

type EdgeDataItem = {
  readonly geometry: BufferGeometry;
  readonly material: Material;
  readonly name: string;
  readonly id: string;
};

type GltfMeshProperties = GeometryGltf & {
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
};

/**
 * The threshold in degrees for the EdgesGeometry.
 *
 * This is used to determine which edges are visible. When a face has adjacent faces with a
 * connecting angle lesser than this threshold, the edge is visible.
 */
const edgeThresholdDegrees = 30;

/**
 * Create a transformation matrix to convert from y-up (glTF format) to z-up (app coordinate system)
 * and scale from meters back to millimeters.
 *
 * Y-up to Z-up transformation: x' = x, y' = -z, z' = y
 * Unit conversion: meters to millimeters (multiply by 1000)
 */
function createTransformationMatrix(): Matrix4 {
  return new Matrix4().set(1000, 0, 0, 0, 0, 0, -1000, 0, 0, 1000, 0, 0, 0, 0, 0, 1);
}

/**
 * This component renders a GLTF mesh.
 *
 * Rather than using Drei's `Gltf` component, this component is optimized for performance
 * and caters to the needs of a CAD application.
 *
 * It does the following:
 * - Parses the GLTF blob
 * - Collects all mesh data and line segments
 * - Creates separate mesh and edge arrays
 * - Creates edge geometry from mesh faces if no line segments are found
 * - Detects and prioritizes vertex colors over material colors
 *   - When vertex colors (COLOR_0 attribute) are present: uses vertex colors exclusively
 *   - When no vertex colors are present: falls back to material colors and opacity
 *
 * @param gltfBlob - The GLTF blob to load
 * @param name - The name of the mesh
 * @param enableSurfaces - Whether to enable surfaces
 * @param enableLines - Whether to enable lines
 * @returns A React component with Three.js primitives that renders the GLTF mesh
 */
export function GltfMesh({
  gltfBlob,
  name,
  enableSurfaces = true,
  enableLines = true,
}: GltfMeshProperties): React.JSX.Element {
  const { invalidate } = useThree();
  const [meshDataItems, setMeshDataItems] = useState<MeshDataItem[]>([]);
  const [edgeDataItems, setEdgeDataItems] = useState<EdgeDataItem[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  // Track resources for proper cleanup
  const resourcesRef = useRef<{
    meshItems: MeshDataItem[];
    edgeItems: EdgeDataItem[];
  }>({ meshItems: [], edgeItems: [] });

  useLayoutEffect(() => {
    const loadGltf = async (): Promise<void> => {
      console.debug('Loading GLTF');
      setError(undefined);

      try {
        const arrayBuffer = await gltfBlob.arrayBuffer();

        // Validate ArrayBuffer
        if (arrayBuffer.byteLength === 0) {
          throw new Error('Empty GLTF data');
        }

        // Check if loader is initialized
        const loader = new GLTFLoader();

        // Use singleton loader for parsing
        const parsedGltf = await loader.parseAsync(arrayBuffer, '');

        // First pass: collect mesh data and check for line segments
        const meshData: Array<{
          geometry: BufferGeometry;
          materialColor?: string;
          materialOpacity?: number;
          hasVertexColors: boolean;
          name: string;
        }> = [];
        const separateLineSegments: Array<{ geometry: BufferGeometry; name: string }> = [];

        parsedGltf.scene.traverse((child: Object3D) => {
          if (child.type === 'Mesh') {
            const mesh = child as Mesh;
            if (mesh.geometry.attributes['position']) {
              const geometry = mesh.geometry.clone();

              // Transform from y-up (glTF) to z-up (app coordinate system)
              const yupToZupMatrix = createTransformationMatrix();
              geometry.applyMatrix4(yupToZupMatrix);

              let materialColor: string | undefined;
              let materialOpacity: number | undefined;

              // Check for vertex colors first (COLOR_0 attribute)
              const hasVertexColors = Boolean(geometry.attributes['color'] ?? geometry.attributes['COLOR_0']);

              // Only extract material colors if vertex colors are not present
              if (!hasVertexColors) {
                // Extract material color and opacity from the mesh material
                if ('color' in mesh.material) {
                  const material = mesh.material as { color: { getHexString(): string } };
                  materialColor = `#${material.color.getHexString()}`;
                }

                // Extract material opacity
                if ('opacity' in mesh.material) {
                  const material = mesh.material as { opacity: number };
                  materialOpacity = material.opacity;
                }
              }

              // Validate geometry has vertices
              const positionAttribute = geometry.attributes['position'];
              if (!positionAttribute || positionAttribute.count === 0) {
                console.warn(`Mesh ${child.name || 'unnamed'} has no vertices, skipping`);
                return;
              }

              // Optimize geometry for rendering (compute normals after applying transformation)
              if (!geometry.attributes['normal']) {
                geometry.computeVertexNormals();
              }

              // Validate that bounding box was computed successfully
              if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
                console.warn(`Failed to compute valid bounding box for mesh ${child.name || 'unnamed'}, skipping`);
                return;
              }

              const itemName = child.name || `mesh-${meshData.length}`;
              meshData.push({
                geometry,
                materialColor,
                materialOpacity,
                hasVertexColors,
                name: itemName,
              });
            }
          }

          // Look for separate line segments that aren't part of meshes
          if (child.type === 'LineSegments') {
            const linesMesh = child as LineSegments;
            if (linesMesh.geometry.attributes['position']) {
              const lineGeometry = linesMesh.geometry.clone();

              // Transform from y-up (glTF) to z-up (app coordinate system)
              const yupToZupMatrix = createTransformationMatrix();
              lineGeometry.applyMatrix4(yupToZupMatrix);

              separateLineSegments.push({
                geometry: lineGeometry,
                name: child.name || `lines-${separateLineSegments.length}`,
              });
            }
          }
        });

        // Build separate mesh and edge arrays
        const meshItems: MeshDataItem[] = [];
        const edgeItems: EdgeDataItem[] = [];

        // Create mesh items (always create these for surfaces)
        for (const [index, mesh] of meshData.entries()) {
          meshItems.push({
            geometry: mesh.geometry,
            materialColor: mesh.materialColor,
            materialOpacity: mesh.materialOpacity,
            hasVertexColors: mesh.hasVertexColors,
            name: mesh.name,
            id: `mesh-${mesh.name}-${index}-${Date.now()}`,
          });
        }

        // Create edge items based on strategy
        if (separateLineSegments.length > 0) {
          for (const [index, lineSegment] of separateLineSegments.entries()) {
            const edgeMaterial = new LineBasicMaterial({
              color: 0x24_42_24,
              linewidth: 1,
              transparent: false,
              depthWrite: true,
              depthTest: true,
            });

            edgeItems.push({
              geometry: lineSegment.geometry,
              material: edgeMaterial,
              name: lineSegment.name,
              id: `edge-${lineSegment.name}-${index}-${Date.now()}`,
            });
          }
        } else {
          for (const [index, mesh] of meshData.entries()) {
            // Create edge geometry from mesh faces
            const edgeGeometry = new EdgesGeometry(mesh.geometry, edgeThresholdDegrees);

            // Create edge material with optimized settings
            const edgeMaterial = new LineBasicMaterial({
              color: 0x24_42_24,
              linewidth: 1,
              transparent: false,
              depthWrite: true,
              depthTest: true,
            });

            edgeItems.push({
              geometry: edgeGeometry,
              material: edgeMaterial,
              name: `${mesh.name}-edges`,
              id: `edge-${mesh.name}-${index}-${Date.now()}`,
            });
          }
        }

        if (meshItems.length === 0 && edgeItems.length === 0) {
          throw new Error('No valid mesh or line geometry found in GLTF');
        }

        // Store resources for cleanup
        resourcesRef.current = { meshItems, edgeItems };

        setMeshDataItems(meshItems);
        setEdgeDataItems(edgeItems);
        setError(undefined);
      } catch (parseError: unknown) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Failed to parse GLTF data';
        console.warn('GLTF parsing error:', errorMessage);
        setError(errorMessage);
        setMeshDataItems([]);
        setEdgeDataItems([]);
      } finally {
        invalidate();
      }
    };

    void loadGltf();
  }, [gltfBlob, invalidate]);

  useLayoutEffect(() => {
    return () => {
      // Cleanup function to prevent memory leaks
      const { meshItems, edgeItems } = resourcesRef.current;

      for (const item of meshItems) {
        item.geometry.dispose();
      }

      for (const item of edgeItems) {
        item.geometry.dispose();
        item.material.dispose();
      }

      resourcesRef.current = { meshItems: [], edgeItems: [] };
    };
  }, []);

  // Show error state with more informative display
  if (error) {
    console.warn(`GLTF Error for ${name}:`, error);
    return <group name={`${name}-error`} />;
  }

  // Manual mesh construction with optimized settings
  return (
    <group name={name}>
      {/* Render all mesh surfaces */}
      {meshDataItems.map((meshData) => {
        // Determine if material should be transparent
        const isTransparent = meshData.materialOpacity !== undefined && meshData.materialOpacity < 1;

        return (
          <mesh
            key={meshData.id}
            name={meshData.name}
            frustumCulled={false}
            visible={enableSurfaces}
            geometry={meshData.geometry}
          >
            <MatcapMaterial
              polygonOffset
              color={meshData.hasVertexColors ? undefined : meshData.materialColor}
              opacity={meshData.hasVertexColors ? undefined : meshData.materialOpacity}
              transparent={meshData.hasVertexColors ? false : isTransparent}
              vertexColors={meshData.hasVertexColors}
              polygonOffsetFactor={1}
              polygonOffsetUnits={1}
              side={2}
            />
          </mesh>
        );
      })}

      {/* Render all edge lines */}
      {edgeDataItems.map((edgeData) => (
        <lineSegments
          key={edgeData.id}
          name={edgeData.name}
          frustumCulled={false}
          visible={enableLines}
          geometry={edgeData.geometry}
          material={edgeData.material}
          renderOrder={1}
        />
      ))}
    </group>
  );
}
