/**
 * Kernel Geometry Testing Utilities
 *
 * Provides helpers for validating GLTF geometry output from kernel workers.
 * Adapted from libs/converter/src/test.utils.ts and gltf.utils.ts patterns.
 */

import type { Document } from '@gltf-transform/core';
import { NodeIO } from '@gltf-transform/core';
import type { InspectReport } from '@gltf-transform/functions';
import { inspect } from '@gltf-transform/functions';
import type { PartialDeep } from 'type-fest';
import { expect } from 'vitest';
import type { GeometryResponse } from '@taucad/types';
import type { ExportResult } from '#client/runtime-client.js';
import type { CreateGeometryResult, HashedGeometryResult } from '#types/runtime.types.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Expected geometry properties for test assertions.
 * @public
 */
export type GeometryExpectation = {
  /** Total number of vertices across all meshes */
  vertexCount: number;
  /** Total number of faces (triangles) across all meshes */
  faceCount: number;
  /** Number of meshes in the geometry */
  meshCount: number;
  /** Bounding box dimensions and position */
  boundingBox: {
    /** Size in [x, y, z] dimensions */
    size: [number, number, number];
    /** Center position in [x, y, z] */
    center: [number, number, number];
    /** Tolerance for floating-point comparison (default: 0.1) */
    tolerance?: number;
  };
};

// =============================================================================
// GLTF Document Utilities
// =============================================================================

/**
 * Create a NodeIO instance for gltf-transform operations.
 *
 * @returns a new NodeIO instance
 */
const createNodeIo = (): NodeIO => {
  return new NodeIO();
};

/**
 * Convert GLB/GLTF data to gltf-transform Document.
 *
 * @param glbData - the GLB binary content to parse
 * @returns the parsed glTF document
 */
const glbToDocument = async (glbData: Uint8Array<ArrayBuffer>): Promise<Document> => {
  const io = createNodeIo();
  return io.readBinary(glbData);
};

/**
 * Generates a gltf-transform inspect report from GLB binary data.
 *
 * @param glbData - The GLB binary content to inspect
 * @returns The inspection report with mesh, scene, and material details
 * @public
 */
export const getInspectReport = async (glbData: Uint8Array<ArrayBuffer>): Promise<InspectReport> => {
  const document = await glbToDocument(glbData);
  return inspect(document);
};

/**
 * Validates that GLB data has proper format (non-empty with correct header).
 *
 * @param glb - The GLB binary content to validate
 * @throws Error if the data is empty or has an invalid header
 * @public
 */
export const validateGlbData = (glb: Uint8Array<ArrayBuffer>): void => {
  if (glb.length === 0) {
    throw new Error('GLB data cannot be empty');
  }

  // Basic GLB header validation (first 4 bytes should be 'glTF')
  if (glb.length >= 4) {
    const header = new TextDecoder().decode(glb.slice(0, 4));
    if (header !== 'glTF') {
      throw new Error('Invalid GLB header - expected "glTF"');
    }
  }
};

// =============================================================================
// Inspect Report Analysis
// =============================================================================

/**
 * Extracts vertex, face, and mesh counts from an InspectReport.
 *
 * @param report - The gltf-transform inspection report
 * @returns Aggregated geometry statistics across all meshes
 * @public
 */
export const getGeometryStatsFromInspect = (
  report: InspectReport,
): {
  vertexCount: number;
  faceCount: number;
  meshCount: number;
} => {
  const totalVertices = report.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
  const totalFaces = Math.round(totalVertices / 3); // Assuming triangulation
  const meshCount = report.meshes.properties.length;

  return { vertexCount: totalVertices, faceCount: totalFaces, meshCount };
};

/**
 * Extracts bounding box size and center from an InspectReport.
 *
 * @param report - The gltf-transform inspection report
 * @returns The bounding box dimensions and center, or `undefined` if no scenes exist
 * @public
 */
export const getBoundingBoxFromInspect = (
  report: InspectReport,
):
  | {
      size: [number, number, number];
      center: [number, number, number];
    }
  | undefined => {
  if (report.scenes.properties.length === 0) {
    return undefined;
  }

  const scene = report.scenes.properties[0]!;

  if (scene.bboxMax.length < 3 || scene.bboxMin.length < 3) {
    return undefined;
  }

  const size: [number, number, number] = [
    scene.bboxMax[0]! - scene.bboxMin[0]!,
    scene.bboxMax[1]! - scene.bboxMin[1]!,
    scene.bboxMax[2]! - scene.bboxMin[2]!,
  ];

  const center: [number, number, number] = [
    (scene.bboxMax[0]! + scene.bboxMin[0]!) / 2,
    (scene.bboxMax[1]! + scene.bboxMin[1]!) / 2,
    (scene.bboxMax[2]! + scene.bboxMin[2]!) / 2,
  ];

  return { size, center };
};

// =============================================================================
// Result Extraction
// =============================================================================

/**
 * Type guard to check if a geometry response is GLTF format.
 *
 * @param response - the geometry response to check
 * @returns whether the response contains GLTF format data
 */
