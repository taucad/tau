import { describe, expect, it } from 'vitest';

import { calculateFovDistanceCompensation } from '#components/geometry/graphics/three/utils/math.utils.js';
import {
  calculateGltfEdgeAdjustedDepthBias,
  gltfEdgeDepthBiasFactor,
  gltfEdgeDepthBiasReferenceTanHalfFov,
} from '#components/geometry/graphics/three/materials/edge-depth-bias.js';

const referenceFovDeg = 60;
const referenceDistance = 1000;

const calculateEffectivePull = (fovDeg: number, depthBias: number) => {
  const distance = calculateFovDistanceCompensation(referenceFovDeg, fovDeg, referenceDistance);
  const adjustedDepthBias = calculateGltfEdgeAdjustedDepthBias({
    depthBias,
    fovDeg,
  });

  return distance * (1 - adjustedDepthBias);
};

describe('GLTF edge depth bias', () => {
  it('should expose the 60 degree perspective reference tangent', () => {
    expect(gltfEdgeDepthBiasReferenceTanHalfFov).toBeCloseTo(Math.tan(Math.PI / 6), 12);
  });

  it.each([60, 10, 1, 0.1])('should keep effective edge pull approximately constant at %d degrees', (fovDeg) => {
    const effectivePull = calculateEffectivePull(fovDeg, gltfEdgeDepthBiasFactor);

    expect(effectivePull).toBeGreaterThan(0.99);
    expect(effectivePull).toBeLessThan(1.01);
  });

  it('should demonstrate why a fixed 0.999 multiplier overpulls at near-orthographic FOV', () => {
    const lowFovDistance = calculateFovDistanceCompensation(referenceFovDeg, 0.1, referenceDistance);
    const fixedMultiplierPull = lowFovDistance * (1 - gltfEdgeDepthBiasFactor);

    expect(fixedMultiplierPull).toBeGreaterThan(600);
  });
});
