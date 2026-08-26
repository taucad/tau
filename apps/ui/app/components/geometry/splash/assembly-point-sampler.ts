import * as THREE from 'three';
import { GLTFLoader } from 'three/addons';
import type { Geometry } from '@taucad/types';
import { sampleMeshSurface } from '#components/geometry/splash/point-sampler.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';

/**
 * Gear assembly constants calculated from circularPitch = 5
 * These match the values in unified-splashback-viewer.tsx and gear-assembly-viewer.tsx
 */
const circularPitch = 5;
const gear12Teeth = 12;
const gear8Teeth = 8;
const pitchRadius12 = (gear12Teeth * circularPitch) / (2 * Math.PI);
const pitchRadius8 = (gear8Teeth * circularPitch) / (2 * Math.PI);
const centerOffset = (pitchRadius12 - pitchRadius8) / 2;

/** Position offset for gear12 in the assembly (left gear) */
const gear12AssemblyOffset = new THREE.Vector3(-pitchRadius12 + centerOffset, 0, 0);

/** Position offset for gear8 in the assembly (right gear) */
const gear8AssemblyOffset = new THREE.Vector3(pitchRadius8 + centerOffset, 0, 0);

/**
 * Result of sampling points for the assembly morph animation.
 */
export type AssemblySampledPoints = {
  /** Points sampled from gear12 with assembly position offset applied */
  gear12Points: SampledPoints;
  /** Points sampled from gear8 with assembly position offset applied */
  gear8Points: SampledPoints;
  /** Total number of points (same as sourcePointCount) */
  totalPointCount: number;
  /** The split ratio used (0.6 = 60% of points go to gear12, 40% to gear8) */
  splitRatio: number;
};

/**
 * Samples points from a GLTF geometry.
 *
 * @param geometry - The GLTF geometry to sample from
 * @param pointCount - Number of points to sample
 * @returns Sampled points or undefined if sampling failed
 */
async function sampleFromGeometry(geometry: Geometry, pointCount: number): Promise<SampledPoints | undefined> {
  if (geometry.format !== 'gltf') {
    console.warn('[sampleFromGeometry] Geometry format is not gltf');
    return undefined;
  }

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(geometry.content.buffer, '');

    // Find the first mesh in the scene
    let foundMesh: THREE.Mesh | undefined;
    gltf.scene.traverse((object) => {
      if (!foundMesh && object instanceof THREE.Mesh) {
        foundMesh = object;
      }
    });

    if (foundMesh) {
      return sampleMeshSurface(foundMesh, pointCount);
    }

    console.warn('[sampleFromGeometry] No mesh found in GLTF scene');
  } catch (error) {
    console.error('[sampleFromGeometry] Failed to sample points:', error);
  }

  return undefined;
}

/**
 * Samples points from both gears at their assembly positions.
 *
 * This utility is used for the gear8 → assembly split morph animation.
 * It samples points from each gear and applies the correct position offset
 * so the points land at the final assembly positions.
 *
 * IMPORTANT: Both returned point arrays have the SAME length as sourcePointCount.
 * This is required because WebGL vertex attributes must all have the same count.
 * The shader uses aTargetSelector to pick which target (A or B) each particle uses:
 * - Points 0 to (splitRatio * sourcePointCount - 1) use gear12 positions (target A)
 * - Points (splitRatio * sourcePointCount) to end use gear8 positions (target B)
 *
 * @param root0 - The assembly point sampling parameters
 * @param root0.gear12Geometry - The gear12 GLTF geometry
 * @param root0.gear8Geometry - The gear8 GLTF geometry
 * @param root0.sourcePointCount - Number of source points (must match gear8Points.length from morph source)
 * @param root0.splitRatio - Ratio of points going to gear12 (default: 0.6 based on surface area ratio)
 * @returns Promise resolving to AssemblySampledPoints or undefined if sampling failed
 *
 * @example
 * ```typescript
 * const assemblyPoints = await sampleAssemblyPoints(
 *   gear12Geometry,
 *   gear8Geometry,
 *   3000,  // must match source point count
 *   0.6,   // 60% to gear12
 * );
 * ```
 */
