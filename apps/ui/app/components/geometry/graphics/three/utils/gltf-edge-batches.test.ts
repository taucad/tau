import { describe, it, expect } from 'vitest';
import { DoubleSide, Matrix4, Vector2 } from 'three';
import {
  createEdgePrototypeGeometry,
  createEdgeBatchMaterial,
  writeEdgePlacement,
} from '#components/geometry/graphics/three/utils/gltf-edge-batches.js';
import { serialiseStrippedTslGraph } from '#components/geometry/graphics/three/utils/tsl-node-graph-snapshot.js';
describe('edge occurrence semantics', () => {
  it('should reject malformed prototypes and out-of-capacity placements', () => {
    for (const positions of [
      new Float32Array(),
      new Float32Array([1]),
      new Float32Array([Number.NaN, 0, 0, 0, 0, 0]),
    ]) {
      expect(() => createEdgePrototypeGeometry(positions, 1)).toThrow('complete finite segments');
    }
    const g = createEdgePrototypeGeometry(new Float32Array([0, 0, 0, 1, 2, 3]), 2);
    try {
      expect(() => {
        writeEdgePlacement(g, 2, new Matrix4());
      }).toThrow('Invalid edge occurrence placement');
      const m = new Matrix4().makeTranslation(1e6, -1e6, 0.001);
      writeEdgePlacement(g, 1, m);
      for (let c = 0; c < 4; c++) {
        expect([...g.getAttribute(`tauOccurrence${c}`).array].slice(4)).toEqual(
          m.elements.slice(c * 4, c * 4 + 4).map((value) => Math.fround(value)),
        );
      }
    } finally {
      g.dispose();
    }
  });
  it.each([8191, 8192])('should retain lossless index width for %s prototype segments', (segments) => {
    const geometry = createEdgePrototypeGeometry(new Float32Array(segments * 6), 1);
    try {
      const indices = geometry.getIndex()!;
      expect(indices.array).toBeInstanceOf(segments === 8191 ? Uint16Array : Uint32Array);
      expect(indices.getX(indices.count - 2)).toBe(segments * 8 - 1);
      expect(indices.count).toBe(segments * 18);
    } finally {
      geometry.dispose();
    }
  });
  it('should retain the stripped occurrence endpoint graph', () => {
    const m = createEdgeBatchMaterial('webgpu', new Vector2(128, 128), 0);
    try {
      expect(m.side).toBe(DoubleSide);
      expect(serialiseStrippedTslGraph(m.toJSON())).toMatchSnapshot();
    } finally {
      m.dispose();
    }
  });
});
