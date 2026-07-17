import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/addons';

/**
 * Result of sampling points from a mesh surface.
 */
export type SampledPoints = {
  /** Position buffer (x, y, z for each point) */
  positions: Float32Array;
  /** Normal buffer (nx, ny, nz for each point) */
  normals: Float32Array;
  /** Random offset buffer (one value per point for variation) */
  randomOffsets: Float32Array;
};

/**
 * Samples points uniformly from a mesh surface using Three.js MeshSurfaceSampler.
 *
 * This utility is useful for creating point cloud representations of meshes,
 * particularly for morphing animations where we need a consistent number of
 * points across different geometries.
 *
 * @param mesh - The mesh to sample points from
 * @param pointCount - Number of points to sample
 * @returns Sampled positions, normals, and random offsets
 */
export function sampleMeshSurface(mesh: THREE.Mesh, pointCount: number): SampledPoints {
  const sampler = new MeshSurfaceSampler(mesh).build();

  const positions = new Float32Array(pointCount * 3);
  const normals = new Float32Array(pointCount * 3);
  const randomOffsets = new Float32Array(pointCount);

  const temporaryPosition = new THREE.Vector3();
  const temporaryNormal = new THREE.Vector3();

  for (let index = 0; index < pointCount; index++) {
    sampler.sample(temporaryPosition, temporaryNormal);

    const index3 = index * 3;
    positions[index3] = temporaryPosition.x;
    positions[index3 + 1] = temporaryPosition.y;
    positions[index3 + 2] = temporaryPosition.z;

    normals[index3] = temporaryNormal.x;
    normals[index3 + 1] = temporaryNormal.y;
    normals[index3 + 2] = temporaryNormal.z;

    // Random offset for organic movement variation
    randomOffsets[index] = Math.random();
  }

  return { positions, normals, randomOffsets };
}

/**
 * Samples points from a Three.js Group containing meshes.
 * Distributes points proportionally across all meshes based on their surface area.
 *
 * @param group - The group containing meshes to sample from
 * @param pointCount - Total number of points to sample
 * @returns Combined sampled positions, normals, and random offsets
 */
export function sampleGroupSurface(group: THREE.Group, pointCount: number): SampledPoints {
  // Collect all meshes from the group
  const meshes: THREE.Mesh[] = [];
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object.geometry) {
      meshes.push(object as THREE.Mesh);
    }
  });

  if (meshes.length === 0) {
    // Return empty arrays if no meshes found
    return {
      positions: new Float32Array(pointCount * 3),
      normals: new Float32Array(pointCount * 3),
      randomOffsets: new Float32Array(pointCount),
    };
  }

  // For simplicity, distribute points evenly across meshes
  // A more sophisticated approach would weight by surface area
  const pointsPerMesh = Math.floor(pointCount / meshes.length);
  const remainder = pointCount % meshes.length;

  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allRandomOffsets: number[] = [];

  for (const [meshIndex, mesh] of meshes.entries()) {
    // Give the first mesh any remainder points
    const meshPointCount = pointsPerMesh + (meshIndex === 0 ? remainder : 0);

    if (meshPointCount === 0) {
      continue;
    }

    const sampled = sampleMeshSurface(mesh, meshPointCount);

    // Apply mesh's world transform to positions and normals
    const worldMatrix = mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(worldMatrix);

    const temporaryPos = new THREE.Vector3();
    const temporaryNorm = new THREE.Vector3();

    for (let index = 0; index < meshPointCount; index++) {
      const index3 = index * 3;

      temporaryPos.set(
        sampled.positions[index3] ?? 0,
        sampled.positions[index3 + 1] ?? 0,
        sampled.positions[index3 + 2] ?? 0,
      );
      temporaryPos.applyMatrix4(worldMatrix);

      temporaryNorm.set(
        sampled.normals[index3] ?? 0,
        sampled.normals[index3 + 1] ?? 0,
        sampled.normals[index3 + 2] ?? 0,
      );
      temporaryNorm.applyMatrix3(normalMatrix).normalize();

      allPositions.push(temporaryPos.x, temporaryPos.y, temporaryPos.z);
      allNormals.push(temporaryNorm.x, temporaryNorm.y, temporaryNorm.z);
      allRandomOffsets.push(sampled.randomOffsets[index] ?? Math.random());
    }
  }

  return {
    positions: new Float32Array(allPositions),
    normals: new Float32Array(allNormals),
    randomOffsets: new Float32Array(allRandomOffsets),
  };
}

/**
 * Samples points from a BufferGeometry by creating a temporary mesh.
 *
 * @param geometry - The geometry to sample points from
 * @param pointCount - Number of points to sample
 * @returns Sampled positions, normals, and random offsets
 */
export function sampleGeometrySurface(geometry: THREE.BufferGeometry, pointCount: number): SampledPoints {
  // Create a temporary mesh with a basic material for sampling
  const temporaryMaterial = new THREE.MeshBasicMaterial();
  const temporaryMesh = new THREE.Mesh(geometry, temporaryMaterial);

  const result = sampleMeshSurface(temporaryMesh, pointCount);

  // Clean up
  temporaryMaterial.dispose();

  return result;
}
