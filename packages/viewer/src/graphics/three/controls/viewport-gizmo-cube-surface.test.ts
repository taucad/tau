import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createViewportGizmoSurfaceGeometry } from '#graphics/three/controls/viewport-gizmo-cube-surface.js';

describe('view cube surface', () => {
  it('should form one closed surface across all 26 picking regions', () => {
    const regions = createViewportGizmoSurfaceGeometry();
    try {
      expect([...regions.keys()].filter((key) => key.split(',').length === 1)).toHaveLength(6);
      expect([...regions.keys()].filter((key) => key.split(',').length === 2)).toHaveLength(12);
      expect([...regions.keys()].filter((key) => key.split(',').length === 3)).toHaveLength(8);
      const edges = new Map<string, number>();
      const vertex = new Vector3();
      for (const geometry of regions.values()) {
        const positions = geometry.getAttribute('position');
        for (let index = 0; index < positions.count; index += 3) {
          const triangle = [0, 1, 2].map((offset) =>
            vertex
              .fromBufferAttribute(positions, index + offset)
              .toArray()
              .map((value) => value.toFixed(6))
              .join(','),
          );
          for (let edge = 0; edge < 3; edge++) {
            const key = [triangle[edge]!, triangle[(edge + 1) % 3]!]
              .sort((left, right) => left.localeCompare(right))
              .join('|');
            edges.set(key, (edges.get(key) ?? 0) + 1);
          }
        }
      }
      // This includes boundaries between regions, where the old rotated spheres and
      // independently tessellated cylinders left open edges. Every edge has two faces.
      expect([...edges.values()].filter((count) => count !== 2)).toEqual([]);
    } finally {
      for (const geometry of regions.values()) {
        geometry.dispose();
      }
    }
  });
});
