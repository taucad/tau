import { describe, it, expect, vi } from 'vitest';
import { Matrix4, Vector2 } from 'three';
import type { InstancedBufferGeometry } from 'three';
import {
  createEdgePrototypeGeometry,
  createEdgeBatchMaterial,
  getEdgeOccurrenceCapacity,
  getEdgeOccurrenceCount,
  setEdgeOccurrenceCount,
  writeEdgePlacement,
} from '#graphics/three/utils/gltf-edge-batches.js';
import type { EdgeBatchLayout } from '#graphics/three/utils/gltf-edge-batches.js';
import { serialiseStrippedTslGraph } from '#graphics/three/utils/tsl-node-graph-snapshot.js';

/** Bytes of the arrays a batch geometry allocated itself; the caller's prototype endpoints are not counted. */
function ownedBytes(geometry: InstancedBufferGeometry, prototype: Float32Array): number {
  const arrays = new Set<ArrayLike<number> & { byteLength: number }>();
  for (const attribute of Object.values(geometry.attributes)) {
    const { array } = 'data' in attribute ? attribute.data : attribute;
    arrays.add(array as Float32Array);
  }
  arrays.add(geometry.getIndex()!.array as Uint16Array);
  arrays.delete(prototype);
  return [...arrays].reduce((total, array) => total + array.byteLength, 0);
}

/** One occurrence's placement column as the shader reads it on every vertex of its draw. */
function readPlacementColumns(geometry: InstancedBufferGeometry, slot: number): number[][] {
  const perOccurrence = geometry.getAttribute('tauOccurrence0').count / getEdgeOccurrenceCapacity(geometry);
  return Array.from({ length: perOccurrence }, (_, vertex) =>
    Array.from({ length: 4 }, (_, column) => [
      ...(geometry.getAttribute(`tauOccurrence${column}`).array as Float32Array).subarray(
        (slot * perOccurrence + vertex) * 4,
        (slot * perOccurrence + vertex + 1) * 4,
      ),
    ]).flat(),
  );
}

