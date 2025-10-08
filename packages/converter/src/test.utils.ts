import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartialDeep } from 'type-fest';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- test utils
import { expect } from 'vitest';
import type { InspectReport } from '@gltf-transform/functions';
import type { SupportedImportFormat } from '#import.js';
import type { File } from '#types.js';
import {
  getInspectReport,
  getGeometryStatsFromInspect,
  getBoundingBoxFromInspect,
  hasAttribute,
  getDocumentStructure,
  validateGltfScene,
} from '#gltf.utils.js';
import type { GltfSceneStructure } from '#gltf.utils.js';

// ============================================================================
// Test Framework Types & Utilities
// ============================================================================

export type GeometryExpectation = {
  vertexCount: number;
  faceCount: number;
  /**
   * The number of meshes in the object
   */
  meshCount: number;
  /**
   * The number of points in each mesh face
   */
  facePoints?: number;
  boundingBox: {
    size: [number, number, number];
    center: [number, number, number];
    tolerance?: number;
  };
};

export type LoaderTestCase = {
  format: SupportedImportFormat;
  /**
   * Optional variant of the test case.
   *
   * For example, a test case for a cube can have a variant for a mesh, a NURBS, etc.
   */
  variant?:
    | 'binary'
    | 'ascii'
    | 'mesh'
    | 'brep'
    | 'textures'
    | 'materials'
    | 'animations'
    | 'draco'
    | 'subd'
    | 'extrusion'
    | 'instance'
    | 'freecad'
    | 'blender'
    | 'millimeters' // For file formats that can declare custom units
    | 'centimeters';
  /**
   * Multiple fixture files for multi-file formats (e.g., ["cube.obj", "cube.mtl"])
   */
  files?: string[];
  /**
   * Single fixture file (for backward compatibility)
   */
  fixtureName?: string;
  /**
   * Programmatic data source instead of file fixture
   */
  dataSource?: () => Promise<Uint8Array>;
  description?: string;
  geometry?: GeometryExpectation;
  structure?: GltfSceneStructure;
  skip?: boolean;
  skipReason?: string;
};

export const loadFixture = (fixtureName: string): Uint8Array => {
  const fixturePath = join(import.meta.dirname, 'fixtures', fixtureName);
  const fileData = readFileSync(fixturePath);
  return new Uint8Array(fileData);
};

// Helper for creating geometry variants with overrides
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

export const loadTestData = async (testCase: LoaderTestCase): Promise<File[]> => {
  if (testCase.dataSource) {
    const data = await testCase.dataSource();
    return [{ name: `input.${testCase.format}`, data }];
  }

  if (testCase.files) {
    return testCase.files.map((filename) => ({
      name: filename,
      data: loadFixture(filename),
    }));
  }

  if (testCase.fixtureName) {
    return [
      {
        name: testCase.fixtureName,
        data: loadFixture(testCase.fixtureName),
      },
    ];
  }

  throw new Error('Test case must specify files, fixtureName, or dataSource');
};

