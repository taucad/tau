import nativeFactory from 'geospec/native/opencascade/single';
import { describe, expect, it, vi } from 'vitest';
import { createOpenCascadeMeshAnalyzer } from '#mesh/native.js';
import type { GeoSpecOpenCascadeMeshModule } from '#mesh/native.js';

/* eslint-disable @typescript-eslint/naming-convention -- OpenCascade.js embind module keys are generated API names. */

const boxPositions = [
  0, 0, 0, 10, 20, 0, 10, 0, 0, 0, 0, 0, 0, 20, 0, 10, 20, 0, 0, 0, 30, 10, 0, 30, 10, 20, 30, 0, 0, 30, 10, 20, 30, 0,
  20, 30, 0, 0, 0, 10, 0, 0, 10, 0, 30, 0, 0, 0, 10, 0, 30, 0, 0, 30, 0, 20, 0, 10, 20, 30, 10, 20, 0, 0, 20, 0, 0, 20,
  30, 10, 20, 30, 0, 0, 0, 0, 0, 30, 0, 20, 30, 0, 0, 0, 0, 20, 30, 0, 20, 0, 10, 0, 0, 10, 20, 0, 10, 20, 30, 10, 0, 0,
  10, 20, 30, 10, 0, 30,
];

const shiftBox = (x: number): number[] => boxPositions.map((value, index) => (index % 3 === 0 ? value + x : value));

const twoBoxSoup = (x: number) => ({
  triangles: new Float64Array([...boxPositions, ...shiftBox(x)]),
  triangleCount: 24,
});

const twoBoxComponentIds = new Int32Array([
  ...Array.from({ length: 12 }, () => 0),
  ...Array.from({ length: 12 }, () => 1),
]);

const twoBoxComponents = [
  { id: 0, label: 'left-box', triangleCount: 12 },
  { id: 1, label: 'right-box', triangleCount: 12 },
];

const analyzeTwoBoxes = async (x: number) => {
  const module = await nativeFactory();
  const analyzer = createOpenCascadeMeshAnalyzer(module as unknown as GeoSpecOpenCascadeMeshModule);
  const result = analyzer.analyzeMeshOverlap?.({
    subject: twoBoxSoup(x),
    componentIds: twoBoxComponentIds,
    components: twoBoxComponents,
    tolerance: 0.001,
  });
  if (!result) {
    throw new Error('Expected generated OpenCascade analyzer to expose component overlap.');
  }
  return result;
};

describe('OpenCascade native component overlap analyzer', () => {
  it('should report no positive-volume overlap for disjoint faceted solids', { timeout: 30_000 }, async () => {
    const result = await analyzeTwoBoxes(15);

    expect(result).toMatchObject({
      success: true,
      componentCount: 2,
      checkedPairs: 1,
      overlaps: [],
    });
  });

  it('should treat tangent contact as non-overlap', { timeout: 30_000 }, async () => {
    const result = await analyzeTwoBoxes(10);

    expect(result.success).toBe(true);
    expect(result.overlaps).toEqual([]);
  });

  it(
    'should report positive solid intersection volume for overlapping faceted solids',
    { timeout: 30_000 },
    async () => {
      const result = await analyzeTwoBoxes(9);

      expect(result.success).toBe(true);
      expect(result.overlaps).toHaveLength(1);
      const [overlap] = result.overlaps;
      expect(overlap?.leftComponentId).toBe(0);
      expect(overlap?.rightComponentId).toBe(1);
      expect(overlap?.intersectionVolume).toBeCloseTo(600, 2);
      expect(overlap?.witnessPoint).toHaveLength(3);
      expect(overlap?.witnessPoint?.every((coordinate) => Number.isFinite(coordinate))).toBe(true);
    },
  );

  it('should validate triangle buffers before allocating WASM memory', () => {
    const module = {
      HEAP32: new Int32Array(16),
      HEAPF64: new Float64Array(16),
      _malloc: vi.fn(() => 0),
      _free: vi.fn(),
      GeoSpecMeshMetrics: {
        chamferDistanceFromTrianglePointers() {
          throw new Error('distance analyzer should not run');
        },
        componentOverlapFromTrianglePointers() {
          throw new Error('native overlap should not run');
        },
      },
    } satisfies GeoSpecOpenCascadeMeshModule;
    const analyzer = createOpenCascadeMeshAnalyzer(module);

    expect(() =>
      analyzer.analyzeMeshOverlap?.({
        subject: { triangles: new Float64Array(8), triangleCount: 1 },
        componentIds: new Int32Array([0]),
        components: twoBoxComponents,
        tolerance: 0.1,
      }),
    ).toThrow('subject.triangles length (8) must equal triangleCount * 9 (9).');
    expect(module._malloc).not.toHaveBeenCalled();
  });
});

/* eslint-enable @typescript-eslint/naming-convention -- Return to normal naming checks after generated OpenCascade.js test doubles. */
