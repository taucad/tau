import { describe, expect, it } from 'vitest';
import { detectEdges } from '#utils/edge-detection.js';

describe('detectEdges', () => {
  it('suppresses a coplanar triangulation chord', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);

    const result = detectEdges(positions, indices);

    // A de-indexed soup: four segments, two vertices each, and no index buffer to pay for.
    expect(result.positions).toHaveLength(4 * 2 * 3);
    expect(result).not.toHaveProperty('indices');
  });

  it('keeps a sharp shared edge', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const indices = new Uint32Array([0, 1, 2, 1, 0, 3]);

    expect(detectEdges(positions, indices).positions).toHaveLength(5 * 2 * 3);
  });

  it('does not weld metre-space vertices beyond the pre-migration physical tolerance', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1e-9, 0, 0, 1e-9, 0, 1, -1, 0]);
    const indices = new Uint32Array([0, 1, 2, 3, 4, 5]);

    expect(detectEdges(positions, indices).positions).toHaveLength(6 * 2 * 3);
  });
});
