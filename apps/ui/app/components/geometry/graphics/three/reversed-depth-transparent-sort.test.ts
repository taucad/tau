import { describe, expect, it } from 'vitest';
import { reversedDepthTransparentSort } from '#components/geometry/graphics/three/reversed-depth-transparent-sort.js';
import type { TransparentSortItem } from '#components/geometry/graphics/three/reversed-depth-transparent-sort.js';

function makeItem(overrides: Partial<TransparentSortItem> = {}): TransparentSortItem {
  return {
    groupOrder: 0,
    renderOrder: 0,
    z: 0,
    id: 0,
    ...overrides,
  };
}

describe('reversedDepthTransparentSort', () => {
  describe('groupOrder precedence', () => {
    it('should sort smaller groupOrder before larger groupOrder', () => {
      const lower = makeItem({ groupOrder: 0 });
      const higher = makeItem({ groupOrder: 1 });

      expect(reversedDepthTransparentSort(lower, higher)).toBeLessThan(0);
      expect(reversedDepthTransparentSort(higher, lower)).toBeGreaterThan(0);
    });

    it('should fall through to renderOrder when groupOrder ties', () => {
      const earlier = makeItem({ groupOrder: 0, renderOrder: 0 });
      const later = makeItem({ groupOrder: 0, renderOrder: 1 });

      expect(reversedDepthTransparentSort(earlier, later)).toBeLessThan(0);
      expect(reversedDepthTransparentSort(later, earlier)).toBeGreaterThan(0);
    });
  });

  describe('renderOrder precedence', () => {
    it('should sort smaller renderOrder before larger renderOrder when groupOrder ties', () => {
      const earlier = makeItem({ renderOrder: 0 });
      const later = makeItem({ renderOrder: 5 });

      expect(reversedDepthTransparentSort(earlier, later)).toBeLessThan(0);
    });
  });

  describe('z order under reversed-Z (inverted vs upstream)', () => {
    it('should sort smaller z before larger z (closer = larger clip-z renders LAST)', () => {
      // Under reversed-Z: closer to camera = larger clip-z. We want CLOSER to render LAST so
      // it overdraws farther geometry under depthTest:false. Smaller-z (farther) goes first.
      const closer = makeItem({ z: 10 });
      const farther = makeItem({ z: 1 });

      expect(reversedDepthTransparentSort(closer, farther)).toBeGreaterThan(0);
      expect(reversedDepthTransparentSort(farther, closer)).toBeLessThan(0);
    });

    it('should invert upstream `reversePainterSortStable` z comparison exactly', () => {
      // Upstream (`node_modules/three/src/renderers/common/RenderList.js`) returns `b.z - a.z`;
      // this regression guard documents the intentional sign flip to `a.z - b.z`.
      const lowZ = makeItem({ z: 3 });
      const highZ = makeItem({ z: 7 });

      expect(reversedDepthTransparentSort(lowZ, highZ)).toBe(3 - 7);
    });
  });

  describe('id tie-break', () => {
    it('should fall back to id ascending when groupOrder, renderOrder, and z all tie', () => {
      const earlier = makeItem({ id: 1 });
      const later = makeItem({ id: 2 });

      expect(reversedDepthTransparentSort(earlier, later)).toBeLessThan(0);
      expect(reversedDepthTransparentSort(later, earlier)).toBeGreaterThan(0);
    });
  });

  describe('field precedence ordering', () => {
    it('should resolve groupOrder before renderOrder, z, and id', () => {
      const winner = makeItem({ groupOrder: 0, renderOrder: 99, z: 99, id: 99 });
      const loser = makeItem({ groupOrder: 1, renderOrder: 0, z: 0, id: 0 });

      expect(reversedDepthTransparentSort(winner, loser)).toBeLessThan(0);
    });

    it('should resolve renderOrder before z and id when groupOrder ties', () => {
      const winner = makeItem({ groupOrder: 0, renderOrder: 0, z: 99, id: 99 });
      const loser = makeItem({ groupOrder: 0, renderOrder: 1, z: 0, id: 0 });

      expect(reversedDepthTransparentSort(winner, loser)).toBeLessThan(0);
    });

    it('should resolve z before id when groupOrder and renderOrder tie', () => {
      const winner = makeItem({ z: 0, id: 99 });
      const loser = makeItem({ z: 1, id: 0 });

      expect(reversedDepthTransparentSort(winner, loser)).toBeLessThan(0);
    });
  });

  describe('null coercion (matching upstream JS semantics)', () => {
    it('should treat null groupOrder as 0 in subtraction (null !== 0 path)', () => {
      const nullishGroup = makeItem({ groupOrder: null });
      const zeroGroup = makeItem({ groupOrder: 0 });

      // `null !== 0` is true, so we evaluate the difference: `(null ?? 0) - 0 = 0`.
      // The sort returns 0, leaving the pair in their original order.
      expect(reversedDepthTransparentSort(nullishGroup, zeroGroup)).toBe(0);
    });

    it('should compute null - number as -number (upstream parity)', () => {
      const nullZ = makeItem({ z: null });
      const numericZ = makeItem({ z: 5 });

      expect(reversedDepthTransparentSort(nullZ, numericZ)).toBe(-5);
    });
  });

  describe('section-view label scenario (regression guard)', () => {
    it('should sort the inverse selector before the forward selector under reversed-Z', () => {
      // The forward selector ("Top") sits `labelDepth*scale` closer to the camera than the
      // inverse selector ("Bottom") under reversed-Z, so its clip-z is LARGER. Both share
      // the same groupOrder + renderOrder, so the sort falls through to z. We want the
      // inverse to draw FIRST and the forward to draw LAST (overdraws under depthTest:false).
      const forwardCloser = makeItem({ id: 1, z: 5 });
      const inverseFarther = makeItem({ id: 2, z: 1 });

      const sorted = [forwardCloser, inverseFarther].sort(reversedDepthTransparentSort);

      expect(sorted[0]).toBe(inverseFarther);
      expect(sorted[1]).toBe(forwardCloser);
    });
  });
});
