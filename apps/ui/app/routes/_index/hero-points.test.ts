// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { heroTargetRadius, normalizeSampledPoints } from '#routes/_index/hero-points.js';
import type { SampledPoints } from '#components/geometry/splash/point-sampler.js';

function makeCube(offset: THREE.Vector3, halfSize: number): SampledPoints {
  const corners: number[] = [];
  for (const x of [-halfSize, halfSize]) {
    for (const y of [-halfSize, halfSize]) {
      for (const z of [-halfSize, halfSize]) {
        corners.push(x + offset.x, y + offset.y, z + offset.z);
      }
    }
  }

  const positions = new Float32Array(corners);
  return {
    positions,
    normals: new Float32Array(positions.length),
    randomOffsets: new Float32Array(positions.length / 3),
  };
}

function boundingRadius(points: SampledPoints): number {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < points.positions.length; index += 3) {
    box.expandByPoint(point.set(points.positions[index]!, points.positions[index + 1]!, points.positions[index + 2]!));
  }

  return box.getSize(new THREE.Vector3()).length() / 2;
}

function centroid(points: SampledPoints): THREE.Vector3 {
  const sum = new THREE.Vector3();
  const count = points.positions.length / 3;
  for (let index = 0; index < points.positions.length; index += 3) {
    sum.add(new THREE.Vector3(points.positions[index], points.positions[index + 1], points.positions[index + 2]));
  }

  return sum.divideScalar(count);
}

describe('normalizeSampledPoints', () => {
  it('should center an off-origin cloud at the origin', () => {
    const source = makeCube(new THREE.Vector3(100, -50, 25), 4);
    const { source: normalized } = normalizeSampledPoints(source, source);

    const center = centroid(normalized);
    expect(center.length()).toBeLessThan(1e-4);
  });

  it('should scale the source cloud to the target radius', () => {
    const source = makeCube(new THREE.Vector3(0, 0, 0), 0.03);
    const { source: normalized } = normalizeSampledPoints(source, source);

    expect(boundingRadius(normalized)).toBeCloseTo(heroTargetRadius, 3);
  });

  it('should apply the source transform to the target so the two stay aligned', () => {
    // Target is the same geometry translated; after normalization by the source
    // transform it must remain offset by the same amount (not independently
    // recentered), preserving morph alignment.
    const source = makeCube(new THREE.Vector3(10, 0, 0), 2);
    const target = makeCube(new THREE.Vector3(14, 0, 0), 2);
    const { target: normalizedTarget } = normalizeSampledPoints(source, target);

    // Source centroid maps to origin; target sat +4 in x, so its normalized
    // centroid must be positive (not zero).
    expect(centroid(normalizedTarget).x).toBeGreaterThan(0);
  });
});