// GLTF test utilities factory using gltf-transform inspect reports
export const createInspectTestUtils = (): {
  getInspectReport: (glbData: Uint8Array) => Promise<InspectReport>;
  createInspectSignature: (report: InspectReport) => GeometryExpectation;
  createGeometryTestHelpers: () => {
    expectVertexCount: (report: InspectReport, expectedCount: number) => void;
    expectFaceCount: (report: InspectReport, expectedCount: number) => void;
    expectMeshCount: (report: InspectReport, expectedCount: number) => void;
    expectBoundingBoxSize: (report: InspectReport, expectedSize: [number, number, number], tolerance?: number) => void;
    expectBoundingBoxCenter: (
      report: InspectReport,
      expectedCenter: [number, number, number],
      tolerance?: number,
    ) => void;
  };
  createStructureTestHelpers: () => {
    expectMeshCount: (report: InspectReport, expectedCount: number) => void;
    expectHasPositionAttribute: (report: InspectReport) => void;
    expectHasNormalAttribute: (report: InspectReport, shouldHave: boolean) => void;
    expectHasUvAttribute: (report: InspectReport, shouldHave: boolean) => void;
    // GLTF scene structure methods
    expectRootNodeCount: (glbData: Uint8Array, expectedCount: number) => Promise<void>;
    expectFullStructure: (glbData: Uint8Array, expectedStructure: GltfSceneStructure) => Promise<void>;
  };
  epsilon: number;
} => {
  const epsilon = 1e-6;

  const expectVector3ToBeCloseTo = (
    actual: [number, number, number],
    expected: [number, number, number],
    subject: string,
    precision = epsilon,
  ): void => {
    expect(
      Math.abs(actual[0] - expected[0]),
      `${subject}: Expected [X: ${expected[0]}]. Actual [X: ${actual[0]}]\n`,
    ).toBeLessThan(precision);
    expect(
      Math.abs(actual[1] - expected[1]),
      `${subject}: Expected [Y: ${expected[1]}]. Actual [Y: ${actual[1]}]\n`,
    ).toBeLessThan(precision);
    expect(
      Math.abs(actual[2] - expected[2]),
      `${subject}: Expected [Z: ${expected[2]}]. Actual [Z: ${actual[2]}]\n`,
    ).toBeLessThan(precision);
  };

  // GLTF structure analysis via gltf-transform inspect reports

  const createGeometrySignatureFromInspect = (report: InspectReport): GeometryExpectation => {
    const stats = getGeometryStatsFromInspect(report);
    const boundingBox = getBoundingBoxFromInspect(report);

    return {
      vertexCount: stats.vertexCount,
      faceCount: stats.faceCount,
      meshCount: stats.meshCount,
      boundingBox: {
        size: boundingBox
          ? [
              Math.round(boundingBox.size[0] * 1000) / 1000,
              Math.round(boundingBox.size[1] * 1000) / 1000,
              Math.round(boundingBox.size[2] * 1000) / 1000,
            ]
          : [0, 0, 0],
        center: boundingBox
          ? [
              Math.round(boundingBox.center[0] * 1000) / 1000,
              Math.round(boundingBox.center[1] * 1000) / 1000,
              Math.round(boundingBox.center[2] * 1000) / 1000,
            ]
          : [0, 0, 0],
      },
    };
  };

  // Pure GLTF structure validation utilities

  // GLTF geometry test helper functions
  const createGeometryTestHelpers = () => ({
    expectVertexCount(report: InspectReport, expectedCount: number): void {
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.vertexCount).toBe(expectedCount);
    },

    expectFaceCount(report: InspectReport, expectedCount: number): void {
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.faceCount).toBe(expectedCount);
    },

    expectMeshCount(report: InspectReport, expectedCount: number): void {
      const stats = getGeometryStatsFromInspect(report);
      expect(stats.meshCount).toBe(expectedCount);
    },

    expectBoundingBoxSize(report: InspectReport, expectedSize: [number, number, number], tolerance?: number): void {
      const boundingBox = getBoundingBoxFromInspect(report);
      expect(boundingBox).toBeDefined();

      const actualTolerance = tolerance ?? epsilon;
      expectVector3ToBeCloseTo(boundingBox!.size, expectedSize, 'bounding box size', actualTolerance);
    },

    expectBoundingBoxCenter(report: InspectReport, expectedCenter: [number, number, number], tolerance?: number): void {
      const boundingBox = getBoundingBoxFromInspect(report);
      expect(boundingBox).toBeDefined();

      const actualTolerance = tolerance ?? epsilon;
      expectVector3ToBeCloseTo(boundingBox!.center, expectedCenter, 'bounding box center', actualTolerance);
    },
  });

  const createStructureTestHelpers = () => ({
    expectMeshCount(report: InspectReport, expectedCount: number): void {
      expect(report.meshes.properties.length).toBe(expectedCount);
    },

    expectHasPositionAttribute(report: InspectReport): void {
      expect(report.meshes.properties.length).toBeGreaterThan(0);
      const mesh = report.meshes.properties[0]!;
      expect(hasAttribute(mesh, 'position')).toBe(true);
    },

    expectHasNormalAttribute(report: InspectReport, shouldHave: boolean): void {
      expect(report.meshes.properties.length).toBeGreaterThan(0);
      const mesh = report.meshes.properties[0]!;
      expect(hasAttribute(mesh, 'normal')).toBe(shouldHave);
    },

    expectHasUvAttribute(report: InspectReport, shouldHave: boolean): void {
      expect(report.meshes.properties.length).toBeGreaterThan(0);
      const mesh = report.meshes.properties[0]!;
      const hasUv = hasAttribute(mesh, 'texcoord') || hasAttribute(mesh, 'uv');
      expect(hasUv).toBe(shouldHave);
    },

    // GLTF scene structure validation methods

    async expectRootNodeCount(glbData: Uint8Array, expectedCount: number): Promise<void> {
      const structure = await getDocumentStructure(glbData);
      expect(structure.rootNodes.length).toBe(expectedCount);
    },

    async expectFullStructure(glbData: Uint8Array, expectedStructure: GltfSceneStructure): Promise<void> {
      const actualStructure = await getDocumentStructure(glbData);
      validateGltfScene(actualStructure, expectedStructure);
    },
  });

  return {
    getInspectReport,
    createInspectSignature: createGeometrySignatureFromInspect,
    createGeometryTestHelpers,
    createStructureTestHelpers,
    epsilon,
  };
};
