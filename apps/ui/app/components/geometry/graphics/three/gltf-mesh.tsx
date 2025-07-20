/* eslint-disable react/no-unknown-property -- TODO: fix this */
import { useEffect, useState, useRef, useCallback } from 'react';
import type { Mesh, BufferGeometry, Material, Object3D } from 'three';
import { LineBasicMaterial, EdgesGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MatcapMaterial } from '~/components/geometry/graphics/three/matcap-material.js';
import type { ShapeGLTF } from '~/types/cad.types.js';

type GltfMeshProperties = ShapeGLTF & {
  readonly enableSurface?: boolean;
  readonly enableLines?: boolean;
};

export function GltfMesh({
  gltfBlob,
  name,
  enableSurface = true,
  enableLines = true,
}: GltfMeshProperties): React.JSX.Element {
  const [meshData, setMeshData] = useState<
    | {
        geometry: BufferGeometry;
        edgeGeometry: BufferGeometry;
        edgeMaterial: Material;
      }
    | undefined
  >(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);

  // Track resources for proper cleanup
  const resourcesRef = useRef<{
    geometry?: BufferGeometry;
    edgeGeometry?: BufferGeometry;
    edgeMaterial?: Material;
  }>({});

  // Cleanup function to prevent memory leaks
  const cleanup = useCallback(() => {
    const resources = resourcesRef.current;
    if (resources.geometry) {
      resources.geometry.dispose();
    }

    if (resources.edgeGeometry) {
      resources.edgeGeometry.dispose();
    }

    if (resources.edgeMaterial) {
      resources.edgeMaterial.dispose();
    }

    resourcesRef.current = {};
  }, []);

  useEffect(() => {
    const loadGltf = async (): Promise<void> => {
      setIsLoading(true);
      setError(undefined);

      // Clean up previous resources
      cleanup();

      try {
        // Convert blob to ArrayBuffer more efficiently
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

        // Optimize geometry for rendering
        if (!geometry.attributes['normal']) {
          geometry.computeVertexNormals();
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
        setIsLoading(false);
      } catch (parseError: unknown) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Failed to parse GLTF data';
        console.warn('GLTF parsing error:', errorMessage);
        setError(errorMessage);
        setMeshData(undefined);
        setIsLoading(false);
      }
    };

    void loadGltf();

    // Cleanup on unmount or dependency change
    return () => {
      cleanup();
    };
  }, [gltfBlob, cleanup]);

  // Show error state with more informative display
  if (error) {
    console.warn(`GLTF Error for ${name}:`, error);
    return <group name={`${name}-error`} />;
  }

  // Show loading state
  if (isLoading || !meshData) {
    return <group name={`${name}-loading`} />;
  }

  // Manual mesh construction with optimized settings
  return (
    <group name={name}>
      {/* Main mesh with MatCap material and vertex colors */}
      {enableSurface ? (
        <mesh
          castShadow
          receiveShadow
          frustumCulled // Enable frustum culling for performance
          geometry={meshData.geometry}
        >
          <MatcapMaterial vertexColors polygonOffset polygonOffsetFactor={1} side={2} polygonOffsetUnits={1} />
        </mesh>
      ) : null}

      {/* Edge lines with optimized settings */}
      {enableLines ? (
        <lineSegments
          frustumCulled
          geometry={meshData.edgeGeometry}
          material={meshData.edgeMaterial}
          renderOrder={1} // Render after main mesh
        />
      ) : null}
    </group>
  );
}
