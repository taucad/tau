import { describe, expect, it } from 'vitest';
import { calculateFovFromAngle, calculateGizmoFovFromAngle, gizmoFovScale } from '#graphics/three/utils/math.utils.js';

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
