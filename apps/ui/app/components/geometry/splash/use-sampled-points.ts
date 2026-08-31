import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons';
import type { Geometry } from '@taucad/types';
import { sampleMeshSurface } from '#components/geometry/splash/point-sampler.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';
import { sampleAssemblyPoints } from '#components/geometry/splash/assembly-point-sampler.js';
import { applyCanonicalGltfWorld } from '#components/geometry/graphics/three/gltf-world.js';

/**
 * Result of sampling points from gear geometries.
 */
export type SampledPointsResult = {
  /** Sampled points from gear12 geometry */
  gear12Points: SampledPoints | undefined;
  /** Sampled points from gear8 geometry */
  gear8Points: SampledPoints | undefined;
  /** Sampled points for assembly gear12 (at assembly position) */
  assemblyGear12Points: SampledPoints | undefined;
  /** Sampled points for assembly gear8 (at assembly position) */
  assemblyGear8Points: SampledPoints | undefined;
  /** Split ratio for assembly morphing */
  assemblySplitRatio: number | undefined;
};

/**
 * Options for the useSampledPoints hook.
 */
export type UseSampledPointsOptions = {
  /** Gear12 geometry to sample */
  gear12Geometry: Geometry | undefined;
  /** Gear8 geometry to sample */
  gear8Geometry: Geometry | undefined;
  /** Number of points to sample for morphing */
  pointCount: number;
  /** Split ratio for assembly (portion going to gear12) */
  assemblySplitRatio?: number;
};

/**
 * Samples points from a GLTF geometry for morphing animations.
 *
 * @param geometry - The geometry to sample from
 * @param pointCount - Number of points to sample
 * @returns Promise resolving to sampled points, or undefined if sampling fails
 */
async function samplePointsFromGeometry(geometry: Geometry, pointCount: number): Promise<SampledPoints | undefined> {
  if (geometry.format !== 'gltf') {
    return undefined;
  }

  try {
    const loader = new GLTFLoader();
    const gltf = await loader.parseAsync(geometry.content.buffer, '');
    applyCanonicalGltfWorld(gltf.scene);

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
  } catch (error) {
    console.error('[useSampledPoints] Failed to sample points from geometry:', error);
  }

  return undefined;
}

/**
 * Hook that samples points from gear geometries for morphing animations.
 *
 * This hook handles:
 * - Sampling points from individual gear geometries
 * - Sampling assembly points from both geometries
 * - Tracking which geometries have been sampled to avoid redundant work
 *
 * @param options - Configuration for point sampling
 * @returns Object containing sampled points for all geometries
 */
export function useSampledPoints(options: UseSampledPointsOptions): SampledPointsResult {
  const { gear12Geometry, gear8Geometry, pointCount, assemblySplitRatio = 0.6 } = options;

  // State for storing sampled points
  const [gear12Points, setGear12Points] = useState<SampledPoints | undefined>(undefined);
  const [gear8Points, setGear8Points] = useState<SampledPoints | undefined>(undefined);
  const [assemblyGear12Points, setAssemblyGear12Points] = useState<SampledPoints | undefined>(undefined);
  const [assemblyGear8Points, setAssemblyGear8Points] = useState<SampledPoints | undefined>(undefined);
  const [currentSplitRatio, setCurrentSplitRatio] = useState<number | undefined>(undefined);

  // Refs to track if we've sampled points for each geometry
  const hasGear12PointsRef = useRef(false);
  const hasGear8PointsRef = useRef(false);
  const hasAssemblyPointsRef = useRef(false);

  // Stable sample function
  const sampleGeometry = useCallback(
    async (geometry: Geometry) => samplePointsFromGeometry(geometry, pointCount),
    [pointCount],
  );

  // Sample gear12 points
  useEffect(() => {
    if (!gear12Geometry || hasGear12PointsRef.current) {
      return;
    }

    const sample = async (): Promise<void> => {
      const points = await sampleGeometry(gear12Geometry);

      if (points) {
        setGear12Points(points);
        hasGear12PointsRef.current = true;
      }
    };

    void sample();
  }, [gear12Geometry, sampleGeometry]);

  // Sample gear8 points
  useEffect(() => {
    if (!gear8Geometry || hasGear8PointsRef.current) {
      return;
    }

    const sample = async (): Promise<void> => {
      const points = await sampleGeometry(gear8Geometry);

      if (points) {
        setGear8Points(points);
        hasGear8PointsRef.current = true;
      }
    };

    void sample();
  }, [gear8Geometry, sampleGeometry]);

  // Sample assembly points when both geometries are available
  useEffect(() => {
    if (!gear12Geometry || !gear8Geometry || hasAssemblyPointsRef.current) {
      return;
    }

    const sample = async (): Promise<void> => {
      const result = await sampleAssemblyPoints({
        gear12Geometry,
        gear8Geometry,
        sourcePointCount: pointCount,
        splitRatio: assemblySplitRatio,
      });

      if (result) {
        setAssemblyGear12Points(result.gear12Points);
        setAssemblyGear8Points(result.gear8Points);
        setCurrentSplitRatio(result.splitRatio);
        hasAssemblyPointsRef.current = true;
      }
    };

    void sample();
  }, [gear12Geometry, gear8Geometry, pointCount, assemblySplitRatio]);

  return {
    gear12Points,
    gear8Points,
    assemblyGear12Points,
    assemblyGear8Points,
    assemblySplitRatio: currentSplitRatio,
  };
}
