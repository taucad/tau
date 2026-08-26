// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { buildSectionContourBorderPositions } from '#components/geometry/graphics/three/utils/section-contour-border.js';

const asNumbers = (array: Float32Array): number[] => [...array];

describe('buildSectionContourBorderPositions', () => {
  it('should convert closed contours into looped endpoint pairs', () => {
    const positions = buildSectionContourBorderPositions({
      closedContours: [[new Vector3(0, 0, 0), new Vector3(1, 0, 0), new Vector3(1, 1, 0)]],
      openPolylines: [],
    });

    expect(asNumbers(positions)).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0]);
  });

  it('should append open polyline endpoint pairs after closed contours', () => {
    const positions = buildSectionContourBorderPositions({
      closedContours: [[new Vector3(0, 0, 0), new Vector3(1, 0, 0)]],
      openPolylines: [[new Vector3(2, 0, 0), new Vector3(3, 0, 0), new Vector3(3, 1, 0)]],
    });

    expect(asNumbers(positions)).toEqual([0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 2, 0, 0, 3, 0, 0, 3, 0, 0, 3, 1, 0]);
  });

  it('should ignore contours and polylines that cannot form segments', () => {
    const positions = buildSectionContourBorderPositions({
      closedContours: [[], [new Vector3(0, 0, 0)]],
      openPolylines: [[], [new Vector3(1, 0, 0)]],
    });

    expect(positions).toHaveLength(0);
  });
});
