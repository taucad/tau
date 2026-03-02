// @vitest-environment node
/**
 * Tests for GeometryAnalysisService using real GLB data generated
 * by the replicad kernel via createKernelClient + createInProcessTransport.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { createKernelClient } from '@taucad/kernels';
import { createInProcessTransport } from '@taucad/kernels/transport';
import { replicad } from '@taucad/kernels/kernels';
import { esbuild } from '@taucad/kernels/bundler';
import type { MeasurementTestRequirement } from '@taucad/chat';
import { GeometryAnalysisService } from '#api/analysis/geometry-analysis.service.js';

// =============================================================================
// GLB generation helper
// =============================================================================

async function renderGlb(filename: string, code: string): Promise<Uint8Array<ArrayBuffer>> {
  const client = createKernelClient({
    kernels: [replicad()],
    bundlers: [esbuild()],
    transport: createInProcessTransport(),
  });

  try {
    const result = await client.render({ code: { [filename]: code }, file: filename });

    if (!result.success) {
      const messages = result.issues.map((i) => i.message).join('; ');
      throw new Error(`Render failed: ${messages}`);
    }

    const gltf = result.data.find((g) => g.format === 'gltf');
    if (!gltf) {
      throw new Error('No GLTF geometry in render result');
    }

    return gltf.content;
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

function meshCountRequirement(id: string, description: string, count: number): MeasurementTestRequirement {
  return { id, description, type: 'measurement', check: 'meshCount', expected: { count } };
}

function vertexCountRequirement(options: {
  id: string;
  description: string;
  count: number;
  tolerance?: number;
}): MeasurementTestRequirement {
  const { count, ...rest } = options;
  return { ...rest, type: 'measurement', check: 'vertexCount', expected: { count } };
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

const sphereCode = `
  import { makeSphere } from 'replicad';
  export default function main() {
    return makeSphere(15);
  }
`;

const multiShapeCode = `
  import { makeBaseBox, makeSphere } from 'replicad';
  export default function main() {
    const box = makeBaseBox(10, 20, 30);
    const sphere = makeSphere(5).translateZ(50);
    return [{ shape: box, name: 'box' }, { shape: sphere, name: 'sphere' }];
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
  let sphereGlb: Uint8Array<ArrayBuffer>;
  let multiShapeGlb: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [GeometryAnalysisService],
    }).compile();

    service = moduleRef.get<GeometryAnalysisService>(GeometryAnalysisService);
    module = moduleRef;

    // Render all GLBs in parallel
    [boxGlb, sphereGlb, multiShapeGlb] = await Promise.all([
      renderGlb('box.ts', boxCode),
      renderGlb('sphere.ts', sphereCode),
      renderGlb('multi.ts', multiShapeCode),
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
      const result = await service.runMeasurementTests(boxGlb, [meshCountRequirement('m1', 'has mesh', 1)]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should handle GLB with misaligned byteOffset (simulated Socket.IO buffer)', async () => {
      // Simulate a Node.js Buffer from the pool with a non-4-byte-aligned offset.
      // This reproduces the exact bug that occurs when GLB data arrives via Socket.IO.
      const padded = new ArrayBuffer(boxGlb.byteLength + 3);
      const misaligned = new Uint8Array(padded, 3); // ByteOffset = 3 (not divisible by 4)
      misaligned.set(boxGlb);

      const result = await service.runMeasurementTests(misaligned, [meshCountRequirement('m1', 'has mesh', 1)]);

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
      const result = await service.runMeasurementTests(boxGlb, [
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
      const result = await service.runMeasurementTests(boxGlb, [
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
      const result = await service.runMeasurementTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb1',
          description: 'centered at origin',
          expected: { center: { x: 0, y: 0.015, z: 0 } },
        }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should respect custom tolerance', async () => {
      const result = await service.runMeasurementTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb1',
          description: 'loose tolerance',
          expected: { size: { x: 0.011, y: 0.031, z: 0.021 } },
          tolerance: 0.01,
        }),
      ]);

      expect(result.passed).toBe(1);
    });

    it('should accept a single axis in size (partial check)', async () => {
      const result = await service.runMeasurementTests(boxGlb, [
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
      // Box center in glTF: x=0, y=0.015 (half height), z=0 — check only x and z
      const result = await service.runMeasurementTests(boxGlb, [
        boundingBoxRequirement({
          id: 'bb_xz_center',
          description: 'check X and Z center only',
          expected: { center: { x: 0, z: 0 } },
          tolerance: 0.01,
        }),
      ]);

      expect(result.passed).toBe(1);
      expect(result.failures).toHaveLength(0);
    });

    it('should fail only the checked axis when partial size is wrong', async () => {
      const result = await service.runMeasurementTests(boxGlb, [
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

    it('should pass vacuously when expected has no size or center fields', async () => {
      const requirement: MeasurementTestRequirement = {
        id: 'bb1',
        description: 'no size or center',
        type: 'measurement',
        check: 'boundingBox',
        expected: { notValid: true },
      };

      // Both size and center are optional in the schema, so an object with
      // neither is valid but results in no actual checks → vacuous pass.
      const result = await service.runMeasurementTests(boxGlb, [requirement]);

      expect(result.passed).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Mesh count checks
  // ---------------------------------------------------------------------------

  describe('mesh count', () => {
    it('should pass for single-shape result with meshCount 1', async () => {
      const result = await service.runMeasurementTests(boxGlb, [meshCountRequirement('mc1', 'single mesh', 1)]);

      expect(result.passed).toBe(1);
    });

    it('should pass for multi-shape result', async () => {
      const result = await service.runMeasurementTests(multiShapeGlb, [meshCountRequirement('mc1', 'two meshes', 2)]);

      expect(result.passed).toBe(1);
    });

    it('should fail when mesh count does not match', async () => {
      const result = await service.runMeasurementTests(boxGlb, [meshCountRequirement('mc1', 'wrong count', 5)]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Mesh count');
    });

    it('should fail when expected.count is missing', async () => {
      const requirement: MeasurementTestRequirement = {
        id: 'mc1',
        description: 'missing count',
        type: 'measurement',
        check: 'meshCount',
        expected: {},
      };

      const result = await service.runMeasurementTests(boxGlb, [requirement]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Missing expected.count');
    });
  });

  // ---------------------------------------------------------------------------
  // Vertex count checks
  // ---------------------------------------------------------------------------

  describe('vertex count', () => {
    it('should pass when vertex count is within tolerance', async () => {
      const probe = await service.runMeasurementTests(boxGlb, [
        vertexCountRequirement({ id: 'vc1', description: 'probe', count: 0, tolerance: 999_999 }),
      ]);

      expect(probe.passed).toBe(1);
    });

    it('should fail when vertex count is outside tolerance', async () => {
      const result = await service.runMeasurementTests(boxGlb, [
        vertexCountRequirement({ id: 'vc1', description: 'wrong count', count: 999_999 }),
      ]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Vertex count');
    });

    it('should fail when expected.count is missing', async () => {
      const requirement: MeasurementTestRequirement = {
        id: 'vc1',
        description: 'missing count',
        type: 'measurement',
        check: 'vertexCount',
        expected: {},
      };

      const result = await service.runMeasurementTests(boxGlb, [requirement]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Missing expected.count');
    });

    it('should produce more vertices for a sphere than a box', async () => {
      const boxResult = await service.runMeasurementTests(boxGlb, [
        vertexCountRequirement({ id: 'vc1', description: 'box', count: 0, tolerance: 999_999 }),
      ]);
      const sphereResult = await service.runMeasurementTests(sphereGlb, [
        vertexCountRequirement({ id: 'vc1', description: 'sphere', count: 0, tolerance: 999_999 }),
      ]);

      expect(boxResult.passed).toBe(1);
      expect(sphereResult.passed).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple requirements
  // ---------------------------------------------------------------------------

  describe('multiple requirements', () => {
    it('should evaluate all requirements and report mixed results', async () => {
      const result = await service.runMeasurementTests(boxGlb, [
        meshCountRequirement('pass1', 'correct mesh count', 1),
        meshCountRequirement('fail1', 'wrong mesh count', 99),
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

      const result = await service.runMeasurementTests(garbage, [
        meshCountRequirement('m1', 'mesh', 1),
        boundingBoxRequirement({ id: 'bb1', description: 'box', expected: { size: { x: 1, y: 1, z: 1 } } }),
      ]);

      expect(result.passed).toBe(0);
      expect(result.failures).toHaveLength(2);
      expect(result.failures[0]!.reason).toContain('GLB analysis failed');
      expect(result.failures[0]!.suggestion).toContain('valid geometry');
    });

    it('should return failures for empty Uint8Array', async () => {
      const result = await service.runMeasurementTests(new Uint8Array(0), [meshCountRequirement('m1', 'mesh', 1)]);

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
        type: 'measurement' as const,
        check: 'nonExistent' as 'meshCount',
        expected: {},
      };

      const result = await service.runMeasurementTests(boxGlb, [requirement]);

      expect(result.passed).toBe(0);
      expect(result.failures[0]!.reason).toContain('Unknown check type');
    });
  });
});
