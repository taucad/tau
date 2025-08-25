import { describe, expect, it, beforeEach } from 'vitest';
import type { InspectReport } from '@gltf-transform/functions';
import type { InputFormat } from '#types.js';
import { importFiles, supportedImportFomats } from '#import.js';
import { createInspectTestUtils, loadTestData, createGeometryVariant, validateGlbData } from '#test.utils.js';
import type { LoaderTestCase, GeometryExpectation } from '#test.utils.js';
import { getInspectReport, type GltfSceneStructure } from '#gltf.utils.js';

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

const OPTIMIZED_CUBE_GEOMETRY: GeometryExpectation = {
  vertexCount: 24,
  faceCount: 8,
  meshCount: 1,
  boundingBox: {
    size: [2, 2, 2],
    center: [0, 0, 1],
  },
};

const GLTF_SCENE_PATTERNS = {
  // Container node with mesh child (most common pattern)
  containerWithMeshChild: {
    rootNodes: [{
      type: 'ContainerNode',
      children: [{ type: 'MeshNode' }]
    }]
  },
  // Direct mesh (simple formats)
  directMesh: {
    rootNodes: [{
      type: 'MeshNode'
    }]
  },
} as const;

// Factory functions for common test patterns
const createCubeTestCase = (
  format: InputFormat,
  options: {
    variant?: LoaderTestCase['variant'];
    geometry?: GeometryExpectation;
    structure?: keyof typeof GLTF_SCENE_PATTERNS | GltfSceneStructure;
    skip?: boolean;
    skipReason?: string;
    fixtureName?: string;
    dataSource?: () => Promise<Uint8Array>;
  } = {},
): LoaderTestCase => ({
  format: format,
  variant: options.variant,
  fixtureName: options.fixtureName ?? `cube${options.variant ? `-${options.variant}` : ''}.${format}`,
  dataSource: options.dataSource,
  description: `Simple cube from ${format.toUpperCase()} format${options.variant ? ` (${options.variant})` : ''}`,
  geometry: options.geometry ?? STANDARD_CUBE_GEOMETRY,
  structure: options.structure
    ? typeof options.structure === 'string'
      ? (GLTF_SCENE_PATTERNS[options.structure] as unknown as GltfSceneStructure)
      : options.structure
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
  // GLTF/GLB Family - direct mesh at root level
  createCubeTestCase('gltf', { structure: 'directMesh' }),
  createCubeTestCase('glb', { structure: 'directMesh' }),
  createCubeTestCase('glb', { variant: 'draco', structure: 'directMesh', geometry: OPTIMIZED_CUBE_GEOMETRY  }),
  createCubeTestCase('glb', {
    variant: 'materials',
    structure: 'directMesh',
    geometry: createGeometryVariant(OPTIMIZED_CUBE_GEOMETRY, {
      boundingBox: {
        size: [2201.25752, 2000, 2201.25752],
        center: [0, 1, 0],
      },
    }),
  }),
  createCubeTestCase('glb', {
    variant: 'animations',
    structure: 'directMesh',
    geometry: createGeometryVariant(OPTIMIZED_CUBE_GEOMETRY, {
      boundingBox: {
        size: [2201.25752, 2000, 2201.25752],
        center: [0, 1, 0],
      },
    }),
  }),
  createCubeTestCase('glb', {
    variant: 'textures',
    structure: 'directMesh',
    geometry: createGeometryVariant(OPTIMIZED_CUBE_GEOMETRY, {
      boundingBox: {
        size: [2000, 2000, 2000],
        center: [0, 1, 0],
      },
    }),
  }),
  createCubeTestCase('gltf', { variant: 'draco', structure: 'directMesh', geometry: OPTIMIZED_CUBE_GEOMETRY }),

  createCubeTestCase('stl', { variant: 'binary', structure: 'containerWithMeshChild' }),
  createCubeTestCase('stl', { variant: 'ascii', structure: 'containerWithMeshChild' }),

  createCubeTestCase('obj', { structure: 'containerWithMeshChild' }),
  {
    format: 'obj',
    files: ['cube-materials.obj', 'cube-materials.mtl'],
    description: 'OBJ with MTL material file',
    geometry: STANDARD_CUBE_GEOMETRY,
    structure: {
      rootNodes: [{
        type: 'ContainerNode',
        children: [{ type: 'MeshNode' }]
      }]
    },
  },

  createCubeTestCase('ply', { variant: 'binary', structure: 'directMesh' }),
  createCubeTestCase('ply', { variant: 'ascii', structure: 'directMesh' }),

  // FBX binary/ascii create complex nested structures - skip structure validation
  createCubeTestCase('fbx', { variant: 'binary' }),
  createCubeTestCase('fbx', { variant: 'ascii' }),
  createCubeTestCase('fbx', {
    variant: 'animations',
    structure: 'containerWithMeshChild',
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      boundingBox: {
        center: [0, 1, 0],
      },
    }),
  }),
  createCubeTestCase('fbx', {
    variant: 'textures',
    structure: 'containerWithMeshChild',
    skip: true,
    skipReason: 'GLTF texture loading does not work in Node.js yet.',
  }),

  createCubeTestCase('wrl', { structure: 'directMesh' }),
  createCubeTestCase('x3dv', { structure: 'directMesh' }),

  // DAE creates complex multi-mesh structures - skip structure validation
  createCubeTestCase('dae', {}),
  createCubeTestCase('dae', {
    variant: 'millimeters',
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      // This is incorrect - the Assimp DAE loader should be accounting for the unit scaling.
      // TODO: fix this in the Assimp DAE loader.
      boundingBox: {
        size: [0.002, 0.002, 0.002],
        center: [0, 0, 0.001],
      },
    }),
  }),

  // USD formats create complex multi-mesh structures - skip structure validation
  createCubeTestCase('usdz', {}),
  createCubeTestCase('usda', {}),
  createCubeTestCase('usdc', {}),
  createCubeTestCase('usdz', { variant: 'materials' }),
  createCubeTestCase('usdz', {
    variant: 'textures',
    skip: true,
    skipReason: 'GLTF texture loading does not work in Node.js yet.',
  }),

  // 3DS creates complex multi-mesh structures - skip structure validation  
  createCubeTestCase('3ds', {}),

  createCubeTestCase('amf', { structure: 'containerWithMeshChild' }),
  createCubeTestCase('lwo', { structure: 'containerWithMeshChild' }),

  createCubeTestCase('x3d', {
    structure: {
      rootNodes: [{
        type: 'ContainerNode',
        children: [{
          type: 'ContainerNode',
          children: [{ type: 'MeshNode' }]
        }]
      }]
    },
  }),
  createSkippedTestCase('x3db', 'X3DB (binary) loader is not implemented yet.'),

  createCubeTestCase('xgl', { structure: 'containerWithMeshChild' }),

  createCubeTestCase('ifc', {
    variant: 'freecad',
    structure: {
      rootNodes: [{
        type: 'ContainerNode',
        children: [{
          type: 'ContainerNode',
          children: [{
            type: 'ContainerNode',
            children: [{ type: 'MeshNode' }]
          }]
        }]
      }]
    },
  }),
  createCubeTestCase('ifc', {
    variant: 'blender',
    structure: {
      rootNodes: [{
        type: 'ContainerNode',
        children: [{
          type: 'ContainerNode',
          children: [{
            type: 'ContainerNode',
            children: [{
              type: 'ContainerNode',
              children: [{ type: 'MeshNode' }]
            }]
          }]
        }]
      }]
    },
  }),

  createCubeTestCase('ase', {
    structure: {
      rootNodes: [{
        type: 'ContainerNode',
        children: [{
          type: 'ContainerNode',
          children: [{ type: 'MeshNode' }]
        }]
      }]
    },
  }),

  createCubeTestCase('off', { structure: 'directMesh' }),

  createCubeTestCase('x', { structure: 'directMesh' }),

  createCubeTestCase('smd', {
    structure: {
      rootNodes: [{
        type: 'ContainerNode',
        children: [{ type: 'ContainerNode' }]
      }]
    },
    skip: true,
    skipReason: 'SMD loader depends on GLTF image loading, which is not supported in Node.js.',
  }),

  // MD5MESH creates complex skeletal animation structures - skip structure validation
  createCubeTestCase('md5mesh', {}),

  createCubeTestCase('ac', { structure: 'containerWithMeshChild' }),

  createCubeTestCase('nff', { structure: 'containerWithMeshChild' }),

  createCubeTestCase('ogex', { structure: 'containerWithMeshChild' }),
  createCubeTestCase('mesh.xml', { structure: 'directMesh' }),

  createCubeTestCase('cob', { structure: 'containerWithMeshChild' }),

  createCubeTestCase('drc', {
    geometry: OPTIMIZED_CUBE_GEOMETRY,
    structure: { 
      rootNodes: [{ type: 'MeshNode' }]
    },
  }),

  createCubeTestCase('dxf', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 72,
      faceCount: 24,
    }),
    structure: 'directMesh',
  }),

  createCubeTestCase('3mf', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      boundingBox: { center: [0, -1, 0] },
    }),
    structure: 'containerWithMeshChild',
  }),


  createCubeTestCase('3dm', {
    variant: 'mesh',
    structure: 'directMesh',
  }),
  createCubeTestCase('3dm', {
    variant: 'brep',
    skip: true,
    skipReason: 'BREP geometry requires Rhino compute service for conversion',
  }),
  createCubeTestCase('3dm', {
    variant: 'extrusion',
    skip: true,
    skipReason: 'Extrusion geometry requires Rhino compute service for meshing',
  }),
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
      rootNodes: [
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
      ]
    },
  },

  createCubeTestCase('bvh', {
    geometry: createGeometryVariant(STANDARD_CUBE_GEOMETRY, {
      vertexCount: 120,
      faceCount: 40,
      boundingBox: {
        size: [2.48284, 2.4, 2.4],
        center: [-0.04142, 0, 2],
      },
    }),
    structure: {
      rootNodes: [{
        type: 'SkinNode',
        children: [{
          type: 'ContainerNode',
          children: [{
            type: 'ContainerNode',
            children: [{
              type: 'ContainerNode',
              children: [{
                type: 'ContainerNode',
                children: [{
                  type: 'ContainerNode',
                  children: [{
                    type: 'ContainerNode',
                    children: [{
                      type: 'ContainerNode',
                      children: [{
                        type: 'ContainerNode',
                        children: [{ type: 'ContainerNode' }] // BVH creates 10-level deep skeletal hierarchy
                      }]
                    }]
                  }]
                }]
              }]
            }]
          }]
        }]
      }]
    },
  }),

  createCubeTestCase('step', {
    geometry: OPTIMIZED_CUBE_GEOMETRY,
    structure: 'directMesh',
  }),
  createCubeTestCase('stp', {
    geometry: OPTIMIZED_CUBE_GEOMETRY,
    structure: 'directMesh',
  }),
  createCubeTestCase('iges', {
    variant: 'mesh',
    geometry: OPTIMIZED_CUBE_GEOMETRY,
    structure: 'directMesh',
  }),
  createCubeTestCase('igs', {
    variant: 'mesh',
    geometry: OPTIMIZED_CUBE_GEOMETRY,
    structure: 'directMesh',
  }),
  createCubeTestCase('iges', {
    variant: 'brep',
    geometry: { ...OPTIMIZED_CUBE_GEOMETRY, meshCount: 6, facePoints: 4 },
    // Skip structure validation for complex BREP - has 6 separate mesh root nodes
    skip: false,
  }),
  createCubeTestCase('igs', {
    variant: 'brep',
    geometry: { ...OPTIMIZED_CUBE_GEOMETRY, meshCount: 6, facePoints: 4 },
    // Skip structure validation for complex BREP - has complex multi-mesh structure  
    skip: false,
  }),
  createCubeTestCase('brep', { geometry: OPTIMIZED_CUBE_GEOMETRY, structure: 'directMesh' }),

  // ========================================================================
  // UNSUPPORTED FORMATS
  // ========================================================================

  createSkippedTestCase('md2', 'MD2 fixture is not available.'),
];

