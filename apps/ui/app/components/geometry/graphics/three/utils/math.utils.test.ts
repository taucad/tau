import { describe, expect, it } from 'vitest';
import {
  calculateFovFromAngle,
  calculateGizmoFovFromAngle,
  calculateFovDistanceCompensation,
  gizmoFovScale,
} from '#components/geometry/graphics/three/utils/math.utils.js';

describe('calculateFovFromAngle', () => {
  describe('boundary values', () => {
    it('should return 0.1 (near-orthographic minimum) when angle is 0', () => {
      expect(calculateFovFromAngle(0)).toBeCloseTo(0.1, 10);
    });

    it('should return 90 (maximum perspective) when angle is 90', () => {
      expect(calculateFovFromAngle(90)).toBeCloseTo(90, 10);
    });
  });

  describe('known intermediate values', () => {
    it('should return ~60.03 for default angle of 60', () => {
      const expected = 0.1 + 89.9 * (60 / 90);
      expect(calculateFovFromAngle(60)).toBeCloseTo(expected, 10);
    });

    it('should return ~45.05 for midpoint angle of 45', () => {
      const expected = 0.1 + 89.9 * (45 / 90);
      expect(calculateFovFromAngle(45)).toBeCloseTo(expected, 10);
    });
  });

  describe('linearity', () => {
    it('should follow the formula 0.1 + 89.9 * (angle / 90) for several values', () => {
      for (const angle of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]) {
        const expected = 0.1 + 89.9 * (angle / 90);
        expect(calculateFovFromAngle(angle)).toBeCloseTo(expected, 10);
      }
    });
  });

  describe('monotonicity', () => {
    it('should strictly increase over the range [0, 90]', () => {
      let previous = calculateFovFromAngle(0);
      for (let angle = 1; angle <= 90; angle++) {
        const current = calculateFovFromAngle(angle);
        expect(current).toBeGreaterThan(previous);
        previous = current;
      }
    });
  });

  describe('clamping', () => {
    it('should clamp negative input to the minimum FOV (0.1)', () => {
      expect(calculateFovFromAngle(-10)).toBeCloseTo(0.1, 10);
      expect(calculateFovFromAngle(-100)).toBeCloseTo(0.1, 10);
    });

    it('should clamp input above 90 to the maximum FOV (90)', () => {
      expect(calculateFovFromAngle(100)).toBeCloseTo(90, 10);
      expect(calculateFovFromAngle(180)).toBeCloseTo(90, 10);
    });
  });
});

