import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BufferGeometry, Object3D } from 'three';
import { Box3, Mesh, Vector3 } from 'three';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- test utils
import { expect } from 'vitest';
import type { ThreejsImportFormat } from '#threejs-import.js';
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
  fixtureName: string;
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

// Test utilities factory
export const createThreeTestUtils = (): {
  getBoundingBox: (object: Object3D) => Box3;
  getGeometryStats: (object: Object3D) => { vertexCount: number; faceCount: number; meshCount: number };
  expectVector3ToBeCloseTo: (actual: Vector3, expected: Vector3, subject: string, precision?: number) => void;
  getObjectStructure: (object: Object3D) => Record<string, unknown>;
  createGeometrySignature: (object: Object3D) => GeometryExpectation;
  epsilon: number;
} => {
  const epsilon = 1e-6;

  const getBoundingBox = (object: Object3D): Box3 => {
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
      `${subject}: Expected [X: ${actual.x}]. Actual [X: ${expected.x}]\n`,
    ).toBeLessThan(precision);
    expect(
      Math.abs(actual.y - expected.y),
      `${subject}: Expected [Y: ${actual.y}]. Actual [Y: ${expected.y}]\n`,
    ).toBeLessThan(precision);
    expect(
      Math.abs(actual.z - expected.z),
      `${subject}: Expected [Z: ${actual.z}]. Actual [Z: ${expected.z}]\n`,
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

  return {
    getBoundingBox,
    getGeometryStats,
    expectVector3ToBeCloseTo,
    getObjectStructure,
    createGeometrySignature,
    epsilon,
  };
};