function isGltfResponse(response: GeometryResponse): response is { format: 'gltf'; content: Uint8Array<ArrayBuffer> } {
  return response.format === 'gltf';
}

/**
 * Extracts GLTF content from a CreateGeometryResult.
 *
 * Used at the kernel level (when calling `kernel.createGeometry(...)` directly
 * via the kernel-worker testing harness). For client-level tests using
 * `client.export('glb', ...)`, prefer {@link extractGltfFromExportResult}
 * which validates the exact-one GLB contract.
 *
 * @param result - The geometry result to extract from
 * @returns The GLB binary content, or `undefined` if the render geometry is not GLTF
 * @public
 */
export function extractGltfFromResult(result: CreateGeometryResult): Uint8Array<ArrayBuffer> | undefined {
  if (!result.success || result.data === undefined) {
    return undefined;
  }

  return isGltfResponse(result.data) ? result.data.content : undefined;
}

/**
 * Extracts the GLB bytes from an `ExportResult` returned by `client.export('glb', ...)`.
 *
 * Returns `undefined` for a failed export and throws when a successful export
 * violates the format-specific exact-one GLB contract.
 *
 * @param result - The export result returned from `client.export('glb', ...)`
 * @returns The GLB binary content, or `undefined` if the export failed
 * @public
 *
 * @example <caption>Asserting a glTF/GLB export at the client level</caption>
 * ```typescript
 * import type { ExportResult } from '@taucad/runtime';
 * import { extractGltfFromExportResult } from '@taucad/runtime/testing';
 *
 * declare const client: {
 *   export: (
 *     format: 'glb',
 *     input: { source: { files: { '/main.ts': string } } },
 *   ) => Promise<ExportResult>;
 * };
 * declare const expect: (value: unknown) => { toBeInstanceOf: (ctor: unknown) => void };
 * declare const source: string;
 *
 * const result = await client.export('glb', { source: { files: { '/main.ts': source } } });
 * const glb = extractGltfFromExportResult(result);
 * expect(glb).toBeInstanceOf(Uint8Array);
 * ```
 */
export function extractGltfFromExportResult(result: ExportResult): Uint8Array<ArrayBuffer> | undefined {
  if (!result.success) {
    return undefined;
  }
  const names = result.data.map(({ name }) => name);
  if (result.data.length !== 1) {
    throw new Error(
      `GLB export expected exactly 1 artifact, received ${result.data.length}: ${names.join(', ') || '(none)'}`,
    );
  }
  const file = result.data[0]!;
  if (!file.name.toLowerCase().endsWith('.glb') || file.mimeType !== 'model/gltf-binary') {
    throw new Error(`GLB export returned ${file.name} (${file.mimeType}); expected one .glb (model/gltf-binary)`);
  }
  return file.bytes;
}

// =============================================================================
// Geometry Variant Factory
// =============================================================================

/**
 * Creates a geometry expectation variant by deep-merging overrides onto a base.
 *
 * @param base - The base expectation to clone
 * @param overrides - Partial overrides for vertex/face counts or bounding box
 * @returns A new expectation with the overrides applied
 * @public
 */
export const createGeometryVariant = (
  base: GeometryExpectation,
  overrides: PartialDeep<GeometryExpectation>,
): GeometryExpectation => ({
  ...base,
  ...overrides,
  boundingBox: {
    ...base.boundingBox,
    ...overrides.boundingBox,
  },
});

// =============================================================================
// Test Helpers Factory
// =============================================================================

const defaultTolerance = 0.1;

/**
 * Helper to compare two 3D vectors with tolerance.
 */
const expectVector3ToBeCloseTo = ({
  actual,
  expected,
  subject,
  tolerance,
}: {
  actual: [number, number, number];
  expected: [number, number, number];
  subject: string;
  tolerance: number;
}): void => {
  expect(
    Math.abs(actual[0] - expected[0]),
    `${subject}: Expected [X: ${expected[0]}]. Actual [X: ${actual[0]}]`,
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs(actual[1] - expected[1]),
    `${subject}: Expected [Y: ${expected[1]}]. Actual [Y: ${actual[1]}]`,
  ).toBeLessThanOrEqual(tolerance);
  expect(
    Math.abs(actual[2] - expected[2]),
    `${subject}: Expected [Z: ${expected[2]}]. Actual [Z: ${actual[2]}]`,
  ).toBeLessThanOrEqual(tolerance);
};

/**
 * Create geometry test helpers for asserting on HashedGeometryResult.
 *
 * @returns An object of assertion helpers for validating geometry results
 *
 * @public
 *
 * @example <caption>Asserting kernel-worker geometry results in tests</caption>
 * ```typescript
 * import { createGeometryTestHelpers, createTestWorker, createGeometryFile } from '@taucad/runtime/testing';
 *
 * declare const myKernel: Parameters<typeof createTestWorker>[0];
 * declare const modelSource: string;
 *
 * const helpers = createGeometryTestHelpers();
 * const worker = await createTestWorker(myKernel, { 'main.ts': modelSource });
 * const result = await worker.createGeometry({
 *   file: createGeometryFile('main.ts'),
 *   parameters: {},
 * });
 * await helpers.expectMeshCount(result, 1);
 * ```
 */
