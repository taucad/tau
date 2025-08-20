import { describe, expect, it, beforeEach } from 'vitest';
import { Mesh } from 'three';
import type { BufferGeometry, Object3D } from 'three';
import type { InputFormat } from '#types.js';
import { importThreeJs, threejsImportFomats } from '#threejs-import.js';
import { createThreeTestUtils, loadTestData, createGeometryVariant } from '#threejs-test.utils.js';
import type { LoaderTestCase, StructureExpectation, GeometryExpectation } from '#threejs-test.utils.js';

// ============================================================================
// Test Case Templates & Factories
// ============================================================================

const STANDARD_CUBE_GEOMETRY: GeometryExpectation = {
  vertexCount: 36,
  faceCount: 12,
  meshCount: 1,
  boundingBox: {
    size: [2, 2, 2],
    center: [0, 0, 1],
  },
};

const STEP_CUBE_GEOMETRY: GeometryExpectation = {
  vertexCount: 24,
  faceCount: 8,
  meshCount: 1,
  boundingBox: {
    size: [2, 2, 2],
    center: [0, 0, 1],
  },
};

const OBJECT_STRUCTURES = {
  groupWithObject3D: {
    type: 'Group',
    children: [{ type: 'Object3D' }],
  },
  groupWithMesh: {
    type: 'Group',
    children: [{ type: 'Mesh' }],
  },
} as const;

// Factory functions for common test patterns
const createCubeTestCase = (
  format: InputFormat,
  options: {
    variant?: LoaderTestCase['variant'];
    geometry?: GeometryExpectation;
    structure?: keyof typeof OBJECT_STRUCTURES | StructureExpectation;
    skip?: boolean;
    skipReason?: string;
    fixtureName?: string;
    dataSource?: () => Promise<Uint8Array>;
  } = {}
): LoaderTestCase => ({
  format: format as any,
  variant: options.variant as any,
  fixtureName: options.fixtureName ?? `cube${options.variant ? `-${options.variant}` : ''}.${format}`,
  dataSource: options.dataSource,
  description: `Simple cube from ${format.toUpperCase()} format${options.variant ? ` (${options.variant})` : ''}`,
  geometry: options.geometry ?? STANDARD_CUBE_GEOMETRY,
  structure: options.structure ?
    (typeof options.structure === 'string' ? OBJECT_STRUCTURES[options.structure] as unknown as StructureExpectation : options.structure)
    : undefined,
  skip: options.skip,
  skipReason: options.skipReason,
});

const createSkippedTestCase = (format: InputFormat, reason: string): LoaderTestCase =>
  createCubeTestCase(format, { skip: true, skipReason: reason });

// ===============================
// Test Configuration Registry
// ===============================

