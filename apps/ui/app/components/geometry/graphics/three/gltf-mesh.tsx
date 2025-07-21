/* eslint-disable react/no-unknown-property -- TODO: fix this */
import { useThree } from '@react-three/fiber';
import { useState, useRef, useLayoutEffect } from 'react';
import type { Mesh, BufferGeometry, Material, Object3D } from 'three';
import { LineBasicMaterial, EdgesGeometry } from 'three';
import { GLTFLoader } from 'three-stdlib';
import { MatcapMaterial } from '~/components/geometry/graphics/three/matcap-material.js';
import type { ShapeGltf } from '~/types/cad.types.js';

type GltfMeshProperties = ShapeGltf & {
  readonly enableSurfaces?: boolean;
  readonly enableLines?: boolean;
};

export function GltfMesh({
  gltfBlob,
  name,
  enableSurfaces = true,
  enableLines = true,
}: GltfMeshProperties): React.JSX.Element {
  const { invalidate } = useThree();
  const [meshData, setMeshData] = useState<
    | {
        geometry: BufferGeometry;
        edgeGeometry: BufferGeometry;
        edgeMaterial: Material;
      }
    | undefined
  >(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  // Track resources for proper cleanup
  const resourcesRef = useRef<{
    geometry?: BufferGeometry;
    edgeGeometry?: BufferGeometry;
    edgeMaterial?: Material;
  }>({});

  useLayoutEffect(() => {
    const loadGltf = async (): Promise<void> => {
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

        // Extract geometry with better traversal
        let geometry: BufferGeometry | undefined;
        let foundMesh = false;

        parsedGltf.scene.traverse((child: Object3D) => {
          if (child.type === 'Mesh' && !foundMesh) {
            const mesh = child as Mesh;
            if (mesh.geometry.attributes['position']) {
              geometry = mesh.geometry.clone(); // Clone to avoid shared references
              foundMesh = true;
            }
          }
        });
        if (!geometry) {
          throw new Error('No valid mesh geometry found in GLTF');
        }

        // Validate geometry has vertices
        const positionAttribute = geometry.attributes['position'];
        if (!positionAttribute || positionAttribute.count === 0) {
          throw new Error('Geometry has no vertices');
        }

        // Optimize geometry for rendering
        if (!geometry.attributes['normal']) {
          geometry.computeVertexNormals();
        }

        // Validate that bounding box was computed successfully
        if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) {
          throw new Error('Failed to compute valid bounding box for geometry');
        }

        // Create edge geometry with error handling
        const edgeGeometry = new EdgesGeometry(geometry, 1); // Threshold of 1 degree

        // Create edge material with optimized settings
        const edgeMaterial = new LineBasicMaterial({
          color: 0x24_42_24,
          linewidth: 1, // Use 1 for better browser compatibility
          transparent: false,
          depthWrite: true,
          depthTest: true,
        });

        // Store resources for cleanup
        resourcesRef.current = {
          geometry,
          edgeGeometry,
          edgeMaterial,
        };

        setMeshData({
          geometry,
          edgeGeometry,
          edgeMaterial,
        });
        setError(undefined);
      } catch (parseError: unknown) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Failed to parse GLTF data';
        console.warn('GLTF parsing error:', errorMessage);
        setError(errorMessage);
        setMeshData(undefined);
      } finally {
        invalidate();
      }
    };

    void loadGltf();
  }, [gltfBlob, invalidate]);

  useLayoutEffect(() => {
    return () => {
      // Cleanup function to prevent memory leaks
      const resources = resourcesRef.current;
      resources.geometry?.dispose();
      resources.edgeGeometry?.dispose();
      resources.edgeMaterial?.dispose();

      resourcesRef.current = {};
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
      {/* Main mesh with MatCap material and vertex colors */}
      <mesh
        frustumCulled={false} // Don't cull the mesh
        visible={enableSurfaces}
        geometry={meshData?.geometry}
      >
        <MatcapMaterial vertexColors polygonOffset polygonOffsetFactor={1} side={2} polygonOffsetUnits={1} />
      </mesh>

      {/* Edge lines with optimized settings */}
      <lineSegments
        frustumCulled={false} // Don't cull the lines
        visible={enableLines}
        geometry={meshData?.edgeGeometry}
        material={meshData?.edgeMaterial}
        renderOrder={1} // Render after main mesh
      />
    </group>
  );
}
