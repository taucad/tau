/**
 * Kernel Geometry Testing Utilities
 *
 * Provides helpers for validating GLTF geometry output from kernel workers.
 * Shared geometry assertions for runtime and plugin conformance tests.
 */

import type { InspectReport } from '@gltf-transform/functions';
import { asKnownArtifact } from '@taucad/runtime';
import type { ExportResult, Rendering } from '@taucad/runtime/client';
import type { Artifact, RenderResult, WriteResult } from '@taucad/runtime/types';
import { expect } from 'vitest';
import {
  getBoundingBoxFromInspect,
  getGeometryStatsFromInspect,
  getInspectReport,
  glbToDocument,
  validateGlbData,
} from '#gltf-inspection.utils.js';

/** Temporary input for direct legacy kernel callers still being migrated. */
type LegacyGeometryResult =
  | { readonly success: true; readonly data: unknown; readonly issues: readonly unknown[] }
  | { readonly success: false; readonly issues: readonly unknown[] };
type RuntimeResult = LegacyGeometryResult | RenderResult | Rendering;
type ExportCandidate = LegacyGeometryResult | WriteResult | ExportResult;

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

/**
 * Compute signed volume from every triangle primitive in a GLB.
 *
 * @param glbData - The GLB binary content to measure.
 * @returns Signed volume in the GLB coordinate units cubed.
 * @public
 */
export const getSignedVolumeFromGlb = async (glbData: Uint8Array<ArrayBuffer>): Promise<number> => {
  const document = await glbToDocument(glbData);
  let volume = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      if (primitive.getMode() !== 4) {
        continue;
      }
      const positions = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      if (!positions || !indices) {
        continue;
      }
      const point = (index: number): [number, number, number] => {
        const value = [0, 0, 0];
        positions.getElement(index, value);
        return value as [number, number, number];
      };
      for (let index = 0; index < indices.getCount(); index += 3) {
        const a = point(indices.getScalar(index));
        const b = point(indices.getScalar(index + 1));
        const c = point(indices.getScalar(index + 2));
        volume +=
          (a[0] * (b[1] * c[2] - b[2] * c[1]) +
            a[1] * (b[2] * c[0] - b[0] * c[2]) +
            a[2] * (b[0] * c[1] - b[1] * c[0])) /
          6;
      }
    }
  }
  return volume;
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
const isGltfResponse = (response: unknown): response is { format: 'gltf'; content: Uint8Array<ArrayBuffer> } => {
  if (typeof response !== 'object' || response === null) {
    return false;
  }
  return (
    'format' in response &&
    response.format === 'gltf' &&
    'content' in response &&
    response.content instanceof Uint8Array
  );
};

const isArtifact = (value: unknown): value is Artifact =>
  typeof value === 'object' &&
  value !== null &&
  'mimeType' in value &&
  typeof value.mimeType === 'string' &&
  'content' in value &&
  (typeof value.content === 'string' || value.content instanceof Uint8Array);

/**
 * Extracts GLB content from a successful public rendering or direct kernel result.
 *
 * For document-level tests using `document.export('glb')`, prefer
 * {@link extractGltfFromExportResult}
 * which validates the exact-one GLB contract.
 *
 * @param result - The geometry result to extract from
 * @returns The GLB binary content, or `undefined` if the render geometry is not GLTF
 * @public
 */
export function extractGltfFromResult(result: RuntimeResult): Uint8Array<ArrayBuffer> | undefined {
  if (!result.success) {
    return undefined;
  }
  if ('artifact' in result) {
    const artifact = asKnownArtifact(result.artifact);
    return artifact?.mimeType === 'model/gltf-binary' ? artifact.content : undefined;
  }
  if (isArtifact(result.data)) {
    const artifact = asKnownArtifact(result.data);
    return artifact?.mimeType === 'model/gltf-binary' ? artifact.content : undefined;
  }
  // Direct legacy kernel callers still supply format/content until their test suites migrate.
  return isGltfResponse(result.data) ? result.data.content : undefined;
}

/**
 * Extracts the GLB bytes from an `ExportResult` returned by `document.export('glb')`.
 *
 * Returns `undefined` for a failed export and throws when a successful export
 * violates the format-specific exact-one GLB contract.
 *
 * @param result - The export result returned from `document.export('glb')`
 * @returns The GLB binary content, or `undefined` if the export failed
 * @public
 *
 * @example <caption>Asserting a glTF/GLB export at the client level</caption>
 * ```typescript
 * import type { RuntimeDocument } from '@taucad/runtime/client';
 * import { extractGltfFromExportResult } from '@taucad/runtime-testing';
 *
 * declare const document: RuntimeDocument;
 * declare const expect: (value: unknown) => { toBeInstanceOf: (ctor: unknown) => void };
 *
 * const result = await document.export('glb');
 * const glb = extractGltfFromExportResult(result);
 * expect(glb).toBeInstanceOf(Uint8Array);
 * ```
 */