const loaderTestCases: LoaderTestCase[] = [
  // GLTF/GLB Family
  createCubeTestCase('gltf', { structure: 'groupWithMesh' }),
  createCubeTestCase('glb', { structure: 'groupWithMesh' }),
  createCubeTestCase('glb', { variant: 'draco', structure: 'groupWithMesh' }),
  createCubeTestCase('glb', { variant: 'materials', structure: 'groupWithMesh', geometry:
    createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 24,
      faceCount: 8,
      boundingBox: {
        size: [2201.2575245420862, 2000, 2201.2575245420862],
        center: [0, 1, 0],
      },
    })
   }),
  createCubeTestCase('glb', { variant: 'animations', structure: 'groupWithMesh', geometry:
    createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 24,
      faceCount: 8,
      boundingBox: {
        size: [2201.2575245420862, 2000, 2201.2575245420862],
        center: [0, 1, 0],
      },
    })
   }),
  createCubeTestCase('glb', { variant: 'textures', structure: 'groupWithObject3D', skip: true, skipReason: 'GLTF texture loading does not work in Node.js yet.' }),
  createCubeTestCase('gltf', { variant: 'draco', structure: 'groupWithMesh' }),

  createCubeTestCase('stl', { variant: 'binary', structure: 'groupWithObject3D' }),
  createCubeTestCase('stl', { variant: 'ascii', structure: 'groupWithObject3D' }),

  createCubeTestCase('obj', { structure: 'groupWithObject3D' }),
  {
    format: 'obj',
    files: ['cube-materials.obj', 'cube-materials.mtl'],
    description: 'OBJ with MTL material file',
    geometry: STANDARD_CUBE_GEOMETRY,
    structure: {
      type: 'Group',
      children: [{ type: 'Object3D' }],
    },
  },

  createCubeTestCase('ply', { variant: 'binary', structure: 'groupWithMesh' }),
  createCubeTestCase('ply', { variant: 'ascii', structure: 'groupWithMesh' }),

  createCubeTestCase('fbx', { variant: 'binary', structure: 'groupWithObject3D' }),
  createCubeTestCase('fbx', { variant: 'ascii', structure: 'groupWithObject3D' }),
  createCubeTestCase('fbx', { variant: 'animations', structure: 'groupWithObject3D', geometry:
    createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      boundingBox: {
        center: [0, 1, 0],
      },
    })
   }),
  createCubeTestCase('fbx', { variant: 'textures', structure: 'groupWithObject3D', skip: true, skipReason: 'GLTF texture loading does not work in Node.js yet.' }),

  createCubeTestCase('wrl', { structure: 'groupWithMesh' }),
  createCubeTestCase('x3dv', { structure: 'groupWithMesh' }),

  createCubeTestCase('dae', { structure: 'groupWithObject3D' }),

  createCubeTestCase('usdz', { structure: 'groupWithObject3D' }),
  createCubeTestCase('usda', { structure: 'groupWithObject3D' }),
  createCubeTestCase('usdc', { structure: 'groupWithObject3D' }),
  createCubeTestCase('usdz', { variant: 'materials', structure: 'groupWithObject3D' }),
  createCubeTestCase('usdz', { variant: 'textures', structure: 'groupWithObject3D', skip: true, skipReason: 'GLTF texture loading does not work in Node.js yet.' }),

  createCubeTestCase('3ds', { structure: 'groupWithObject3D' }),

  createCubeTestCase('amf', { structure: 'groupWithObject3D' }),
  createCubeTestCase('lwo', { structure: 'groupWithObject3D' }),

  createCubeTestCase('x3d', { structure: 'groupWithObject3D' }),
  createSkippedTestCase('x3db', 'X3DB (binary) loader is not implemented yet.'),

  createCubeTestCase('xgl', { structure: 'groupWithObject3D' }),

  createCubeTestCase('ifc', { variant: 'freecad', structure: 'groupWithObject3D' }),
  createCubeTestCase('ifc', { variant: 'blender', structure: 'groupWithObject3D' }),

  createCubeTestCase('ase', { structure: 'groupWithObject3D' }),

  createCubeTestCase('off', { structure: 'groupWithMesh' }),

  createCubeTestCase('x', { structure: 'groupWithMesh' }),

  createCubeTestCase('smd', { structure: 'groupWithObject3D', skip: true, skipReason: 'SMD loader depends on GLTF image loading, which is not supported in Node.js.' }),

  createCubeTestCase('md5mesh', { structure: 'groupWithObject3D' }),

  createCubeTestCase('ac', { structure: 'groupWithObject3D' }),

  createCubeTestCase('nff', { structure: 'groupWithObject3D' }),

  createCubeTestCase('ogex', { structure: 'groupWithObject3D' }),
  createCubeTestCase('mesh.xml', { structure: 'groupWithMesh' }),

  createCubeTestCase('cob', { structure: 'groupWithObject3D' }),

  createCubeTestCase('drc', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 24,
      faceCount: 8
    }),
    structure: { type: 'Mesh' },
  }),

  createCubeTestCase('dxf', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 72,
      faceCount: 24
    }),
    structure: 'groupWithMesh'
  }),

  createCubeTestCase('vox', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 144,
      faceCount: 48
    }),
    structure: 'groupWithMesh'
  }),

  createCubeTestCase('3mf', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      boundingBox: { center: [0, -1, 0] }
    }),
    structure: 'groupWithObject3D'
  }),

  createCubeTestCase('vtk', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 8,
      faceCount: 3,
      facePoints: 4
    }),
    structure: { type: 'Mesh' }
  }),

  createCubeTestCase('vtp', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 8,
      faceCount: 3,
      facePoints: 4
    }),
    structure: { type: 'Mesh' },
    skip: true,
    skipReason: 'VTP loader currently requires DOM parser, which is not available in Node.js.'
  }),

  createCubeTestCase('3dm', { variant: 'mesh' }),
  createCubeTestCase('3dm', { variant: 'brep', skip: true, skipReason: 'BREP geometry is not supported for conversion.' }),
  createCubeTestCase('3dm', { variant: 'extrusion', skip: true, skipReason: 'Extrusion geometry is not supported for conversion.' }),
  {
    format: '3dm',
    variant: 'instance',
    async dataSource() {
      const { createCubeInstanceFixture } = await import('#fixtures/rhino3dm/cube-instance.js');
      return createCubeInstanceFixture();
    },
    description: 'Multiple instanced cubes from programmatic 3DM',
    geometry: {
      vertexCount: 180,
      faceCount: 60,
      meshCount: 5,
      boundingBox: { size: [12, 7, 2], center: [5, 2.5, 1] },
    },
    structure: {
      type: 'Group',
      children: Array(5).fill({ type: 'Mesh', name: 'TestCube' }),
    },
  },

  createCubeTestCase('bvh', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 120,
      faceCount: 40,
      boundingBox: {
        size: [2.482842803001404, 2.4000000953674316, 2.400000050663948],
        center: [-0.041421353816986084, 0, 1]
      }
    }),
    structure: {
      type: 'Group',
      children: [{ type: 'Bone' }]
    }
  }),

  createCubeTestCase('step', {
    geometry: STEP_CUBE_GEOMETRY,
    structure: 'groupWithMesh'
  }),
  createCubeTestCase('stp', {
    geometry: STEP_CUBE_GEOMETRY,
    structure: 'groupWithMesh'
  }),
  createCubeTestCase('iges', {
    variant: 'mesh',
    geometry: STEP_CUBE_GEOMETRY,
    structure: 'groupWithMesh',
  }),
  createCubeTestCase('igs', {
    variant: 'mesh',
    geometry: STEP_CUBE_GEOMETRY,
    structure: 'groupWithMesh',
  }),
  createCubeTestCase('iges', {
    variant: 'brep',
    geometry: { ...STEP_CUBE_GEOMETRY, meshCount: 6, facePoints: 4 },
    structure: {
      type: 'Group',
      children: [
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
      ],
    }
  }),
  createCubeTestCase('igs', {
    variant: 'brep',
    geometry: { ...STEP_CUBE_GEOMETRY, meshCount: 6, facePoints: 4 },
    structure: {
      type: 'Group',
      children: [
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
        { type: 'Mesh' },
      ],
    }
  }),
  createCubeTestCase('brep', { geometry: STEP_CUBE_GEOMETRY, structure: 'groupWithMesh' }),

  // ========================================================================
  // UNSUPPORTED FORMATS
  // ========================================================================

  // Tested but invalid formats
  createSkippedTestCase('blend', 'BLEND loader does not support latest Blender file format.'),
  createSkippedTestCase('kmz', 'KMZ loader currently requires DOM parser, which is not available in Node.js.'),
  
  // Fixtures not available
  createSkippedTestCase('md2', 'MD2 fixture is not available.'),

  // TODO formats
  createSkippedTestCase('dwg', 'Autocad .dwg files are not implemented yet.'),
  createSkippedTestCase('gdf', 'Graphics Data Format .gdf files are not implemented yet.'),
  createSkippedTestCase('gts', 'GNU Triangulated Surface .gts files are not implemented yet.'),
  createSkippedTestCase('inc', 'Include .inc files are not implemented yet.'),
  createSkippedTestCase('ldr', 'LEGO Digital Designer .ldr files are not implemented yet.'),
  createSkippedTestCase('pdb', 'Protein Data Bank .pdb files are not implemented yet.'),
  createSkippedTestCase('udo', 'User Defined Object .udo files are not implemented yet.'),
  createSkippedTestCase('xaml', 'Extensible Application Markup Language .xaml files are not implemented yet.'),

  // Proprietary formats
  createSkippedTestCase('max', '3ds Max loader is not implemented yet.'),
  createSkippedTestCase('shapr', 'Shapr3D loader is not implemented yet.'),
  createSkippedTestCase('skp', 'SketchUp .skp files are not implemented yet.'),
  createSkippedTestCase('sldprt', 'SolidWorks loader is not implemented yet.'),
  createSkippedTestCase('x_t', 'Parasolid loader is not implemented yet.'),
];

