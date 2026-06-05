// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicad } from '@taucad/runtime/kernels';
import { esbuild } from '@taucad/runtime/bundler';
import type { MeasurementTestRequirement } from '#schemas.js';
import { analyzeGlb } from '#geometry/analyze-glb.js';
import { evaluateRequirement } from '#geometry/evaluate-requirement.js';
import type { ConnectedComponentsResult, CheckResult, GeometryStats, WatertightResult } from '#geometry/types.js';

async function renderGlb(filename: string, code: string): Promise<Uint8Array<ArrayBuffer>> {
  const filePath = filename.startsWith('/') ? filename : `/${filename}`;
  const runtime = defineRuntime({ kernels: [replicad()], bundlers: [esbuild()] });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ [filePath]: code }),
    }),
  });

  try {
    const result = await client.export('glb', { file: filePath });
    if (!result.success) {
      throw new Error(`Export failed: ${result.issues.map((issue) => issue.message).join('; ')}`);
    }
    return result.data.bytes;
  } finally {
    client.terminate();
  }
}

const boxCode = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    return makeBaseBox(10, 20, 30);
  }
`;

describe('evaluateRequirement', () => {
  let boxStats: GeometryStats;

  beforeAll(async () => {
    const glb = await renderGlb('box.ts', boxCode);
    boxStats = await analyzeGlb(glb);
  }, 120_000);

  // ---------------------------------------------------------------------------
  // Bounding box checks
  // ---------------------------------------------------------------------------

  describe('boundingBox', () => {
    it('should pass for correct dimensions', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb1',
        description: 'box size',
        type: 'measurement',
        check: 'boundingBox',
        expected: { size: { x: 0.01, y: 0.02, z: 0.03 } },
        tolerance: 0.001,
      };

      const result: CheckResult = evaluateRequirement(requirement, boxStats);
      expect(result.passed).toBe(true);
    });

    it('should fail for wrong dimensions', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb1',
        description: 'wrong size',
        type: 'measurement',
        check: 'boundingBox',
        expected: { size: { x: 99, y: 99, z: 99 } },
      };

      const result: CheckResult = evaluateRequirement(requirement, boxStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      if (result.check !== 'boundingBox') {
        throw new Error(`expected boundingBox, got ${result.check}`);
      }
      expect(result.reason).toContain('Bounding box mismatch');
      expect(result.failure.axisFailures.length).toBeGreaterThan(0);
      const xFail = result.failure.axisFailures.find((a) => a.field === 'size' && a.axis === 'x');
      expect(xFail?.minExtremum?.name).toBeDefined();
      expect(xFail?.maxExtremum?.name).toBeDefined();
    });

    it('should accept a single axis (partial check)', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb_x',
        description: 'x only',
        type: 'measurement',
        check: 'boundingBox',
        expected: { size: { x: 0.01 } },
      };

      const result: CheckResult = evaluateRequirement(requirement, boxStats);
      expect(result.passed).toBe(true);
    });

    it('should respect custom tolerance', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb1',
        description: 'loose tolerance',
        type: 'measurement',
        check: 'boundingBox',
        expected: { size: { x: 0.011, y: 0.021, z: 0.031 } },
        tolerance: 0.01,
      };

      const result: CheckResult = evaluateRequirement(requirement, boxStats);
      expect(result.passed).toBe(true);
    });

    it('should fail when expected has no size or center', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb1',
        description: 'empty',
        type: 'measurement',
        check: 'boundingBox',
        expected: {},
      };

      const result: CheckResult = evaluateRequirement(requirement, boxStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      expect(result.check).toBe('invalid');
      expect(result.reason).toContain('requires at least size or center');
    });

    it('should fail when no bounding box in stats', () => {
      const noBboxStats: GeometryStats = {
        ...boxStats,
        boundingBox: undefined,
      };
      const requirement: MeasurementTestRequirement = {
        id: 'bb1',
        description: 'no bbox',
        type: 'measurement',
        check: 'boundingBox',
        expected: { size: { x: 1 } },
      };

      const result: CheckResult = evaluateRequirement(requirement, noBboxStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      expect(result.check).toBe('invalid');
      expect(result.reason).toContain('No bounding box available');
    });
  });

  // ---------------------------------------------------------------------------
  // Connected components
  // ---------------------------------------------------------------------------

  describe('connectedComponents', () => {
    it('should pass for correct count using the default tolerance', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'cc1',
        description: 'single solid',
        type: 'measurement',
        check: 'connectedComponents',
        expected: { count: 1 },
      };

      expect(evaluateRequirement(requirement, boxStats).passed).toBe(true);
    });

    it('should call analyseConnectedComponents with the default tolerance (0.1mm) when omitted', () => {
      const calls: number[] = [];
      const stubStats: GeometryStats = {
        ...boxStats,
        analyseConnectedComponents: (toleranceMm) => {
          calls.push(toleranceMm);
          return boxStats.analyseConnectedComponents(toleranceMm);
        },
      };
      const requirement: MeasurementTestRequirement = {
        id: 'cc_default',
        description: 'default tolerance',
        type: 'measurement',
        check: 'connectedComponents',
        expected: { count: 1 },
      };

      evaluateRequirement(requirement, stubStats);
      expect(calls).toEqual([0.1]);
    });

    it('should forward a custom tolerance through to analyseConnectedComponents', () => {
      const calls: number[] = [];
      const stubStats: GeometryStats = {
        ...boxStats,
        analyseConnectedComponents: (toleranceMm) => {
          calls.push(toleranceMm);
          return boxStats.analyseConnectedComponents(toleranceMm);
        },
      };
      const requirement: MeasurementTestRequirement = {
        id: 'cc_custom',
        description: 'custom tolerance',
        type: 'measurement',
        check: 'connectedComponents',
        expected: { count: 1 },
        tolerance: 50,
      };

      evaluateRequirement(requirement, stubStats);
      expect(calls).toContain(50);
    });

    it('should produce the rich failure suggestion when actual exceeds expected', () => {
      const analysis: ConnectedComponentsResult = {
        count: 3,
        clusters: [
          {
            label: 'A',
            primitives: [{ name: 'big', vertices: 100, aabb: { min: [0, 0, 0], max: [1, 1, 1] } }],
            aabb: { min: [0, 0, 0], max: [1, 1, 1] },
            centroid: [0.5, 0.5, 0.5],
            totalVertices: 100,
          },
          {
            label: 'B',
            primitives: [{ name: 'mid', vertices: 50, aabb: { min: [2, 0, 0], max: [3, 1, 1] } }],
            aabb: { min: [2, 0, 0], max: [3, 1, 1] },
            centroid: [2.5, 0.5, 0.5],
            totalVertices: 50,
          },
          {
            label: 'C',
            primitives: [{ name: 'tiny', vertices: 5, aabb: { min: [5, 0, 0], max: [5.5, 0.5, 0.5] } }],
            aabb: { min: [5, 0, 0], max: [5.5, 0.5, 0.5] },
            centroid: [5.25, 0.25, 0.25],
            totalVertices: 5,
          },
        ],
        gaps: [
          {
            fromLabel: 'A',
            toLabel: 'B',
            axis: 'x',
            gapMm: 1000,
            fromPrimitive: 'big',
            toPrimitive: 'mid',
          },
        ],
      };
      const stubStats: GeometryStats = {
        ...boxStats,
        connectedComponents: () => analysis.count,
        analyseConnectedComponents: () => analysis,
      };
      const requirement: MeasurementTestRequirement = {
        id: 'cc_fail',
        description: 'should be fused',
        type: 'measurement',
        check: 'connectedComponents',
        expected: { count: 1 },
      };

      const result: CheckResult = evaluateRequirement(requirement, stubStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      if (result.check !== 'connectedComponents') {
        throw new Error(`expected connectedComponents, got ${result.check}`);
      }
      expect(result.reason).toContain('expected 1, got 3 (tolerance: 0.1mm)');
      expect(result.reason).toContain('Cluster A');
      expect(result.reason).toContain('Spatial gaps:');
      expect(result.failure.got).toBe(3);
      expect(result.failure.gaps[0]!.axis).toBe('x');
      expect(result.suggestion).toContain('raise tolerance');
      expect(result.suggestion).toContain('raise expected.count to 3');
      expect(result.suggestion).toContain('fuse them in the kernel and assert watertight');
      expect(result.suggestion).toContain('Smallest cluster');
    });

    it('should produce the lower-than-expected failure suggestion when actual is below expected', () => {
      const analysis: ConnectedComponentsResult = {
        count: 1,
        clusters: [
          {
            label: 'A',
            primitives: [{ name: 'only', vertices: 10, aabb: { min: [0, 0, 0], max: [1, 1, 1] } }],
            aabb: { min: [0, 0, 0], max: [1, 1, 1] },
            centroid: [0.5, 0.5, 0.5],
            totalVertices: 10,
          },
        ],
        gaps: [],
      };
      const stubStats: GeometryStats = {
        ...boxStats,
        connectedComponents: () => analysis.count,
        analyseConnectedComponents: () => analysis,
      };
      const requirement: MeasurementTestRequirement = {
        id: 'cc_low',
        description: 'expected too many parts',
        type: 'measurement',
        check: 'connectedComponents',
        expected: { count: 4 },
      };

      const result: CheckResult = evaluateRequirement(requirement, stubStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      if (result.check !== 'connectedComponents') {
        throw new Error(`expected connectedComponents, got ${result.check}`);
      }
      expect(result.suggestion).toContain('lower expected.count to 1');
      expect(result.suggestion).toContain('split the model so it returns 4 top-level shapes');
    });

    it('should fail when expected.count is missing', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'cc1',
        description: 'missing count',
        type: 'measurement',
        check: 'connectedComponents',
        expected: {},
      };

      const result: CheckResult = evaluateRequirement(requirement, boxStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      expect(result.check).toBe('invalid');
      expect(result.reason).toContain('Missing expected.count');
    });
  });

  // ---------------------------------------------------------------------------
  // Watertight
  // ---------------------------------------------------------------------------

  describe('watertight', () => {
    it('should pass for watertight mesh', () => {
      const requirement: MeasurementTestRequirement = {
        id: 'wt1',
        description: 'is watertight',
        type: 'measurement',
        check: 'watertight',
      };

      expect(evaluateRequirement(requirement, boxStats).passed).toBe(true);
    });

    it('should fail for non-watertight mesh and surface the per-part lib/<part>.ts hint', () => {
      const wt: WatertightResult = {
        watertight: false,
        irregularEdges: 12,
        openBoundaryEdges: 10,
        totalEdges: 100,
        irregularEdgeFraction: 0.12,
        perPrimitive: [{ name: 'Shell', boundaryEdges: 10, loopCentroid: [0, 0.1, 0] }],
      };
      const openStats: GeometryStats = {
        ...boxStats,
        watertight: false,
        analyseWatertight: () => wt,
      };
      const requirement: MeasurementTestRequirement = {
        id: 'wt1',
        description: 'is watertight',
        type: 'measurement',
        check: 'watertight',
      };

      const result: CheckResult = evaluateRequirement(requirement, openStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      if (result.check !== 'watertight') {
        throw new Error(`expected watertight, got ${result.check}`);
      }
      expect(result.reason).toContain('not watertight');
      expect(result.failure.perPrimitive[0]!.name).toBe('Shell');
      expect(result.suggestion).toContain('lib/<part>.ts');
      expect(result.suggestion).toContain('multi-part assemblies are watertight per part');
      expect(result.suggestion).toContain('failed boolean ops');
      expect(result.suggestion).toContain('Shell');
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown check type
  // ---------------------------------------------------------------------------

  describe('unknown check type', () => {
    it('should report failure for unrecognised check and list only the surviving 3-check vocabulary', () => {
      const requirement = {
        id: 'u1',
        description: 'unknown',
        type: 'measurement',
        check: 'nonExistent' as 'boundingBox',
      } as const;

      const result: CheckResult = evaluateRequirement(requirement as unknown as MeasurementTestRequirement, boxStats);
      if (result.passed) {
        throw new Error('expected failure');
      }
      expect(result.check).toBe('invalid');
      expect(result.reason).toContain('Unknown check type');
      expect(result.suggestion).toBe('Use one of: boundingBox, connectedComponents, watertight');
    });
  });
});
