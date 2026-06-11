import { describe, expect, it } from 'vitest';
import { analyzeChamferDistance } from '#mesh/distance.js';
import { createOpenCascadeMeshBackend } from '#mesh/native.js';
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
  it('should fail with a diagnostic when the native sampling budget is exceeded', async () => {
    const result = await analyzeChamferDistance({
      actual: [triangle(0), triangle(2)],
      expected: [triangle(10), triangle(12)],
      samples: 8,
      maxDistanceSamples: 4,
      resolveDefaultBackend: false,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected bounded distance analysis to fail.');
    }
    expect(result.diagnostics[0]).toMatchObject({
      code: 'GEOSPEC_DISTANCE_BUDGET_EXCEEDED',
      severity: 'error',
      details: {
        requestedSamples: 8,
        maxDistanceSamples: 4,
      },
    });
    const suggestion = result.diagnostics[0]?.suggestion ?? '';
    expect(suggestion).not.toMatch(/simpler|simplify/i);
    expect(suggestion.toLowerCase()).toContain('test precision budget');
  });

  it('should fail explicitly when native distance analysis is unavailable', async () => {
    const result = await analyzeChamferDistance({
      actual: [triangle(0)],
      expected: [triangle(2)],
      samples: 4,
      resolveDefaultBackend: false,
    });

    expect(result).toMatchObject({
      success: false,
      diagnostics: [
        {
          code: 'GEOSPEC_NATIVE_DISTANCE_UNAVAILABLE',
          severity: 'error',
        },
      ],
    });
  });

  it('should use a native analyzer when one is provided', async () => {
    const result = await analyzeChamferDistance({
      actual: [triangle(0), triangle(2)],
      expected: [triangle(10), triangle(12)],
      samples: 8,
      backend: {
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

  it('should report exactly the requested native sample count', async () => {
    const results = await Promise.all(
      [1, 2, 3, 5, 11].map(async (samples) => {
        const result = await analyzeChamferDistance({
          actual: [triangle(0), triangle(1)],
          expected: [triangle(0), triangle(1)],
          samples,
          backend: {
            analyzeChamferDistance(options) {
              return { min: 0, mean: 0, max: 0, p50: 0, p95: 0, p99: 0, rms: 0, samples: options.samples };
            },
          },
        });
        return { result, samples };
      }),
    );

    for (const { result, samples } of results) {
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

    const backend = createOpenCascadeMeshBackend(module);
    const stats = backend.analyzeChamferDistance({
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
    module.GeoSpecMeshMetrics = {
      chamferDistanceFromTrianglePointers() {
        throw new Error('native distance should not be called for invalid triangle buffers');
      },
    };

    const backend = createOpenCascadeMeshBackend(module);

    expect(() =>
      backend.analyzeChamferDistance({
        actual: { triangles: new Float64Array([0, 0, 0]), triangleCount: 1 },
        expected: { triangles: new Float64Array(9), triangleCount: 1 },
        samples: 1,
      }),
    ).toThrow('actual.triangles length (3) must equal triangleCount * 9 (9).');
  });
});
