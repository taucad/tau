// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import {
  createMorphingPointsGeometry,
  createMorphingPointsMaterial,
} from '#components/geometry/splash/morphing-points-material.js';
import {
  resolveMorphingPointCssSize,
  resolveMorphingPointPosition,
} from '#components/geometry/splash/morphing-points-semantics.js';

const source = new Vector3(2, -1, 3);
const target = new Vector3(8, 5, -3);
const at = (progress: number): Vector3 =>
  resolveMorphingPointPosition({ source, target, progress, randomOffset: 0.37, time: 12, explosionStrength: 4 });

describe('morphing point semantic contract', () => {
  it('starts exactly at source, ends at target, and stays continuous through the midpoint', () => {
    expect(at(0).distanceTo(source)).toBeLessThan(1e-12);
    expect(at(1).distanceTo(target)).toBeLessThan(1e-12);
    expect(at(0.5 - 1e-6).distanceTo(at(0.5 + 1e-6))).toBeLessThan(1e-4);
  });

  it('uses one instanced quad per particle so requested sizes work on WebGPU', () => {
    const geometry = createMorphingPointsGeometry({
      sourcePositions: new Float32Array([1, 2, 3, 4, 5, 6]),
      targetPositions: new Float32Array([7, 8, 9, 10, 11, 12]),
      randomOffsets: new Float32Array([0.25, 0.75]),
    });

    expect(geometry.isInstancedBufferGeometry).toBe(true);
    expect(geometry.instanceCount).toBe(2);
    expect(geometry.getAttribute('position').count).toBe(4);
    expect(geometry.getAttribute('aSourcePosition').count).toBe(2);
  });

  it('keeps CSS size invariant with DPR and supports perspective and orthographic cameras', () => {
    const orthographic = resolveMorphingPointCssSize({
      pointSize: 3,
      progress: 0,
      randomOffset: 0.5,
      camera: { viewportHeight: 600 },
    });
    const perspective = resolveMorphingPointCssSize({
      pointSize: 3,
      progress: 0,
      randomOffset: 0.5,
      camera: { viewportHeight: 600, perspectiveDepth: 300 },
    });

    expect(orthographic).toBe(3);
    expect(perspective).toBe(3);
  });

  it('uses quad UVs and an explicit viewport instead of fixed-size native point coordinates', () => {
    const material = createMorphingPointsMaterial();
    expect(material.vertexShader).toContain('attribute vec3 aSourcePosition');
    expect(material.vertexShader).toContain('uViewportSize.y * 0.5 / -mvPosition.z');
    expect(material.fragmentShader).not.toContain('gl_PointCoord');
    expect(material.fragmentShader).toContain('#include <colorspace_fragment>');
  });
});