export function createGeometryTestHelpers(): {
  /**
   * Assert that the result contains valid GLTF data.
   */
  expectValidGltf: (result: HashedGeometryResult) => Promise<void>;

  /**
   * Assert the total vertex count across all meshes.
   */
  expectVertexCount: (result: HashedGeometryResult, expectedCount: number) => Promise<void>;

  /**
   * Assert the total face count across all meshes.
   */
  expectFaceCount: (result: HashedGeometryResult, expectedCount: number) => Promise<void>;

  /**
   * Assert the number of meshes in the geometry.
   */
  expectMeshCount: (result: HashedGeometryResult, expectedCount: number) => Promise<void>;

  /**
   * Assert the bounding box size with optional tolerance.
   */
  expectBoundingBoxSize: (
    result: HashedGeometryResult,
    expectedSize: [number, number, number],
    tolerance?: number,
  ) => Promise<void>;

  /**
   * Assert the bounding box center with optional tolerance.
   */
  expectBoundingBoxCenter: (
    result: HashedGeometryResult,
    expectedCenter: [number, number, number],
    tolerance?: number,
  ) => Promise<void>;

  /**
   * Assert all geometry properties at once.
   */
  expectGeometry: (result: HashedGeometryResult, expected: GeometryExpectation) => Promise<void>;
} {
  const getReportFromResult = async (result: HashedGeometryResult): Promise<InspectReport> => {
    const glbData = extractGltfFromResult(result);
    if (!glbData) {
      throw new Error('No GLTF data found in result');
    }

    return getInspectReport(glbData);
  };

  return {
    async expectValidGltf(result: HashedGeometryResult): Promise<void> {
      expect(result.success, 'Expected result.success to be true').toBe(true);

      const glbData = extractGltfFromResult(result);
      expect(glbData, 'Expected GLTF data in result').toBeDefined();

      if (glbData) {
        validateGlbData(glbData);
      }
    },

    async expectVertexCount(result: HashedGeometryResult, expectedCount: number): Promise<void> {
      const report = await getReportFromResult(result);
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.vertexCount, `Expected vertex count: ${expectedCount}`).toBe(expectedCount);
    },

    async expectFaceCount(result: HashedGeometryResult, expectedCount: number): Promise<void> {
      const report = await getReportFromResult(result);
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.faceCount, `Expected face count: ${expectedCount}`).toBe(expectedCount);
    },

    async expectMeshCount(result: HashedGeometryResult, expectedCount: number): Promise<void> {
      const report = await getReportFromResult(result);
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.meshCount, `Expected mesh count: ${expectedCount}`).toBe(expectedCount);
    },

    async expectBoundingBoxSize(
      result: HashedGeometryResult,
      expectedSize: [number, number, number],
      tolerance = defaultTolerance,
    ): Promise<void> {
      const report = await getReportFromResult(result);
      const boundingBox = getBoundingBoxFromInspect(report);
      expect(boundingBox, 'Expected bounding box to be defined').toBeDefined();

      if (boundingBox) {
        expectVector3ToBeCloseTo({
          actual: boundingBox.size,
          expected: expectedSize,
          subject: 'Bounding box size',
          tolerance,
        });
      }
    },

    async expectBoundingBoxCenter(
      result: HashedGeometryResult,
      expectedCenter: [number, number, number],
      tolerance = defaultTolerance,
    ): Promise<void> {
      const report = await getReportFromResult(result);
      const boundingBox = getBoundingBoxFromInspect(report);
      expect(boundingBox, 'Expected bounding box to be defined').toBeDefined();

      if (boundingBox) {
        expectVector3ToBeCloseTo({
          actual: boundingBox.center,
          expected: expectedCenter,
          subject: 'Bounding box center',
          tolerance,
        });
      }
    },

    async expectGeometry(result: HashedGeometryResult, expected: GeometryExpectation): Promise<void> {
      const report = await getReportFromResult(result);
      const stats = getGeometryStatsFromInspect(report);
      const boundingBox = getBoundingBoxFromInspect(report);
      const tolerance = expected.boundingBox.tolerance ?? defaultTolerance;

      expect(stats.vertexCount, `Expected vertex count: ${expected.vertexCount}`).toBe(expected.vertexCount);
      expect(stats.faceCount, `Expected face count: ${expected.faceCount}`).toBe(expected.faceCount);
      expect(stats.meshCount, `Expected mesh count: ${expected.meshCount}`).toBe(expected.meshCount);

      expect(boundingBox, 'Expected bounding box to be defined').toBeDefined();
      if (boundingBox) {
        expectVector3ToBeCloseTo({
          actual: boundingBox.size,
          expected: expected.boundingBox.size,
          subject: 'Bounding box size',
          tolerance,
        });
        expectVector3ToBeCloseTo({
          actual: boundingBox.center,
          expected: expected.boundingBox.center,
          subject: 'Bounding box center',
          tolerance,
        });
      }
    },
  };
}