export function extractGltfFromExportResult(result: ExportCandidate): Uint8Array<ArrayBuffer> | undefined {
  if (!result.success) {
    return undefined;
  }

  const data: unknown = 'data' in result ? result.data : result.files;
  if (!Array.isArray(data)) {
    throw new TypeError('GLB export returned an invalid artifact collection');
  }

  const names = data.map((value: unknown) =>
    typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
      ? value.name
      : '(invalid)',
  );
  if (data.length !== 1) {
    throw new Error(`GLB export expected exactly 1 artifact, received ${data.length}: ${names.join(', ') || '(none)'}`);
  }

  const file: unknown = data[0];
  if (typeof file !== 'object' || file === null || !('name' in file) || !('mimeType' in file) || !('bytes' in file)) {
    throw new TypeError('GLB export returned an invalid artifact');
  }
  const { name, mimeType, bytes } = file;
  if (typeof name !== 'string' || typeof mimeType !== 'string' || !(bytes instanceof Uint8Array)) {
    throw new TypeError('GLB export returned an invalid artifact');
  }
  if (!name.toLowerCase().endsWith('.glb') || mimeType !== 'model/gltf-binary') {
    throw new Error(`GLB export returned ${name} (${mimeType}); expected one .glb (model/gltf-binary)`);
  }
  const artifact = asKnownArtifact({ mimeType, content: new Uint8Array(bytes) });
  if (artifact?.mimeType !== 'model/gltf-binary') {
    throw new TypeError('GLB export returned an invalid known-media artifact');
  }
  return artifact.content;
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
  overrides: Partial<Omit<GeometryExpectation, 'boundingBox'>> & {
    readonly boundingBox?: Partial<GeometryExpectation['boundingBox']>;
  },
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
 * Create geometry test helpers for public renderings and direct kernel results.
 *
 * @returns An object of assertion helpers for validating geometry results
 *
 * @public
 *
 * @example <caption>Asserting kernel-worker geometry results in tests</caption>
 * ```typescript
 * import { createGeometryTestHelpers } from '@taucad/runtime-testing';
 *
 * const helpers = createGeometryTestHelpers();
 * declare const result: Parameters<typeof helpers.expectMeshCount>[0];
 * await helpers.expectMeshCount(result, 1);
 * ```
 */
export function createGeometryTestHelpers(): {
  /**
   * Assert that the result contains valid GLTF data.
   */
  expectValidGltf: (result: RuntimeResult) => Promise<void>;

  /**
   * Assert the total vertex count across all meshes.
   */
  expectVertexCount: (result: RuntimeResult, expectedCount: number) => Promise<void>;

  /**
   * Assert the total face count across all meshes.
   */
  expectFaceCount: (result: RuntimeResult, expectedCount: number) => Promise<void>;

  /**
   * Assert the number of meshes in the geometry.
   */
  expectMeshCount: (result: RuntimeResult, expectedCount: number) => Promise<void>;

  /**
   * Assert the bounding box size with optional tolerance.
   */
  expectBoundingBoxSize: (
    result: RuntimeResult,
    expectedSize: [number, number, number],
    tolerance?: number,
  ) => Promise<void>;

  /**
   * Assert the bounding box center with optional tolerance.
   */
  expectBoundingBoxCenter: (
    result: RuntimeResult,
    expectedCenter: [number, number, number],
    tolerance?: number,
  ) => Promise<void>;

  /**
   * Assert all geometry properties at once.
   */
  expectGeometry: (result: RuntimeResult, expected: GeometryExpectation) => Promise<void>;
} {
  const getReportFromResult = async (result: RuntimeResult): Promise<InspectReport> => {
    const glbData = extractGltfFromResult(result);
    if (!glbData) {
      throw new Error('No GLTF data found in result');
    }

    return getInspectReport(glbData);
  };

  return {
    async expectValidGltf(result: RuntimeResult): Promise<void> {
      expect(result.success, 'Expected result.success to be true').toBe(true);

      const glbData = extractGltfFromResult(result);
      expect(glbData, 'Expected GLTF data in result').toBeDefined();

      if (glbData) {
        validateGlbData(glbData);
      }
    },

    async expectVertexCount(result: RuntimeResult, expectedCount: number): Promise<void> {
      const report = await getReportFromResult(result);
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.vertexCount, `Expected vertex count: ${expectedCount}`).toBe(expectedCount);
    },

    async expectFaceCount(result: RuntimeResult, expectedCount: number): Promise<void> {
      const report = await getReportFromResult(result);
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.faceCount, `Expected face count: ${expectedCount}`).toBe(expectedCount);
    },

    async expectMeshCount(result: RuntimeResult, expectedCount: number): Promise<void> {
      const report = await getReportFromResult(result);
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.meshCount, `Expected mesh count: ${expectedCount}`).toBe(expectedCount);
    },

    async expectBoundingBoxSize(
      result: RuntimeResult,
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
      result: RuntimeResult,
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

    async expectGeometry(result: RuntimeResult, expected: GeometryExpectation): Promise<void> {
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