// ============================================================================
// Main Test Suite
// ============================================================================

describe('importFiles', () => {
  const utils = createInspectTestUtils();

  for (const testCase of loaderTestCases) {
    const describeFunction = testCase.skip ? describe.skip : describe;
    const variantDescription = testCase.variant ? ` (${testCase.variant})` : '';
    const skipDescription = testCase.skip ? ` [SKIPPED]: ${testCase.skipReason}` : '';

    describeFunction(`'${testCase.format}' loader${variantDescription}${skipDescription}`, () => {
      let glbData: Uint8Array;
      let inspectReport: InspectReport;

      beforeEach(async () => {
        if (testCase.skip) {
          return;
        }

        const files = await loadTestData(testCase);
        glbData = await importFiles(files, testCase.format);
        inspectReport = await getInspectReport(glbData);
      });

      it(`should successfully import ${testCase.description ?? testCase.fixtureName}`, () => {
        expect(inspectReport).toBeDefined();
        expect(inspectReport.meshes.properties.length).toBeGreaterThan(0);
      });

      it('should return valid GLB data', () => {
        validateGlbData(glbData);
      });

      // Geometry tests
      if (testCase.geometry) {
        const geometryHelpers = utils.createGeometryTestHelpers();

        it('should have correct vertex count', () => {
          geometryHelpers.expectVertexCount(inspectReport, testCase.geometry!.vertexCount);
        });

        it('should have correct face count', () => {
          geometryHelpers.expectFaceCount(inspectReport, testCase.geometry!.faceCount);
        });

        it('should have correct mesh count', () => {
          geometryHelpers.expectMeshCount(inspectReport, testCase.geometry!.meshCount);
        });

        it('should have correct bounding box size', () => {
          geometryHelpers.expectBoundingBoxSize(
            inspectReport,
            testCase.geometry!.boundingBox.size,
            testCase.geometry!.boundingBox.tolerance,
          );
        });

        it('should have correct bounding box center', () => {
          geometryHelpers.expectBoundingBoxCenter(
            inspectReport,
            testCase.geometry!.boundingBox.center,
            testCase.geometry!.boundingBox.tolerance,
          );
        });
      }

      // Structure tests - restored full validation using Document API
      if (testCase.structure) {
        const structureHelpers = utils.createStructureTestHelpers();

        it('should have correct number of root nodes', async () => {
          await structureHelpers.expectRootNodeCount(glbData, testCase.structure!.rootNodes.length);
        });

        it('should have correct overall GLTF structure', async () => {
          await structureHelpers.expectFullStructure(glbData, testCase.structure!);
        });

        // Additional validation for mesh-level checks
        it('should have correct mesh count from structure', () => {
          if (testCase.geometry) {
            structureHelpers.expectMeshCount(inspectReport, testCase.geometry.meshCount);
          }
        });

        it('should have position attributes', () => {
          structureHelpers.expectHasPositionAttribute(inspectReport);
        });
      }

      // Validation tests
      it('should produce consistent results across multiple imports', async () => {
        const files = await loadTestData(testCase);
        const glbData2 = await importFiles(files, testCase.format);
        const inspectReport2 = await getInspectReport(glbData2);
        const signature1 = utils.createInspectSignature(inspectReport);
        const signature2 = utils.createInspectSignature(inspectReport2);

        expect(signature1).toEqual(signature2);
      });

      it('should have valid mesh position attributes', () => {
        expect(inspectReport.meshes.properties.length).toBeGreaterThan(0);
        const structureHelpers = utils.createStructureTestHelpers();
        structureHelpers.expectHasPositionAttribute(inspectReport);
      });

      it('should have positive vertex counts in meshes', () => {
        for (const mesh of inspectReport.meshes.properties) {
          expect(mesh.vertices).toBeGreaterThan(0);
        }
      });

      it('should have properly triangulated mesh geometry', () => {
        const facePoints = testCase.geometry?.facePoints ?? 3;
        for (const mesh of inspectReport.meshes.properties) {
          expect(mesh.vertices % facePoints).toBe(0);
        }
      });

      it('should have finite coordinate values', () => {
        // Validate finite values through bounding box presence
        if (inspectReport.scenes.properties.length > 0) {
          const scene = inspectReport.scenes.properties[0]!;
          if (scene.bboxMax && scene.bboxMin) {
            for (const value of [...scene.bboxMax, ...scene.bboxMin]) {
              expect(Number.isFinite(value)).toBe(true);
            }
          }
        }
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
    const declaredFormats = supportedImportFomats;

    expect([...new Set(enabledFormats)].sort()).toEqual([...new Set(declaredFormats)].sort());
  });

  it('should throw error when primary file is missing', async () => {
    // Test with a file that doesn't match the expected format (using DRC format which uses findPrimaryFile directly)
    const wrongFiles = [
      {
        name: 'test.txt',
        data: new Uint8Array([1, 2, 3]),
      },
    ];

    await expect(importFiles(wrongFiles, 'drc')).rejects.toThrow('No .DRC file found in file set');
  });

  it('should throw error when file array is empty', async () => {
    // Test with 3DM format which uses findPrimaryFile directly
    await expect(importFiles([], '3dm')).rejects.toThrow('No .3DM file found in file set');
  });
});