export async function sampleAssemblyPoints({
  gear12Geometry,
  gear8Geometry,
  sourcePointCount,
  splitRatio = 0.6,
}: {
  gear12Geometry: Geometry;
  gear8Geometry: Geometry;
  sourcePointCount: number;
  splitRatio?: number;
}): Promise<AssemblySampledPoints | undefined> {
  // Calculate how many actual target points to sample from each gear
  const gear12TargetCount = Math.floor(sourcePointCount * splitRatio);
  const gear8TargetCount = sourcePointCount - gear12TargetCount;

  // Sample points from both geometries
  const [gear12RawPoints, gear8RawPoints] = await Promise.all([
    sampleFromGeometry(gear12Geometry, gear12TargetCount),
    sampleFromGeometry(gear8Geometry, gear8TargetCount),
  ]);

  if (!gear12RawPoints || !gear8RawPoints) {
    console.error('[sampleAssemblyPoints] Failed to sample points from one or both geometries');
    return undefined;
  }

  // Create full-length arrays (sourcePointCount each)
  // Both arrays must have the same length for WebGL vertex attributes
  const gear12Positions = new Float32Array(sourcePointCount * 3);
  const gear8Positions = new Float32Array(sourcePointCount * 3);
  const randomOffsets = new Float32Array(sourcePointCount);

  for (let i = 0; i < sourcePointCount; i++) {
    randomOffsets[i] = Math.random();

    // For gear12 target array:
    // - First gear12TargetCount points use actual gear12 sampled positions
    // - Remaining points wrap around (these won't be used due to targetSelector)
    const g12Index = i < gear12TargetCount ? i : i % gear12TargetCount;
    const g12Pos = gear12RawPoints.positions;
    gear12Positions[i * 3] = (g12Pos[g12Index * 3] ?? 0) + gear12AssemblyOffset.x;
    gear12Positions[i * 3 + 1] = (g12Pos[g12Index * 3 + 1] ?? 0) + gear12AssemblyOffset.y;
    gear12Positions[i * 3 + 2] = (g12Pos[g12Index * 3 + 2] ?? 0) + gear12AssemblyOffset.z;

    // For gear8 target array:
    // - Points from gear12TargetCount onwards use actual gear8 sampled positions
    // - Earlier points wrap around (these won't be used due to targetSelector)
    const isGear8Region = i >= gear12TargetCount;
    const g8Index = isGear8Region ? i - gear12TargetCount : i % gear8TargetCount;
    const g8Pos = gear8RawPoints.positions;
    gear8Positions[i * 3] = (g8Pos[g8Index * 3] ?? 0) + gear8AssemblyOffset.x;
    gear8Positions[i * 3 + 1] = (g8Pos[g8Index * 3 + 1] ?? 0) + gear8AssemblyOffset.y;
    gear8Positions[i * 3 + 2] = (g8Pos[g8Index * 3 + 2] ?? 0) + gear8AssemblyOffset.z;
  }

  return {
    gear12Points: {
      positions: gear12Positions,
      normals: new Float32Array(0),
      randomOffsets,
    },
    gear8Points: {
      positions: gear8Positions,
      normals: new Float32Array(0),
      randomOffsets,
    },
    totalPointCount: sourcePointCount,
    splitRatio,
  };
}

/**
 * Gets the assembly position offset for gear12.
 * Useful for external calculations.
 */
export function getGear12AssemblyOffset(): THREE.Vector3 {
  return gear12AssemblyOffset.clone();
}

/**
 * Gets the assembly position offset for gear8.
 * Useful for external calculations.
 */
export function getGear8AssemblyOffset(): THREE.Vector3 {
  return gear8AssemblyOffset.clone();
}
