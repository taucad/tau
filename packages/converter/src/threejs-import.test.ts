import { describe, expect, it, beforeEach } from 'vitest';
import { Vector3, Mesh } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import type { InputFile } from '#types.js';
import { importThreeJs, threejsImportFomats } from '#threejs-import.js';
import { createThreeTestUtils, loadFixture } from '#threejs-test.utils.js';
import type { GeometryExpectation, LoaderTestCase, StructureExpectation } from '#threejs-test.utils.js';

// ============================================================================
// Test Configuration Registry
// ============================================================================

const loaderTestCases: LoaderTestCase[] = [
  {
    format: 'gltf',
    fixtureName: 'cube.gltf',
    description: 'Simple cube from GLTF format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [0.02, 0.02, 0.02],
        center: [0, 0.01, 0],
        tolerance: 0.02,
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'node',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'glb',
    fixtureName: 'cube.glb',
    description: 'Simple cube from GLB format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [0.02, 0.02, 0.02],
        center: [0, 0.01, 0],
        tolerance: 0.02,
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'node',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'glb',
    fixtureName: 'cube-draco.glb',
    description: 'Simple cube from GLB format with Draco compression',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [0.02, 0.02, 0.02],
        center: [0, 0.01, 0],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'cube',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'stl',
    fixtureName: 'cube.stl',
    description: 'Simple cube from STL format',
    geometry: {
      vertexCount: 36, // Actual vertex count from STL loader
      faceCount: 12, // 36 vertices / 3 = 12 triangles
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2], // 2x2x2 cube
        center: [0, 0, 1], // Actual center from geometry
      },
    },
    structure: {
      type: 'Mesh',
    },
  },
  // Easy to add new loaders:
  {
    format: 'obj',
    fixtureName: 'cube.obj',
    description: 'Simple cube from OBJ format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          name: 'node',
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: 'ply',
    fixtureName: 'cube.ply',
    description: 'Simple cube from PLY format',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Mesh',
    },
  },
  {
    format: '3dm',
    fixtureName: 'cube.3dm',
    description: 'Simple cube from 3DM format',
    skip: true,
    skipReason: '3DM loader not working with WASM right now.',
    geometry: {
      vertexCount: 24,
      faceCount: 8,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
  },
  {
    format: 'dae',
    fixtureName: 'cube.dae',
    description: 'Simple cube from DAE format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'fbx',
    fixtureName: 'cube.fbx',
    description: 'Simple cube from FBX format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'usdz',
    fixtureName: 'cube.usdz',
    description: 'Simple cube from USDZ format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Object3D',
        },
      ],
    },
  },
  {
    format: '3ds',
    fixtureName: 'cube.3ds',
    description: 'Simple cube from 3DS format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, 1],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Mesh',
        },
      ],
    },
  },
  {
    format: '3mf',
    fixtureName: 'cube.3mf',
    description: 'Simple cube from 3MF format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, -1, 0],
      },
    },
    structure: {
      type: 'Group',
      children: [
        {
          type: 'Group',
          children: [
            {
              type: 'Mesh',
            },
          ],
        },
      ],
    },
  },
  {
    format: 'kmz',
    fixtureName: 'cube.kmz',
    description: 'Simple cube from KMZ format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, -1, 0],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'amf',
    fixtureName: 'cube.amf',
    description: 'Simple cube from AMF format',
    geometry: {
      vertexCount: 8,
      faceCount: 3,
      meshCount: 1,
      facePoints: 4,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, -1, 0],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'gcode',
    fixtureName: 'cube.gcode',
    description: 'Simple cube from GCODE format',
    skip: true,
    skipReason: 'GCODE loader does not appear to produce correct geometry right now.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'wrl',
    fixtureName: 'cube.wrl',
    description: 'Simple cube from VRML format',
    geometry: {
      vertexCount: 597,
      faceCount: 199,
      meshCount: 2,
      boundingBox: {
        size: [20_000, 20_000, 20_000],
        center: [0, 0, 0],
      },
    },
    structure: {
      type: 'Scene',
    },
  },
  {
    format: 'lwo',
    fixtureName: 'cube.lwo',
    description: 'Simple cube from LWO format',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 0, -1],
      },
    },
    structure: {
      type: 'Group',
    },
  },
  {
    format: 'bvh',
    fixtureName: 'cube.bvh',
    description: 'BVH format is not supported yet.',
    skip: true,
    skipReason: 'BVH loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'drc',
    fixtureName: 'cube.drc',
    description: 'DRC format is not supported yet.',
    skip: true,
    skipReason: 'DRC loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'md2',
    fixtureName: 'cube.md2',
    description: 'MD2 format is not supported yet.',
    skip: true,
    skipReason: 'MD2 loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'pcd',
    fixtureName: 'cube.pcd',
    description: 'PCD format is not supported yet.',
    skip: true,
    skipReason: 'PCD loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'usda',
    fixtureName: 'cube.usda',
    description: 'USDA format is not supported yet.',
    skip: true,
    skipReason: 'USDA loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'usdc',
    fixtureName: 'cube.usdc',
    description: 'USDC format is not supported yet.',
    skip: true,
    skipReason: 'USDC loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'vox',
    fixtureName: 'cube.vox',
    description: 'VOX format is not supported yet.',
    skip: true,
    skipReason: 'VOX loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'vtk',
    fixtureName: 'cube.vtk',
    description: 'VTK format is not supported yet.',
    skip: true,
    skipReason: 'VTK loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'vtp',
    fixtureName: 'cube.vtp',
    description: 'VTP format is not supported yet.',
    skip: true,
    skipReason: 'VTP loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
  {
    format: 'xyz',
    fixtureName: 'cube.xyz',
    description: 'XYZ format is not supported yet.',
    skip: true,
    skipReason: 'XYZ loader is not implemented yet.',
    geometry: {
      vertexCount: 0,
      faceCount: 0,
      meshCount: 0,
      boundingBox: {
        size: [0, 0, 0],
        center: [0, 0, 0],
      },
    },
  },
];