describe('edge occurrence semantics', () => {
  it('should reject malformed prototypes and out-of-capacity placements', () => {
    for (const positions of [
      new Float32Array(),
      new Float32Array([1]),
      new Float32Array([Number.NaN, 0, 0, 0, 0, 0]),
    ]) {
      expect(() => createEdgePrototypeGeometry(positions, 1)).toThrow('complete finite segments');
    }
    for (const layout of ['occurrences', 'segments'] as const) {
      const g = createEdgePrototypeGeometry(new Float32Array([0, 0, 0, 1, 2, 3]), 2, layout);
      try {
        expect(() => {
          writeEdgePlacement(g, 2, new Matrix4());
        }).toThrow('Invalid edge occurrence placement');
        expect(() => {
          setEdgeOccurrenceCount(g, 3);
        }).toThrow('Invalid edge occurrence count');
        const m = new Matrix4().makeTranslation(1e6, -1e6, 0.001);
        writeEdgePlacement(g, 1, m);
        for (const vertex of readPlacementColumns(g, 1)) {
          expect(vertex).toEqual(m.elements.map((value) => Math.fround(value)));
        }
        expect(
          readPlacementColumns(g, 0)
            .flat()
            .every((value) => value === 0),
        ).toBe(true);
      } finally {
        g.dispose();
      }
    }
  });
  it('should write a placement without copying the matrix columns', () => {
    const geometry = createEdgePrototypeGeometry(new Float32Array([0, 0, 0, 1, 2, 3]), 1);
    const matrix = new Matrix4().makeTranslation(1, 2, 3);
    const slice = vi.spyOn(Array.prototype, 'slice');
    try {
      writeEdgePlacement(geometry, 0, matrix);
      expect(slice).not.toHaveBeenCalled();
    } finally {
      slice.mockRestore();
      geometry.dispose();
    }
    for (const vertex of readPlacementColumns(geometry, 0)) {
      expect(vertex).toEqual(matrix.elements);
    }
  });
  it.each([8191, 8192])('should retain lossless index width for %s unrolled prototype segments', (segments) => {
    const geometry = createEdgePrototypeGeometry(new Float32Array(segments * 6), 1, 'occurrences');
    try {
      const indices = geometry.getIndex()!;
      expect(indices.array).toBeInstanceOf(segments === 8191 ? Uint16Array : Uint32Array);
      expect(indices.getX(indices.count - 2)).toBe(segments * 8 - 1);
      expect(indices.count).toBe(segments * 18);
    } finally {
      geometry.dispose();
    }
  });
  it.each([8191, 8192])('should retain lossless index width for %s segment-layout occurrences', (capacity) => {
    const geometry = createEdgePrototypeGeometry(new Float32Array(6), capacity, 'segments');
    try {
      const indices = geometry.getIndex()!;
      expect(indices.array).toBeInstanceOf(capacity === 8191 ? Uint16Array : Uint32Array);
      expect(indices.getX(indices.count - 2)).toBe(capacity * 8 - 1);
    } finally {
      geometry.dispose();
    }
  });
  it('should keep a repeated 50k-segment prototype within 32 B per segment', () => {
    const segments = 50_000;
    const occurrences = 20;
    const positions = new Float32Array(segments * 6).map((_, i) => i % 7);
    const geometry = createEdgePrototypeGeometry(positions, occurrences);
    try {
      expect(ownedBytes(geometry, positions)).toBeLessThan(segments * 32);
      // The endpoints are read in place, never copied onto the CPU again.
      expect(geometry.getAttribute('instanceStart').array).toBe(positions);
    } finally {
      geometry.dispose();
    }
  });
  it.each([
    [2, 1000],
    [200, 1000],
    [50_000, 20],
    [1, 1],
  ])('should never own more than the unrolled layout for %s segments and %s occurrences', (segments, occurrences) => {
    const positions = new Float32Array(segments * 6);
    const unrolled = createEdgePrototypeGeometry(positions, occurrences, 'occurrences');
    const chosen = createEdgePrototypeGeometry(positions, occurrences);
    try {
      // The unrolled layout owns every array twice (CPU and GPU); the segment layout's endpoints live on the GPU once.
      const resident = (geometry: InstancedBufferGeometry) =>
        2 * ownedBytes(geometry, positions) +
        (geometry.getAttribute('instanceStart').array === positions ? positions.byteLength : 0);
      expect(resident(chosen)).toBeLessThanOrEqual(resident(unrolled));
    } finally {
      unrolled.dispose();
      chosen.dispose();
    }
  });
  it.each(['occurrences', 'segments'] satisfies EdgeBatchLayout[])(
    'should draw only the counted %s-layout occurrences',
    (layout) => {
      const geometry = createEdgePrototypeGeometry(new Float32Array(3 * 6), 4, layout);
      try {
        expect(getEdgeOccurrenceCapacity(geometry)).toBe(4);
        expect(getEdgeOccurrenceCount(geometry)).toBe(0);
        setEdgeOccurrenceCount(geometry, 3);
        expect(getEdgeOccurrenceCount(geometry)).toBe(3);
        // Occurrences are instances of 3 unrolled segments, or segments are instances of 3 occurrence quads.
        expect([geometry.instanceCount, Math.min(geometry.drawRange.count, geometry.getIndex()!.count)]).toEqual([
          3,
          3 * 18,
        ]);
      } finally {
        geometry.dispose();
      }
    },
  );
  it('should retain the stripped occurrence endpoint graph', () => {
    const m = createEdgeBatchMaterial('webgpu', new Vector2(128, 128), 0);
    try {
      expect(serialiseStrippedTslGraph(m.toJSON())).toMatchSnapshot();
    } finally {
      m.dispose();
    }
  });
});
