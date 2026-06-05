import { describe, expect, it } from 'vitest';
import { analyzeChamferDistance } from '#mesh/distance.js';
import { createOpenCascadeMeshAnalyzer } from '#mesh/native.js';
import type { MeshTriangle } from '#mesh/types.js';
import type { GeoSpecOpenCascadeMeshModule } from '#mesh/native.js';

const triangle = (x = 0): MeshTriangle => ({
  primitive: 'fixture#0',
  triangleIndex: 0,
  a: [x, 0, 0],
  b: [x + 1, 0, 0],
  c: [x, 1, 0],
  center: [x + 1 / 3, 1 / 3, 0],
  area: 0.5,
});

describe('mesh distance analysis', () => {
  it('should fail with a diagnostic when the JavaScript fallback exceeds its pair budget', () => {
    const result = analyzeChamferDistance({
      actual: [triangle(0), triangle(2)],
      expected: [triangle(10), triangle(12)],
      samples: 8,
      maxNaiveTrianglePairs: 4,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected bounded distance analysis to fail.');
    }
    expect(result.diagnostics[0]).toMatchObject({
      code: 'GEOSPEC_DISTANCE_BUDGET_EXCEEDED',
      severity: 'error',
      details: {
        estimatedTrianglePairs: 16,
        maxNaiveTrianglePairs: 4,
        nativeAvailable: false,
      },
    });
    const suggestion = result.diagnostics[0]?.suggestion ?? '';
    expect(suggestion).not.toMatch(/simpler|simplify/i);
    const normalizedSuggestion = suggestion.toLowerCase();
    expect(normalizedSuggestion).toContain('native geospec opencascade c++ metrics analyzer');
    expect(normalizedSuggestion).toContain('test precision budget');
  });

  it('should use a native analyzer when one is provided for a pair-budgeted case', () => {
    const result = analyzeChamferDistance({
      actual: [triangle(0), triangle(2)],
      expected: [triangle(10), triangle(12)],
      samples: 8,
      maxNaiveTrianglePairs: 4,
      nativeAnalyzer: {
        analyzeChamferDistance(options) {
          expect(options.actual.triangleCount).toBe(2);
          expect(options.expected.triangleCount).toBe(2);
          expect(options.samples).toBe(8);
          return { min: 0.5, mean: 1, max: 2, p50: 1, p95: 1.5, p99: 2, rms: 1.25, samples: 8 };
        },
      },
    });

    expect(result).toMatchObject({
      success: true,
      stats: { mean: 1, max: 2, p95: 1.5, samples: 8 },
    });
  });

  it('should report exactly the requested JavaScript fallback sample count', () => {
    for (const samples of [1, 2, 3, 5, 11]) {
      const result = analyzeChamferDistance({
        actual: [triangle(0), triangle(1)],
        expected: [triangle(0), triangle(1)],
        samples,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.stats.samples).toBe(samples);
      }
    }
  });

  it('should adapt OpenCascade.js heap buffers into a native analyzer', () => {
    const heap = new Float64Array(64);
    const freedPointers: number[] = [];
    let deletedStats = false;
    let nextPointer = 0;
    const module = Object.create(null) as GeoSpecOpenCascadeMeshModule;
    module._malloc = (bytes: number): number => {
      const pointer = nextPointer;
      nextPointer += bytes;
      return pointer;
    };
    module._free = (pointer: number): void => {
      freedPointers.push(pointer);
    };
    module.HEAPF64 = heap;
    module.HEAP32 = new Int32Array(heap.buffer);
    module.GeoSpecMeshMetrics = {
      chamferDistanceFromTrianglePointers(...args) {
        const [actualPointer, actualTriangleCount, expectedPointer, expectedTriangleCount, samples] = args;
        expect(actualTriangleCount).toBe(1);
        expect(expectedTriangleCount).toBe(1);
        expect(samples).toBe(4);
        expect(heap.slice(actualPointer / 8, actualPointer / 8 + 9)).toEqual(
          new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        );
        expect(heap.slice(expectedPointer / 8, expectedPointer / 8 + 9)).toEqual(
          new Float64Array([2, 0, 0, 3, 0, 0, 2, 1, 0]),
        );
        return {
          mean: 2,
          max: 3,
          min: 1,
          p50: 2,
          p95: 2.5,
          p99: 3,
          rms: 2.25,
          samples,
          delete() {
            deletedStats = true;
          },
        };
      },
      componentOverlapFromTrianglePointers() {
        throw new Error('native overlap should not be called for distance analysis');
      },
    };

    const analyzer = createOpenCascadeMeshAnalyzer(module);
    const stats = analyzer.analyzeChamferDistance?.({
      actual: { triangles: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), triangleCount: 1 },
      expected: { triangles: new Float64Array([2, 0, 0, 3, 0, 0, 2, 1, 0]), triangleCount: 1 },
      samples: 4,
    });

    expect(stats).toEqual({
      algorithm: 'opencascade-bvh',
      max: 3,
      mean: 2,
      min: 1,
      p50: 2,
      p95: 2.5,
      p99: 3,
      rms: 2.25,
      samples: 4,
      seed: undefined,
    });
    expect(deletedStats).toBe(true);
    expect(freedPointers).toEqual([72, 0]);
  });

  it('should reject malformed native triangle buffers before allocating WASM memory', () => {
    const module = Object.create(null) as GeoSpecOpenCascadeMeshModule;
    module._malloc = () => {
      throw new Error('malloc should not be called for invalid triangle buffers');
    };
    module._free = () => undefined;
    module.HEAPF64 = new Float64Array(64);
    module.HEAP32 = new Int32Array(module.HEAPF64.buffer);
    module.GeoSpecMeshMetrics = {
      chamferDistanceFromTrianglePointers() {
        throw new Error('native distance should not be called for invalid triangle buffers');
      },
      componentOverlapFromTrianglePointers() {
        throw new Error('native overlap should not be called for invalid triangle buffers');
      },
    };

    const analyzer = createOpenCascadeMeshAnalyzer(module);

    expect(() =>
      analyzer.analyzeChamferDistance?.({
        actual: { triangles: new Float64Array([0, 0, 0]), triangleCount: 1 },
        expected: { triangles: new Float64Array(9), triangleCount: 1 },
        samples: 1,
      }),
    ).toThrow('actual.triangles length (3) must equal triangleCount * 9 (9).');
  });

  it('should adapt OpenCascade.js component buffers into native overlap analysis', () => {
    const heap = new Float64Array(128);
    const heap32 = new Int32Array(heap.buffer);
    const freedPointers: number[] = [];
    let deletedResult = false;
    let nextPointer = 0;
    const module = Object.create(null) as GeoSpecOpenCascadeMeshModule;
    module._malloc = (bytes: number): number => {
      const pointer = nextPointer;
      nextPointer += bytes;
      return pointer;
    };
    module._free = (pointer: number): void => {
      freedPointers.push(pointer);
    };
    module.HEAPF64 = heap;
    module.HEAP32 = heap32;
    module.GeoSpecMeshMetrics = {
      chamferDistanceFromTrianglePointers() {
        throw new Error('native distance should not be called for overlap analysis');
      },
      componentOverlapFromTrianglePointers(...args) {
        const [trianglePointer, triangleCount, componentIdPointer, componentCount, tolerance] = args;
        expect(triangleCount).toBe(2);
        expect(componentCount).toBe(2);
        expect(tolerance).toBe(0.1);
        expect(heap.slice(trianglePointer / 8, trianglePointer / 8 + 18)).toEqual(
          new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]),
        );
        expect(heap32.slice(componentIdPointer / 4, componentIdPointer / 4 + 2)).toEqual(new Int32Array([0, 1]));
        return {
          success: true,
          evidenceJson: () =>
            JSON.stringify({
              success: true,
              componentCount: 2,
              checkedPairs: 1,
              overlaps: [{ leftComponentId: 0, rightComponentId: 1, intersectionVolume: 2 }],
            }),
          delete() {
            deletedResult = true;
          },
        };
      },
    };

    const analyzer = createOpenCascadeMeshAnalyzer(module);
    const result = analyzer.analyzeMeshOverlap?.({
      subject: {
        triangles: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 2, 0, 0, 3, 0, 0, 2, 1, 0]),
        triangleCount: 2,
      },
      componentIds: new Int32Array([0, 1]),
      components: [
        { id: 0, label: 'left', triangleCount: 1 },
        { id: 1, label: 'right', triangleCount: 1 },
      ],
      tolerance: 0.1,
    });

    expect(result).toEqual({
      success: true,
      componentCount: 2,
      checkedPairs: 1,
      overlaps: [{ leftComponentId: 0, rightComponentId: 1, intersectionVolume: 2 }],
    });
    expect(deletedResult).toBe(true);
    expect(freedPointers).toEqual([144, 0]);
  });
});