// ============================================================================
// Test Runners
// ============================================================================

const runGeometryTests = (
  object3d: Object3D,
  expectations: GeometryExpectation,
  utils: ReturnType<typeof createThreeTestUtils>,
): void => {
  const stats = utils.getGeometryStats(object3d);

  expect(stats.vertexCount).toBe(expectations.vertexCount);

  expect(Math.round(stats.faceCount)).toBe(expectations.faceCount);

  expect(stats.meshCount).toBe(expectations.meshCount);

  const boundingBox = utils.getBoundingBox(object3d);
  const size = boundingBox.getSize(new Vector3());
  const center = boundingBox.getCenter(new Vector3());
  const tolerance = expectations.boundingBox.tolerance ?? utils.epsilon;

  const [expectedWidth, expectedHeight, expectedDepth] = expectations.boundingBox.size;
  utils.expectVector3ToBeCloseTo(size, new Vector3(expectedWidth, expectedHeight, expectedDepth), tolerance);

  const [expectedCenterX, expectedCenterY, expectedCenterZ] = expectations.boundingBox.center;
  utils.expectVector3ToBeCloseTo(center, new Vector3(expectedCenterX, expectedCenterY, expectedCenterZ), tolerance);
};

const runStructureTests = (object3d: Object3D, expectations: StructureExpectation): void => {
  expect(object3d.type).toBe(expectations.type);

  if (expectations.name !== undefined) {
    expect(object3d.name).toBe(expectations.name);
  }

  if (expectations.children) {
    for (const [index, childExpectation] of expectations.children.entries()) {
      const child = object3d.children[index];
      if (child) {
        runStructureTests(child, childExpectation as StructureExpectation);
      }
    }
  }

  if (expectations.children?.length !== undefined) {
    expect(object3d.children.length).toBe(expectations.children.length);
  }
};

// ============================================================================
// Parameterized Tests
// ============================================================================

describe('threejs-import', () => {
  const utils = createThreeTestUtils();

  // Filter to only test formats that are currently enabled
  const enabledTestCases = loaderTestCases.filter((testCase) =>
    threejsImportFomats.includes(testCase.format as 'gltf' | 'stl'),
  );

  describe.each(enabledTestCases)('$format loader', (testCase) => {
    const { format, fixtureName, description, geometry, structure, skip } = testCase;

    const testFunction = skip ? it.skip : it;

    let object3d: Object3D;

    beforeEach(async () => {
      if (skip) {
        return;
      }

      const inputFile: InputFile = {
        name: fixtureName,
        data: loadFixture(fixtureName),
      };

      object3d = await importThreeJs(inputFile, format as 'gltf' | 'stl');
    });

    testFunction(`should successfully import ${description ?? fixtureName}`, () => {
      expect(object3d).toBeDefined();
    });

    if (geometry) {
      testFunction('should have correct geometric properties', () => {
        runGeometryTests(object3d, geometry, utils);
      });
    }

    if (structure) {
      testFunction('should maintain correct object structure', () => {
        runStructureTests(object3d, structure);
      });
    }

    testFunction('should produce consistent results across multiple imports', async () => {
      const inputFile: InputFile = {
        name: fixtureName,
        data: loadFixture(fixtureName),
      };

      const object3d2 = await importThreeJs(inputFile, format as 'gltf' | 'stl');

      const signature1 = utils.createGeometrySignature(object3d);
      const signature2 = utils.createGeometrySignature(object3d2);

      expect(signature1).toEqual(signature2);
    });

    testFunction('should have valid mesh geometry', () => {
      object3d.traverse((child) => {
        if (child instanceof Mesh) {
          const geometry = child.geometry as BufferGeometry;
          const position = geometry.getAttribute('position');

          expect(position).toBeDefined();
          expect(position.count).toBeGreaterThan(0);

          const facePoints = testCase.geometry?.facePoints ?? 3;
          // Verify vertex count is divisible by 3 (triangulated mesh)
          expect(position.count % facePoints).toBe(0);

          // Verify all coordinates are finite numbers
          for (const value of position.array) {
            expect(Number.isFinite(value)).toBe(true);
          }
        }
      });
    });
  });

  // Test skipped loaders
  const skippedTestCases = loaderTestCases.filter((tc) => tc.skip);
  if (skippedTestCases.length > 0) {
    describe('skipped loaders', () => {
      it.each(skippedTestCases)('should skip $format loader: $skipReason', (testCase) => {
        expect(testCase.skip).toBe(true);
      });
    });
  }

  // Integration test for all enabled formats
  it('should test all declared formats', () => {
    const enabledFormats = enabledTestCases.map((tc) => tc.format);
    const declaredFormats = threejsImportFomats;

    // Expect(enabledFormats.sort()).toEqual(declaredFormats.sort());

    for (const format of declaredFormats) {
      expect(enabledFormats).toContain(format);
    }
  });
});
