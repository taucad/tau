import { describe, expect, it } from 'vitest';
import { detectEdges } from '#utils/edge-detection.js';

describe('detectEdges', () => {
  it('suppresses a coplanar triangulation chord', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    const indices = new Uint32Array([0, 1, 2, 0, 2, 3]);

    const result = detectEdges(positions, indices);

    expect(result.positions).toHaveLength(4 * 2 * 3);
    expect(result.indices).toEqual(Uint32Array.from({ length: 8 }, (_, index) => index));
  });

  it('keeps a sharp shared edge', () => {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const indices = new Uint32Array([0, 1, 2, 1, 0, 3]);

    expect(detectEdges(positions, indices).positions).toHaveLength(5 * 2 * 3);
  });
});
