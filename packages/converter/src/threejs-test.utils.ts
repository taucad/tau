import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PartialDeep } from 'type-fest';
import type { BufferGeometry, Object3D } from 'three';
import { Box3, Mesh, Vector3 } from 'three';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- test utils
import { expect } from 'vitest';
import type { ThreejsImportFormat } from '#threejs-import.js';
import type { InputFile } from '#types.js';
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

export type StructureExpectation = {
  type: string;
  name?: string;
  children?: Array<Partial<StructureExpectation>>;
};

export type LoaderTestCase = {
  format: ThreejsImportFormat;
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
  structure?: StructureExpectation;
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

export const loadTestData = async (testCase: LoaderTestCase): Promise<InputFile[]> => {
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

/**
 * Validate that GLB data is properly formatted.
 */
export const validateGlbData = (glb: Uint8Array): void => {
  expect(glb).toBeDefined();
  expect(glb).toBeInstanceOf(Uint8Array);
  expect(glb.length).toBeGreaterThan(0);

  // Basic GLB header validation (first 4 bytes should be 'glTF')
  if (glb.length >= 4) {
    const header = new TextDecoder().decode(glb.slice(0, 4));
    expect(header).toBe('glTF');
  }
};

/**
 * Calculate bounding box for a Three.js Object3D, ensuring geometry bounding boxes are computed
 */
export const getBoundingBox = (object: Object3D): Box3 => {
  const box = new Box3();
  object.traverse((child) => {
    if (child instanceof Mesh) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- three.js types
      child.geometry.computeBoundingBox();
      if (child.geometry.boundingBox) {
        box.expandByObject(child);
      }
    }
  });
  return box;
};

// Test utilities factory
export const createThreeTestUtils = (): {
  getBoundingBox: (object: Object3D) => Box3;
  getGeometryStats: (object: Object3D) => { vertexCount: number; faceCount: number; meshCount: number };
  expectVector3ToBeCloseTo: (actual: Vector3, expected: Vector3, subject: string, precision?: number) => void;
  getObjectStructure: (object: Object3D) => Record<string, unknown>;
  createGeometrySignature: (object: Object3D) => GeometryExpectation;
  createGeometryTestHelpers: () => {
    expectVertexCount: (object3d: Object3D, expectedCount: number) => void;
    expectFaceCount: (object3d: Object3D, expectedCount: number) => void;
    expectMeshCount: (object3d: Object3D, expectedCount: number) => void;
    expectBoundingBoxSize: (object3d: Object3D, expectedSize: [number, number, number], tolerance?: number) => void;
    expectBoundingBoxCenter: (object3d: Object3D, expectedCenter: [number, number, number], tolerance?: number) => void;
  };
  createStructureTestHelpers: () => {
    expectObjectType: (object3d: Object3D, expectedType: string) => void;
    expectObjectName: (object3d: Object3D, expectedName: string) => void;
    expectChildrenCount: (object3d: Object3D, expectedCount: number) => void;
    expectChildAtIndex: (object3d: Object3D, index: number, childExpectation: StructureExpectation) => void;
  };
  epsilon: number;
} => {
  const epsilon = 1e-6;

  const getGeometryStats = (object: Object3D) => {
    let vertexCount = 0;
    let faceCount = 0;
    let meshCount = 0;

    object.traverse((child) => {
      if (child instanceof Mesh) {
        meshCount++;
        const geometry = child.geometry as BufferGeometry;
        const positionAttribute = geometry.getAttribute('position');
        vertexCount += positionAttribute.count;
        faceCount += positionAttribute.count / 3;
      }
    });

    return { vertexCount, faceCount, meshCount };
  };

  const expectVector3ToBeCloseTo = (actual: Vector3, expected: Vector3, subject: string, precision = epsilon): void => {
    expect(
      Math.abs(actual.x - expected.x),
      `${subject}: Expected [X: ${expected.x}]. Actual [X: ${actual.x}]\n`,
    ).toBeLessThan(precision);
    expect(
      Math.abs(actual.y - expected.y),
      `${subject}: Expected [Y: ${expected.y}]. Actual [Y: ${actual.y}]\n`,
    ).toBeLessThan(precision);
    expect(
      Math.abs(actual.z - expected.z),
      `${subject}: Expected [Z: ${expected.z}]. Actual [Z: ${actual.z}]\n`,
    ).toBeLessThan(precision);
  };

  const getObjectStructure = (object: Object3D): Record<string, unknown> => {
    const baseStructure = {
      name: object.name,
      type: object.type,
      childCount: object.children.length,
      children: object.children.map((child) => getObjectStructure(child)),
    };

    if (object instanceof Mesh) {
      return {
        ...baseStructure,
        geometry: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- three.js types
          type: object.geometry.type,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- three.js types
          vertexCount: object.geometry.getAttribute('position')?.count ?? 0,
        },
        material: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- three.js types
          type: object.material?.type ?? 'unknown',
        },
      };
    }

    return baseStructure;
  };

  const createGeometrySignature = (object: Object3D): GeometryExpectation => {
    const stats = getGeometryStats(object);
    const boundingBox = getBoundingBox(object);
    const size = boundingBox.getSize(new Vector3());
    const center = boundingBox.getCenter(new Vector3());

    return {
      vertexCount: stats.vertexCount,
      faceCount: Math.round(stats.faceCount),
      meshCount: stats.meshCount,
      boundingBox: {
        size: [Math.round(size.x * 1000) / 1000, Math.round(size.y * 1000) / 1000, Math.round(size.z * 1000) / 1000],
        center: [
          Math.round(center.x * 1000) / 1000,
          Math.round(center.y * 1000) / 1000,
          Math.round(center.z * 1000) / 1000,
        ],
      },
    };
  };

  // Test helper functions
  const createGeometryTestHelpers = () => ({
    expectVertexCount(object3d: Object3D, expectedCount: number): void {
      const stats = getGeometryStats(object3d);
      expect(stats.vertexCount).toBe(expectedCount);
    },

    expectFaceCount(object3d: Object3D, expectedCount: number): void {
      const stats = getGeometryStats(object3d);
      expect(Math.round(stats.faceCount)).toBe(expectedCount);
    },

    expectMeshCount(object3d: Object3D, expectedCount: number): void {
      const stats = getGeometryStats(object3d);
      expect(stats.meshCount).toBe(expectedCount);
    },

    expectBoundingBoxSize(object3d: Object3D, expectedSize: [number, number, number], tolerance?: number): void {
      const boundingBox = getBoundingBox(object3d);
      const size = boundingBox.getSize(new Vector3());
      const actualTolerance = tolerance ?? epsilon;

      const [expectedWidth, expectedHeight, expectedDepth] = expectedSize;
      expectVector3ToBeCloseTo(
        size,
        new Vector3(expectedWidth, expectedHeight, expectedDepth),
        'bounding box size',
        actualTolerance,
      );
    },

    expectBoundingBoxCenter(object3d: Object3D, expectedCenter: [number, number, number], tolerance?: number): void {
      const boundingBox = getBoundingBox(object3d);
      const center = boundingBox.getCenter(new Vector3());
      const actualTolerance = tolerance ?? epsilon;

      const [expectedCenterX, expectedCenterY, expectedCenterZ] = expectedCenter;
      expectVector3ToBeCloseTo(
        center,
        new Vector3(expectedCenterX, expectedCenterY, expectedCenterZ),
        'bounding box center',
        actualTolerance,
      );
    },
  });

  const createStructureTestHelpers = () => ({
    expectObjectType(object3d: Object3D, expectedType: string): void {
      expect(object3d.type).toBe(expectedType);
    },

    expectObjectName(object3d: Object3D, expectedName: string): void {
      expect(object3d.name).toBe(expectedName);
    },

    expectChildrenCount(object3d: Object3D, expectedCount: number): void {
      expect(object3d.children.length).toBe(expectedCount);
    },

    expectChildAtIndex(object3d: Object3D, index: number, childExpectation: StructureExpectation): void {
      const child = object3d.children[index];
      expect(child).toBeDefined();

      if (child) {
        expect(child.type).toBe(childExpectation.type);

        if (childExpectation.name !== undefined) {
          expect(child.name).toBe(childExpectation.name);
        }
      }
    },
  });

  return {
    getBoundingBox,
    getGeometryStats,
    expectVector3ToBeCloseTo,
    getObjectStructure,
    createGeometrySignature,
    createGeometryTestHelpers,
    createStructureTestHelpers,
    epsilon,
  };
};
