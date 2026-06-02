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
});