// ============================================================================
// Main Test Suite
// ============================================================================

describe('threejs-import', () => {
  const utils = createThreeTestUtils();

  for (const testCase of loaderTestCases) {
    const describeFunction = testCase.skip ? describe.skip : describe;
    const variantDescription = testCase.variant ? ` (${testCase.variant})` : '';
    const skipDescription = testCase.skip ? ` [SKIPPED]: ${testCase.skipReason}` : '';

    describeFunction(`'${testCase.format}' loader${variantDescription}${skipDescription}`, () => {
      let object3d: Object3D;

      beforeEach(async () => {
        if (testCase.skip) return;

        const files = await loadTestData(testCase);
        object3d = await importThreeJs(files, testCase.format);
      });

      it(`should successfully import ${testCase.description ?? testCase.fixtureName}`, () => {
        expect(object3d).toBeDefined();
      });

      // Geometry tests
      if (testCase.geometry) {
        const geometryHelpers = utils.createGeometryTestHelpers();

        it('should have correct vertex count', () => {
          geometryHelpers.expectVertexCount(object3d, testCase.geometry!.vertexCount);
        });

        it('should have correct face count', () => {
          geometryHelpers.expectFaceCount(object3d, testCase.geometry!.faceCount);
        });

        it('should have correct mesh count', () => {
          geometryHelpers.expectMeshCount(object3d, testCase.geometry!.meshCount);
        });

        it('should have correct bounding box size', () => {
          geometryHelpers.expectBoundingBoxSize(object3d, testCase.geometry!.boundingBox.size, testCase.geometry!.boundingBox.tolerance);
        });

        it('should have correct bounding box center', () => {
          geometryHelpers.expectBoundingBoxCenter(object3d, testCase.geometry!.boundingBox.center, testCase.geometry!.boundingBox.tolerance);
        });
      }

      // Structure tests
      if (testCase.structure) {
        const structureHelpers = utils.createStructureTestHelpers();

        it('should have correct object type', () => {
          structureHelpers.expectObjectType(object3d, testCase.structure!.type);
        });

        if (testCase.structure.name !== undefined) {
          it('should have correct object name', () => {
            structureHelpers.expectObjectName(object3d, testCase.structure!.name!);
          });
        }

        if (testCase.structure.children !== undefined) {
          it('should have correct number of children', () => {
            structureHelpers.expectChildrenCount(object3d, testCase.structure!.children!.length);
          });

          for (const [index, childExpectation] of testCase.structure.children.entries()) {
            it(`should have correct child structure at index ${index}`, () => {
              structureHelpers.expectChildAtIndex(object3d, index, childExpectation as StructureExpectation);
            });
          }
        }
      }

      // Validation tests
      it('should produce consistent results across multiple imports', async () => {
        const files = await loadTestData(testCase);
        const object3d2 = await importThreeJs(files, testCase.format);
        const signature1 = utils.createGeometrySignature(object3d);
        const signature2 = utils.createGeometrySignature(object3d2);

        expect(signature1).toEqual(signature2);
      });

      it('should have valid mesh position attributes', () => {
        let hasValidMesh = false;
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            hasValidMesh = true;
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');
            expect(position).toBeDefined();
          }
        });
        expect(hasValidMesh).toBe(true);
      });

      it('should have positive vertex counts in meshes', () => {
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');
            expect(position.count).toBeGreaterThan(0);
          }
        });
      });

      it('should have properly triangulated mesh geometry', () => {
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');
            const facePoints = testCase.geometry?.facePoints ?? 3;
            expect(position.count % facePoints).toBe(0);
          }
        });
      });

      it('should have finite coordinate values', () => {
        object3d.traverse((child) => {
          if (child instanceof Mesh) {
            const geometry = child.geometry as BufferGeometry;
            const position = geometry.getAttribute('position');

            for (const value of position.array) {
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        });
      });
    });
  }

  // Meta tests
  describe('skipped loaders', () => {
    const skippedTestCases = loaderTestCases.filter((tc) => tc.skip);
    for (const testCase of skippedTestCases) {
      it(`should skip ${testCase.format} loader${testCase.variant ? ` (${testCase.variant})` : ''}: ${testCase.skipReason}`, () => {
        expect(testCase.skip).toBe(true);
      });
    }
  });

  it('should test all declared formats', () => {
    const enabledFormats = loaderTestCases.map((tc) => tc.format);
    const declaredFormats = threejsImportFomats;

    expect([...new Set(enabledFormats)].sort()).toEqual([...new Set(declaredFormats)].sort());
  });

  it('should throw error when primary file is missing', async () => {
    // Test with a file that doesn't match the expected format (using DRC format which uses findPrimaryFile directly)
    const wrongFiles = [{
      name: 'test.txt',
      data: new Uint8Array([1, 2, 3])
    }];

    await expect(importThreeJs(wrongFiles, 'drc')).rejects.toThrow('No .DRC file found in file set');
  });

  it('should throw error when file array is empty', async () => {
    // Test with 3DM format which uses findPrimaryFile directly
    await expect(importThreeJs([], '3dm')).rejects.toThrow('No .3DM file found in file set');
  });
});
