// @vitest-environment node
/**
 * Tests for GeometryAnalysisService using real GLB data generated
 * by the replicad kernel via createRuntimeClient + inProcessTransport +
 * fromMemoryFs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { createRuntimeClient } from '@taucad/runtime';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineRuntime } from '@taucad/runtime/worker';
import { replicad } from '@taucad/runtime/kernels';
import { esbuild } from '@taucad/runtime/bundler';
import type { MeasurementTestRequirement } from '@taucad/testing';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';

// =============================================================================
// GLB generation helper
// =============================================================================

async function exportGlb(filename: string, code: string): Promise<Uint8Array<ArrayBuffer>> {
  const filePath = filename.startsWith('/') ? filename : `/${filename}`;
  const runtime = defineRuntime({ kernels: [replicad()], bundlers: [esbuild()] });
  const client = createRuntimeClient({
    transport: inProcessTransport({
      runtime,
      fileSystem: fromMemoryFs({ [filePath]: code }),
    }),
  });

  try {
    const result = await client.export('glb', { source: { path: filePath } });

    if (!result.success) {
      const messages = result.issues.map((issue) => issue.message).join('; ');
      throw new Error(`Export failed: ${messages}`);
    }

    return result.data.bytes;
  } finally {
    client.terminate();
  }
}

// =============================================================================
// Requirement helpers
// =============================================================================

type BoundingBoxExpected = {
  size?: { x?: number; y?: number; z?: number };
  center?: { x?: number; y?: number; z?: number };
};

function boundingBoxRequirement(options: {
  id: string;
  description: string;
  expected: BoundingBoxExpected;
  tolerance?: number;
}): MeasurementTestRequirement {
  return { type: 'measurement', check: 'boundingBox', ...options };
}

function connectedComponentsRequirement(options: {
  id: string;
  description: string;
  count: number;
  tolerance?: number;
}): MeasurementTestRequirement {
  const { count, ...rest } = options;
  return { ...rest, type: 'measurement', check: 'connectedComponents', expected: { count } };
}

// =============================================================================
// Test data: replicad code snippets
// =============================================================================

const boxCode = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    return makeBaseBox(10, 20, 30);
  }
`;

// Two ShapeConfig parts whose AABBs are far apart (sphere lifted 50mm above
// the box). Each ShapeConfig becomes a distinct glTF primitive, so the
// per-primitive AABB clustering reports 2 disjoint chunks at default
// tolerance.
const multiShapeCode = `
  import { makeBaseBox, makeSphere } from 'replicad';
  export default function main() {
    const box = makeBaseBox(10, 20, 30);
    const sphere = makeSphere(5).translateZ(50);
    return [{ shape: box, name: 'box' }, { shape: sphere, name: 'sphere' }];
  }
`;

// Two ShapeConfig boxes 40mm apart (gap between AABBs = 40mm). Two distinct
// glTF primitives → 2 components at default tolerance, 1 at tolerance: 50.
const farApartMultiShapeCode = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    const box1 = makeBaseBox(10, 10, 10);
    const box2 = makeBaseBox(10, 10, 10).translate(50, 0, 0);
    return [{ shape: box1, name: 'A' }, { shape: box2, name: 'B' }];
  }
`;

// Helicopter regression repro from docs/research/mesh-continuity-test-semantics.md
// §Problem Statement: two ShapeConfig boxes that share a face (touching at
// x=5mm). Two glTF primitives whose AABBs touch at the boundary →
// connectedComponents → 1 at the default tolerance.
const touchingMultiShapeCode = `
  import { makeBaseBox } from 'replicad';
  export default function main() {
    const a = makeBaseBox(10, 10, 10);
    const b = makeBaseBox(10, 10, 10).translateX(10);
    return [{ shape: a, name: 'A' }, { shape: b, name: 'B' }];
  }
`;

const fusedCode = `
  import { makeBaseBox, makeSphere } from 'replicad';
  export default function main() {
    const box = makeBaseBox(20, 20, 20);
    const sphere = makeSphere(12);
    return box.fuse(sphere);
  }
`;

// =============================================================================
// Tests
// =============================================================================

describe('GeometryAnalysisService', () => {
  let service: GeometryAnalysisService;
  let module: TestingModule;

  // Pre-render GLBs once for all tests (expensive WASM init)
  let boxGlb: Uint8Array<ArrayBuffer>;
  let multiShapeGlb: Uint8Array<ArrayBuffer>;
  let farApartMultiShapeGlb: Uint8Array<ArrayBuffer>;
  let touchingMultiShapeGlb: Uint8Array<ArrayBuffer>;
  let fusedGlb: Uint8Array<ArrayBuffer>;

  // Test wrapper: defaults targetFile to 'test.ts' so existing assertions stay focused
  // on requirement evaluation. Per-targetFile fan-out is covered by tool-test-model.test.ts.
  const runTests = async (
    glb: Uint8Array<ArrayBuffer>,
    requirements: MeasurementTestRequirement[],
    targetFile = 'test.ts',
  ) => service.runMeasurementTests(glb, requirements, targetFile);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [GeometryAnalysisService],
    }).compile();

    service = moduleRef.get<GeometryAnalysisService>(GeometryAnalysisService);
    module = moduleRef;

    // Render all GLBs in parallel
    [boxGlb, multiShapeGlb, farApartMultiShapeGlb, touchingMultiShapeGlb, fusedGlb] = await Promise.all([
      exportGlb('box.ts', boxCode),
      exportGlb('multi.ts', multiShapeCode),
      exportGlb('far-apart.ts', farApartMultiShapeCode),
      exportGlb('touching.ts', touchingMultiShapeCode),
      exportGlb('fused.ts', fusedCode),
    ]);
  }, 120_000);

  afterAll(async () => {
    await module.close();
  });

  // ---------------------------------------------------------------------------
  // AnalyzeGlb / buffer alignment
  // ---------------------------------------------------------------------------

  describe('buffer alignment', () => {
    it('should handle GLB with byteOffset === 0', async () => {
      const result = await runTests(boxGlb, [
        connectedComponentsRequirement({ id: 'm1', description: 'single solid', count: 1 }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should handle GLB with misaligned byteOffset (simulated Socket.IO buffer)', async () => {
      // Simulate a Node.js Buffer from the pool with a non-4-byte-aligned offset.
      // This reproduces the exact bug that occurs when GLB data arrives via Socket.IO.
      const padded = new ArrayBuffer(boxGlb.byteLength + 3);
      const misaligned = new Uint8Array(padded, 3); // ByteOffset = 3 (not divisible by 4)
      misaligned.set(boxGlb);

      const result = await runTests(misaligned, [
        connectedComponentsRequirement({ id: 'm1', description: 'single solid', count: 1 }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Bounding box checks
  // ---------------------------------------------------------------------------

  describe('bounding box', () => {
    it('should pass for a box with correct dimensions', async () => {
      // MakeBaseBox(10, 20, 30) → glTF uses meters, so 0.01 × 0.02 × 0.03 m
      const result = await runTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb1',
          description: 'box size',
          expected: { size: { x: 0.01, y: 0.03, z: 0.02 } },
        }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should fail for a box with wrong dimensions', async () => {
      const result = await runTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb1',
          description: 'wrong size',
          expected: { size: { x: 99, y: 99, z: 99 } },
        }),
      ]);

      expect(result.passed).toBe(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.reason).toContain('Bounding box mismatch');
    });

    it('should validate center position', async () => {
      // Centered box → center at origin in glTF coordinates
      const result = await runTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb1',
          description: 'centered at origin',
          expected: { center: { x: 0, y: 0.015, z: 0 } },
        }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should respect custom tolerance', async () => {
      const result = await runTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb1',
          description: 'loose tolerance',
          expected: { size: { x: 0.011, y: 0.021, z: 0.031 } },
          tolerance: 0.01,
        }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should accept a single axis in size (partial check)', async () => {
      const result = await runTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb_x_only',
          description: 'check X size only',
          expected: { size: { x: 0.01 } },
        }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should accept two axes in center (partial check)', async () => {
      // Box center in raw runtime glTF: x=0, y=0, z=0.015 — check only x and z
      const result = await runTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb_xz_center',
          description: 'check X and Z center only',
          expected: { center: { x: 0, z: 0.015 } },
          tolerance: 0.01,
        }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should fail only the checked axis when partial size is wrong', async () => {
      const result = await runTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb_z_wrong',
          description: 'wrong Z size',
          expected: { size: { z: 999 } },
        }),
      ]);

      expect(result.passed).toBe(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.reason).toContain('size.z');
      expect(result.failures[0]!.reason).not.toContain('size.x');
      expect(result.failures[0]!.reason).not.toContain('size.y');
    });

    it('should fail when expected has no size or center fields', async () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb1',
        description: 'no size or center',
        type: 'measurement',
        check: 'boundingBox',
        expected: { notValid: true },
      };

      const result = await runTests(boxGlb, [requirement]);

      expect(result.passed).toBe(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.reason).toContain('requires at least size or center');
    });

    it('should fail when expected is an empty object', async () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb_empty',
        description: 'empty expected',
        type: 'measurement',
        check: 'boundingBox',
        expected: {},
      };

      const result = await runTests(boxGlb, [requirement]);

      expect(result.passed).toBe(0);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.reason).toContain('requires at least size or center');
    });
  });

  // ---------------------------------------------------------------------------
  // Connected components checks
  // ---------------------------------------------------------------------------

  describe('connected components', () => {
    it('should report 1 component for a single solid box', async () => {
      const result = await runTests(boxGlb, [
        connectedComponentsRequirement({ id: 'cc1', description: 'single solid', count: 1 }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should report 2 components for two far-apart ShapeConfig boxes at default tolerance', async () => {
      const result = await runTests(farApartMultiShapeGlb, [
        connectedComponentsRequirement({ id: 'cc1', description: 'two disjoint chunks', count: 2 }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should collapse two far-apart boxes into 1 component when tolerance covers the gap', async () => {
      const result = await runTests(farApartMultiShapeGlb, [
        connectedComponentsRequirement({
          id: 'cc1',
          description: 'tolerance covers the gap',
          count: 1,
          tolerance: 50,
        }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should pass connectedComponents:1 for the helicopter ShapeConfig regression repro (touching parts)', async () => {
      // SMOKING GUN — research §Problem Statement F1+F8:
      // multi-ShapeConfig with touching faces previously reported 2 (vertex
      // welding never happened across primitives). Under AABB clustering
      // their AABBs touch → 1 at default tolerance.
      const result = await runTests(touchingMultiShapeGlb, [
        connectedComponentsRequirement({ id: 'cc1', description: 'touching parts collapse to one chunk', count: 1 }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should produce the rich tolerance-aware failure suggestion when actual exceeds expected', async () => {
      const result = await runTests(farApartMultiShapeGlb, [
        connectedComponentsRequirement({ id: 'cc1', description: 'should be one solid', count: 1 }),
      ]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Connected components');
      expect(result.failures[0]!.reason).toContain('expected 1, got 2 (tolerance: 0.1mm)');
      expect(result.failures[0]!.suggestion).toContain('raise tolerance');
      expect(result.failures[0]!.suggestion).toContain('raise expected.count to 2');
      expect(result.failures[0]!.suggestion).toContain('fuse them in the kernel and assert watertight');
      const structuredFailure = result.failures[0]!.failure;
      expect(structuredFailure?.check).toBe('connectedComponents');
      if (structuredFailure?.check !== 'connectedComponents') {
        throw new Error('expected connectedComponents structured failure');
      }
      expect(structuredFailure.got).toBe(2);
      expect(structuredFailure.clusters.length).toBeGreaterThanOrEqual(2);
    });

    it('should report 1 component for overlapping fused shapes', async () => {
      const result = await runTests(fusedGlb, [
        connectedComponentsRequirement({ id: 'cc1', description: 'fused solid', count: 1 }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should count components across multiple meshes', async () => {
      // MultiShapeGlb has 2 separate shapes (box + sphere) as 2 meshes, each is 1 component
      const result = await runTests(multiShapeGlb, [
        connectedComponentsRequirement({ id: 'cc1', description: 'two separate shapes', count: 2 }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should fail when expected.count is missing', async () => {
      const requirement: MeasurementTestRequirement = {
        id: 'cc1',
        description: 'missing count',
        type: 'measurement',
        check: 'connectedComponents',
        expected: {},
      };

      const result = await runTests(boxGlb, [requirement]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Missing expected.count');
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple requirements
  // ---------------------------------------------------------------------------

  describe('multiple requirements', () => {
    it('should evaluate all requirements and report mixed results', async () => {
      const result = await runTests(boxGlb, [
        connectedComponentsRequirement({ id: 'pass1', description: 'single solid', count: 1 }),
        connectedComponentsRequirement({ id: 'fail1', description: 'wrong component count', count: 99 }),
        boundingBoxRequirement({
          id: 'pass2',
          description: 'approx size',
          expected: { size: { x: 0.01, y: 0.03, z: 0.02 } },
        }),
      ]);

      expect(result.total).toBe(3);
      expect(result.passed).toBe(2);
      expect(result.passes).toHaveLength(2);
      expect(result.failures).toHaveLength(1);
      expect(result.failures[0]!.id).toBe('fail1');
    });
  });

  // ---------------------------------------------------------------------------
  // Invalid GLB
  // ---------------------------------------------------------------------------

  describe('invalid GLB', () => {
    it('should return failures for all requirements when GLB is invalid', async () => {
      const garbage = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);

      const result = await runTests(garbage, [
        connectedComponentsRequirement({ id: 'cc1', description: 'single solid', count: 1 }),
        boundingBoxRequirement({ id: 'bb1', description: 'box', expected: { size: { x: 1, y: 1, z: 1 } } }),
      ]);

      expect(result.passed).toBe(0);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0]!.reason).toContain('GLB analysis failed');
      expect(result.failures[0]!.suggestion).toContain('valid geometry');
    });

    it('should return failures for empty Uint8Array', async () => {
      const result = await runTests(new Uint8Array(0), [
        connectedComponentsRequirement({ id: 'cc1', description: 'single solid', count: 1 }),
      ]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('GLB analysis failed');
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown check type
  // ---------------------------------------------------------------------------

  describe('unknown check type', () => {
    it('should report failure for unrecognised check type', async () => {
      const requirement = {
        id: 'u1',
        description: 'unknown',
        type: 'measurement',
        check: 'nonExistent' as 'boundingBox',
        expected: {},
      } as const;

      const result = await runTests(boxGlb, [requirement]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Unknown check type');
    });
  });
});
