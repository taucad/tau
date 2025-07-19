import { useEffect, useRef } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Group } from 'three';
import type { ShapeGLTF } from '~/types/cad.types.js';

type GLTFMeshProps = ShapeGLTF;

export function GLTFMesh({ gltfBlob, name }: GLTFMeshProps) {
  const groupRef = useRef<Group>(null);

  useEffect(() => {
    if (!gltfBlob || !groupRef.current) return;

    const loader = new GLTFLoader();
    
    // Convert blob to URL for loading
    const url = URL.createObjectURL(gltfBlob);
    
    loader.load(
      url,
      (gltf) => {
        // Clear previous mesh
        if (groupRef.current) {
          groupRef.current.clear();
          groupRef.current.add(gltf.scene);
        }
        
        // Clean up the URL
        URL.revokeObjectURL(url);
      },
      undefined,
      (error) => {
        console.error('Error loading GLTF:', error);
        URL.revokeObjectURL(url);
      }
    );

    return () => {
      // Cleanup on unmount
      URL.revokeObjectURL(url);
    };
  }, [gltfBlob]);

  return <group ref={groupRef} name={name} />;
}