describe('calculateGizmoFovFromAngle', () => {
  it('should return the same minimum FOV as calculateFovFromAngle when angle is 0', () => {
    expect(calculateGizmoFovFromAngle(0)).toBeCloseTo(calculateFovFromAngle(0), 10);
  });

  it('should return half the maximum FOV when angle is 90', () => {
    // With GIZMO_FOV_SCALE = 0.5, slider 90 maps to calculateFovFromAngle(45) ≈ 45.05
    const expected = calculateFovFromAngle(90 * gizmoFovScale);
    expect(calculateGizmoFovFromAngle(90)).toBeCloseTo(expected, 10);
  });

  it('should equal calculateFovFromAngle(angle * GIZMO_FOV_SCALE) for several values', () => {
    for (const angle of [0, 15, 30, 45, 60, 75, 90]) {
      const expected = calculateFovFromAngle(angle * gizmoFovScale);
      expect(calculateGizmoFovFromAngle(angle)).toBeCloseTo(expected, 10);
    }
  });

  it('should always be less than or equal to the viewport FOV for the same slider value', () => {
    for (let angle = 0; angle <= 90; angle += 5) {
      const viewportFov = calculateFovFromAngle(angle);
      const gizmoFov = calculateGizmoFovFromAngle(angle);
      expect(gizmoFov).toBeLessThanOrEqual(viewportFov);
    }
  });

  it('should be strictly monotonically increasing over [0, 90]', () => {
    let previous = calculateGizmoFovFromAngle(0);
    for (let angle = 1; angle <= 90; angle++) {
      const current = calculateGizmoFovFromAngle(angle);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });
});

describe('calculateFovDistanceCompensation', () => {
  describe('identity', () => {
    it('should return the same distance when old and new FOV are equal', () => {
      expect(calculateFovDistanceCompensation(60, 60, 100)).toBeCloseTo(100, 6);
      expect(calculateFovDistanceCompensation(26, 26, 7)).toBeCloseTo(7, 6);
      expect(calculateFovDistanceCompensation(0.1, 0.1, 1000)).toBeCloseTo(1000, 6);
    });
  });

  describe('direction', () => {
    it('should return a larger distance when narrowing FOV (camera moves back)', () => {
      const result = calculateFovDistanceCompensation(60, 30, 100);
      expect(result).toBeGreaterThan(100);
    });

    it('should return a smaller distance when widening FOV (camera moves closer)', () => {
      const result = calculateFovDistanceCompensation(30, 60, 100);
      expect(result).toBeLessThan(100);
    });
  });

  describe('known values', () => {
    it('should produce the correct result for base FOV=26, new FOV=60, distance=7', () => {
      const degToRad = Math.PI / 180;
      const expected = 7 * (Math.tan((26 / 2) * degToRad) / Math.tan((60 / 2) * degToRad));
      expect(calculateFovDistanceCompensation(26, 60, 7)).toBeCloseTo(expected, 6);
    });

    it('should produce the correct result for FOV=60, new FOV=26, distance=7', () => {
      const degToRad = Math.PI / 180;
      const expected = 7 * (Math.tan((60 / 2) * degToRad) / Math.tan((26 / 2) * degToRad));
      expect(calculateFovDistanceCompensation(60, 26, 7)).toBeCloseTo(expected, 6);
    });
  });

  describe('round-trip symmetry', () => {
    it('should return to the original distance after compensating there and back', () => {
      const original = 100;
      const intermediate = calculateFovDistanceCompensation(60, 30, original);
      const restored = calculateFovDistanceCompensation(30, 60, intermediate);
      expect(restored).toBeCloseTo(original, 6);
    });

    it('should be symmetric for arbitrary FOV pairs', () => {
      const original = 42;
      const intermediate = calculateFovDistanceCompensation(15, 75, original);
      const restored = calculateFovDistanceCompensation(75, 15, intermediate);
      expect(restored).toBeCloseTo(original, 6);
    });
  });

  describe('zero distance', () => {
    it('should return 0 regardless of FOV values', () => {
      expect(calculateFovDistanceCompensation(60, 30, 0)).toBe(0);
      expect(calculateFovDistanceCompensation(30, 60, 0)).toBe(0);
    });
  });

  describe('epsilon guards', () => {
    it('should return a finite value for small but valid FOV (0.001)', () => {
      const result = calculateFovDistanceCompensation(60, 0.001, 100);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBeGreaterThan(100);
    });

    it('should return currentDistance unchanged for truly degenerate FOV (1e-8)', () => {
      // Tan(1e-8 / 2 * π/180) ≈ 8.7e-11, below the epsilon threshold
      expect(calculateFovDistanceCompensation(60, 1e-8, 100)).toBe(100);
      expect(calculateFovDistanceCompensation(1e-8, 60, 100)).toBe(100);
    });

    it('should return currentDistance unchanged for zero FOV', () => {
      expect(calculateFovDistanceCompensation(60, 0, 100)).toBe(100);
      expect(calculateFovDistanceCompensation(0, 60, 100)).toBe(100);
    });
  });

  describe('NaN guards', () => {
    it('should return currentDistance unchanged when oldFov is NaN', () => {
      expect(calculateFovDistanceCompensation(Number.NaN, 60, 100)).toBe(100);
    });

    it('should return currentDistance unchanged when newFov is NaN', () => {
      expect(calculateFovDistanceCompensation(60, Number.NaN, 100)).toBe(100);
    });

    it('should return currentDistance unchanged when distance is NaN', () => {
      const result = calculateFovDistanceCompensation(60, 30, Number.NaN);
      expect(Number.isNaN(result)).toBe(true);
    });
  });

  describe('focusOffset parameter', () => {
    it('should return the same distance when old and new FOV are equal, regardless of offset', () => {
      expect(calculateFovDistanceCompensation(26, 26, 7, 0.7)).toBeCloseTo(7, 6);
      expect(calculateFovDistanceCompensation(60, 60, 100, 5)).toBeCloseTo(100, 6);
    });

    it('should match the original formula when focusOffset is 0', () => {
      const withDefault = calculateFovDistanceCompensation(26, 60, 7);
      const withExplicitZero = calculateFovDistanceCompensation(26, 60, 7, 0);
      expect(withExplicitZero).toBeCloseTo(withDefault, 10);
    });

    it('should produce the correct result for gizmo constants (FOV=26->90, dist=7, offset=0.7)', () => {
      const degToRad = Math.PI / 180;
      // NewDist = 0.7 + (7 - 0.7) * tan(13°) / tan(45°)
      const expected = 0.7 + 6.3 * (Math.tan(13 * degToRad) / Math.tan(45 * degToRad));
      const result = calculateFovDistanceCompensation(26, 90, 7, 0.7);
      expect(result).toBeCloseTo(expected, 6);
    });

    it('should keep the focus plane at constant projected size across FOV changes', () => {
      const offset = 0.7;
      const baseDistance = 7;
      const baseFov = 26;
      const degToRad = Math.PI / 180;

      // At any FOV, (newDist - offset) * tan(newFov/2) should equal (baseDist - offset) * tan(baseFov/2)
      const baseProduct = (baseDistance - offset) * Math.tan((baseFov / 2) * degToRad);

      for (const newFov of [0.1, 10, 26, 45, 60, 90]) {
        const newDistance = calculateFovDistanceCompensation(baseFov, newFov, baseDistance, offset);
        const newProduct = (newDistance - offset) * Math.tan((newFov / 2) * degToRad);
        expect(newProduct).toBeCloseTo(baseProduct, 6);
      }
    });

    it('should return to the original distance after a round-trip with focusOffset', () => {
      const original = 7;
      const offset = 0.7;
      const intermediate = calculateFovDistanceCompensation(26, 60, original, offset);
      const restored = calculateFovDistanceCompensation(60, 26, intermediate, offset);
      expect(restored).toBeCloseTo(original, 6);
    });
  });
});
