// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createGeometryRenderer,
  renderCodeToGlb,
  gradeGeometry,
  validateGeometry,
} from '#benchmarks/model-benchmark-geometry.js';
import type { BenchmarkGeometryExpectation, GeometryRendererClient } from '#benchmarks/model-benchmark-geometry.js';

// =============================================================================
// Test fixtures
// =============================================================================

const mainFile = 'main.scad';

const boxCode = 'cube([10, 20, 30]);';

const syntaxErrorCode = 'cube([10, 20,';

const runtimeErrorCode = 'nonexistent_module();';

// =============================================================================
// Tests
// =============================================================================

describe('model-benchmark-geometry', () => {
  let client: GeometryRendererClient;
  let boxGlb: Uint8Array<ArrayBuffer>;

  beforeAll(async () => {
    client = createGeometryRenderer();
    const result = await renderCodeToGlb(client, { [mainFile]: boxCode }, mainFile);
    if (!result.success) {
      throw new Error(`Failed to render box fixture: ${result.error}`);
    }
    boxGlb = result.glb;
  }, 120_000);

  afterAll(() => {
    client.terminate();
  });

  // ===========================================================================
  // renderCodeToGlb
  // ===========================================================================

  describe('renderCodeToGlb', () => {
    it('should produce valid GLB from correct OpenSCAD code', () => {
      expect(boxGlb).toBeInstanceOf(Uint8Array);
      expect(boxGlb.length).toBeGreaterThan(0);

      const header = new TextDecoder().decode(boxGlb.slice(0, 4));
      expect(header).toBe('glTF');
    });

    it('should return error result when code has syntax errors', async () => {
      const result = await renderCodeToGlb(client, { [mainFile]: syntaxErrorCode }, mainFile);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
        expect(typeof result.error).toBe('string');
      }
    });

    it('should return error result when code references unknown modules', async () => {
      const result = await renderCodeToGlb(client, { [mainFile]: runtimeErrorCode }, mainFile);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeTruthy();
      }
    });
  });

  // ===========================================================================
  // gradeGeometry
  // ===========================================================================

  describe('gradeGeometry', () => {
    it('should pass all checks when geometry matches expectations', async () => {
      const expectations: BenchmarkGeometryExpectation = {
        boundingBox: { size: { x: 10, y: 20, z: 30 } },
        connectedComponents: 1,
      };

      const { checks } = await gradeGeometry(boxGlb, expectations);

      expect(checks.length).toBeGreaterThan(0);
      expect(checks.every((c) => c.passed)).toBe(true);
    });

    it('should fail bounding box check when dimensions are wrong', async () => {
      const expectations: BenchmarkGeometryExpectation = {
        boundingBox: { size: { x: 99, y: 99, z: 99 } },
        tolerance: 1,
      };

      const { checks } = await gradeGeometry(boxGlb, expectations);

      const bboxCheck = checks.find((c) => c.name === 'geometry_bbox');
      expect(bboxCheck).toBeDefined();
      expect(bboxCheck!.passed).toBe(false);
      expect(bboxCheck!.detail).toBeTruthy();
    });

    it('should fail connected components check when topology differs', async () => {
      const expectations: BenchmarkGeometryExpectation = {
        connectedComponents: 5,
      };

      const { checks } = await gradeGeometry(boxGlb, expectations);

      const ccCheck = checks.find((c) => c.name === 'geometry_connected_components');
      expect(ccCheck).toBeDefined();
      expect(ccCheck!.passed).toBe(false);
      expect(ccCheck!.detail).toBeTruthy();
    });

    it('should use custom tolerance when specified', async () => {
      const tightExpectations: BenchmarkGeometryExpectation = {
        boundingBox: { size: { x: 10.5, y: 20.5, z: 30.5 } },
        tolerance: 0.01,
      };

      const { checks: tightChecks } = await gradeGeometry(boxGlb, tightExpectations);
      const tightBbox = tightChecks.find((c) => c.name === 'geometry_bbox');
      expect(tightBbox?.passed).toBe(false);

      const looseExpectations: BenchmarkGeometryExpectation = {
        boundingBox: { size: { x: 10.5, y: 20.5, z: 30.5 } },
        tolerance: 1,
      };

      const { checks: looseChecks } = await gradeGeometry(boxGlb, looseExpectations);
      const looseBbox = looseChecks.find((c) => c.name === 'geometry_bbox');
      expect(looseBbox?.passed).toBe(true);
    });
  });

  // ===========================================================================
  // validateGeometry
  // ===========================================================================

  describe('validateGeometry', () => {
    it('should return render failure checks when code cannot compile', async () => {
      const expectations: BenchmarkGeometryExpectation = { connectedComponents: 1 };
      const result = await validateGeometry({ client, files: { [mainFile]: syntaxErrorCode }, mainFile, expectations });

      expect(result.rendered).toBe(true);
      expect(result.renderSuccess).toBe(false);
      expect(result.renderError).toBeTruthy();
      expect(result.checks).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'geometry_render', passed: false })]),
      );
    });

    it('should return geometry checks when rendering succeeds', async () => {
      const expectations: BenchmarkGeometryExpectation = {
        boundingBox: { size: { x: 10, y: 20, z: 30 } },
        connectedComponents: 1,
      };
      const result = await validateGeometry({ client, files: { [mainFile]: boxCode }, mainFile, expectations });

      expect(result.rendered).toBe(true);
      expect(result.renderSuccess).toBe(true);
      expect(result.glb).toBeInstanceOf(Uint8Array);
      expect(result.checks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'geometry_render', passed: true }),
          expect.objectContaining({ name: 'geometry_bbox', passed: true }),
          expect.objectContaining({ name: 'geometry_connected_components', passed: true }),
        ]),
      );
    });
  });
});
