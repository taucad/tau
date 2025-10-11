import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Mesh } from 'three';
import { LineSegments, LineBasicMaterial, EdgesGeometry } from 'three';

/**
 * Apply line segments to a GLTF scene by creating edges from mesh faces when no LineSegments exist.
 *
 * This function checks if the GLTF scene contains any LineSegments. If none are found,
 * it creates edge geometry from all meshes using EdgesGeometry and adds them as LineSegments
 * to the scene.
 *
 * @param gltf - The GLTF scene to apply line segments to.
 * @param edgeThresholdDegrees - The threshold in degrees for the EdgesGeometry. When a face has adjacent faces with a connecting angle lesser than this threshold, the edge is visible. Defaults to 30 degrees.
 */
export function applyLineSegments(gltf: GLTF, edgeThresholdDegrees = 30, edgeColor = 0x24_42_24): void {
  // First pass: check if any LineSegments already exist and collect meshes
  const meshes: Mesh[] = [];
  const lineSegments: unknown[] = [];

  gltf.scene.traverse((child) => {
    if (child.type === 'LineSegments') {
      lineSegments.push(child);
    }

    if (child.type === 'Mesh') {
      meshes.push(child as Mesh);
    }
  });

  // If LineSegments already exist, no need to create them
  if (lineSegments.length > 0) {
    return;
  }

  // Create edge geometry from mesh faces
  for (const mesh of meshes) {
    if (!mesh.geometry.attributes['position']) {
      continue;
    }

    // Create edge geometry from mesh faces
    const edgeGeometry = new EdgesGeometry(mesh.geometry, edgeThresholdDegrees);

    // Create edge material with optimized settings
    const edgeMaterial = new LineBasicMaterial({
      color: edgeColor,
      linewidth: 1,
      transparent: false,
      depthWrite: true,
      depthTest: true,
    });

    // Create LineSegments and add to the scene
    const lineSegments = new LineSegments(edgeGeometry, edgeMaterial);
    lineSegments.name = `${mesh.name || 'mesh'}-edges`;

    // Add the line segments to the same parent as the mesh
    // This ensures they follow the same transformation hierarchy
    if (mesh.parent) {
      mesh.parent.add(lineSegments);
    } else {
      gltf.scene.add(lineSegments);
    }
  }
}
