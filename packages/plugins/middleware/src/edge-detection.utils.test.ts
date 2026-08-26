import { describe, it, expect } from 'vitest';
import { detectEdges } from '@taucad/geometry-core';

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * Calculate bounding box of positions array.
 */
function calculateBoundingBox(positions: Float32Array): {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
} {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] ?? 0;
    const y = positions[index + 1] ?? 0;
    const z = positions[index + 2] ?? 0;

    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);

    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}

// =============================================================================
// Edge Detection Unit Tests
// =============================================================================

describe('detectEdges', () => {
  describe('Simple geometry', () => {
    it('should detect all 12 edges of a cube from indexed triangles', () => {
      // Unit cube: 8 vertices, 12 triangles (2 per face)
      // prettier-ignore -- preserve vertex coordinate alignment
      const positions = new Float32Array([
        // Front face vertices (z = 1)
        0,
        0,
        1, // 0
        1,
        0,
        1, // 1
        1,
        1,
        1, // 2
        0,
        1,
        1, // 3
        // Back face vertices (z = 0)
        0,
        0,
        0, // 4
        1,
        0,
        0, // 5
        1,
        1,
        0, // 6
        0,
        1,
        0, // 7
      ]);

      // 12 triangles for 6 faces (2 triangles per face)
      // prettier-ignore -- preserve triangle index grouping
      const indices = new Uint16Array([
        // Front face
        0, 1, 2, 2, 3, 0,
        // Back face
        5, 4, 7, 7, 6, 5,
        // Top face
        3, 2, 6, 6, 7, 3,
        // Bottom face
        4, 5, 1, 1, 0, 4,
        // Right face
        1, 5, 6, 6, 2, 1,
        // Left face
        4, 0, 3, 3, 7, 4,
      ]);

      const result = detectEdges(positions, indices, 30);

      // A cube has 12 edges, all should be detected as sharp (90 degree angles)
      const edgeCount = result.positions.length / 6; // 6 floats per edge (2 vertices × 3 coords)
      expect(edgeCount).toBe(12);

      // Verify edges form proper bounding box
      const bbox = calculateBoundingBox(result.positions);
      expect(bbox.min).toEqual([0, 0, 0]);
      expect(bbox.max).toEqual([1, 1, 1]);
    });

    it('should detect edges for a simple triangle', () => {
      // Single triangle has 3 boundary edges
      const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 1, 0]);

      // No indices = non-indexed geometry
      const result = detectEdges(positions, undefined, 30);

      // 3 boundary edges (edges with only one adjacent face)
      const edgeCount = result.positions.length / 6;
      expect(edgeCount).toBe(3);
    });
  });

  describe('Degenerate triangles', () => {
    it('should skip degenerate triangles where two vertices share the same hash', () => {
      const positions = new Float32Array([
        0,
        0,
        0, // V0
        0,
        0,
        0, // V1 (same as V0)
        1,
        1,
        0, // V2
      ]);

      const result = detectEdges(positions, undefined, 30);

      // Degenerate triangle should be skipped, producing no edges
      expect(result.positions.length).toBe(0);
    });
  });

  describe('Threshold behavior', () => {
    it('should detect all edges at threshold 0', () => {
      // Two triangles sharing an edge at 45 degree angle
      const positions = new Float32Array([
        0,
        0,
        0, // 0
        1,
        0,
        0, // 1
        0,
        1,
        0, // 2
        1,
        1,
        0.5, // 3 (tilted up)
      ]);

      const indices = new Uint16Array([
        0,
        1,
        2, // Triangle 1 (flat)
        1,
        3,
        2, // Triangle 2 (tilted)
      ]);

      const result = detectEdges(positions, indices, 0);

      // All shared edges should be detected at threshold 0
      // Plus boundary edges
      expect(result.positions.length).toBeGreaterThan(0);
    });

    it('should detect fewer edges at higher threshold', () => {
      // Same geometry, higher threshold
      const positions = new Float32Array([
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        1,
        0,
        1,
        1,
        0.1, // Very slight tilt
      ]);

      const indices = new Uint16Array([0, 1, 2, 1, 3, 2]);

      const lowThreshold = detectEdges(positions, indices, 1);
      const highThreshold = detectEdges(positions, indices, 89);

      // Shared edge between triangles should be detected at low threshold
      // but not at high threshold (angle is small)
      // Boundary edges should be detected in both cases
      expect(lowThreshold.positions.length).toBeGreaterThanOrEqual(highThreshold.positions.length);
    });
  });
});
