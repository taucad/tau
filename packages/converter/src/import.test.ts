import { describe, expect, it, beforeEach } from 'vitest';
import type { InspectReport } from '@gltf-transform/functions';
import type { SupportedImportFormat } from '#import.js';
import { importFiles, supportedImportFormats } from '#import.js';
import { createInspectTestUtils, loadTestData, loadFixture, createGeometryVariant } from '#test.utils.js';
import type { LoaderTestCase, GeometryExpectation } from '#test.utils.js';
import { getInspectReport, validateGlbData } from '#gltf.utils.js';
import type { GltfSceneStructure } from '#gltf.utils.js';
import type { FileResolver } from '#file-resolver.js';

// ============================================================================
// Test Case Templates & Factories
// ============================================================================

/**
 * Standard cube from the plain gltf/glb fixtures (2mm / 0.002m cubes).
 * Converter now outputs spec-compliant glTF: Y-up, meters.
 */
const standardCubeGeometry: GeometryExpectation = {
  vertexCount: 36,
  faceCount: 12,
  meshCount: 1,
  boundingBox: {
    size: [0.002, 0.002, 0.002],
    center: [0, 0.001, 0],
  },
};

/**
 * Optimized cube (Draco / OCCT) at 2m scale.
 * Converter now outputs spec-compliant glTF: Y-up, meters.
 */
const optimizedCubeGeometry: GeometryExpectation = {
  vertexCount: 24,
  faceCount: 8,
  meshCount: 1,
  boundingBox: {
    size: [2, 2, 2],
    center: [0, 1, 0],
  },
};

/**
 * Assimp cube fixtures whose source file has the cube sitting on the ground plane
 * (e.g. STL/OBJ/PLY/FBX with min-Y=0, max-Y=2). After any Z-to-Y normalization
 * the center lands at [0, 1, 0].
 */
const assimpCubeGeometry: GeometryExpectation = {
  vertexCount: 36,
  faceCount: 12,
  meshCount: 1,
  boundingBox: {
    size: [2, 2, 2],
    center: [0, 1, 0],
  },
};

const gltfScenePatterns = {
  // Container node with mesh child (most common pattern)
  containerWithMeshChild: {
    rootNodes: [
      {
        type: 'ContainerNode',
        children: [{ type: 'MeshNode' }],
      },
    ],
  },
  // Direct mesh (simple formats)
  directMesh: {
    rootNodes: [
      {
        type: 'MeshNode',
      },
    ],
  },
} as const;

// Factory functions for common test patterns
const createCubeTestCase = (
  format: SupportedImportFormat,
  options: {
    variant?: LoaderTestCase['variant'];
    geometry?: GeometryExpectation;
    structure?: keyof typeof gltfScenePatterns | GltfSceneStructure;
    skip?: boolean;
    skipReason?: string;
    fixtureName?: string;
    dataSource?: () => Promise<Uint8Array<ArrayBuffer>>;
  } = {},
): LoaderTestCase => ({
  format,
  variant: options.variant,
  fixtureName: options.fixtureName ?? `cube${options.variant ? `-${options.variant}` : ''}.${format}`,
  dataSource: options.dataSource,
  description: `Simple cube from ${format.toUpperCase()} format${options.variant ? ` (${options.variant})` : ''}`,
  geometry: options.geometry ?? standardCubeGeometry,
  structure: options.structure
    ? typeof options.structure === 'string'
      ? (gltfScenePatterns[options.structure] as unknown as GltfSceneStructure)
      : options.structure
    : undefined,
  skip: options.skip,
  skipReason: options.skipReason,
});

const createSkippedTestCase = (format: SupportedImportFormat, reason: string): LoaderTestCase =>
  createCubeTestCase(format, { skip: true, skipReason: reason });

// ===============================
// Test Configuration Registry
// ===============================

const loaderTestCases: LoaderTestCase[] = [
  // GLTF/GLB Family - direct mesh at root level
  createCubeTestCase('gltf', { structure: 'directMesh' }),
  createCubeTestCase('glb', { structure: 'directMesh' }),
  createCubeTestCase('glb', {
    variant: 'draco',
    geometry: optimizedCubeGeometry,
    structure: 'directMesh',
  }),
  createCubeTestCase('glb', {
    variant: 'materials',
    structure: 'directMesh',
    geometry: createGeometryVariant(optimizedCubeGeometry, {
      boundingBox: {
        size: [2.201_26, 2, 2.201_26],
        tolerance: 0.001,
      },
    }),
  }),
  createCubeTestCase('glb', {
    variant: 'animations',
    structure: 'directMesh',
    geometry: createGeometryVariant(optimizedCubeGeometry, {
      boundingBox: {
        size: [2.201_26, 2, 2.201_26],
        tolerance: 0.001,
      },
    }),
  }),
  createCubeTestCase('glb', {
    variant: 'textures',
    geometry: optimizedCubeGeometry,
    structure: 'directMesh',
  }),
  createCubeTestCase('gltf', {
    variant: 'draco',
    geometry: optimizedCubeGeometry,
    structure: 'directMesh',
  }),
  {
    format: 'gltf',
    files: ['cube-bin.gltf', 'cube-bin.bin'],
    description: 'GLTF with external binary file',
    geometry: optimizedCubeGeometry,
    structure: {
      rootNodes: [
        {
          type: 'MeshNode',
          name: 'Cube',
        },
      ],
    },
  },
  {
    format: 'gltf',
    files: ['cube-draco-bin.gltf', 'cube-draco-bin.bin'],
    description: 'Draco-compressed GLTF with external binary file',
    geometry: optimizedCubeGeometry,
    structure: {
      rootNodes: [
        {
          type: 'MeshNode',
          name: 'Cube',
        },
      ],
    },
  },

  createCubeTestCase('stl', { variant: 'binary', geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),
  createCubeTestCase('stl', { variant: 'ascii', geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),

  createCubeTestCase('obj', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),
  {
    format: 'obj',
    files: ['cube-materials.obj', 'cube-materials.mtl'],
    description: 'OBJ with MTL material file',
    geometry: assimpCubeGeometry,
    structure: {
      rootNodes: [
        {
          type: 'ContainerNode',
          children: [{ type: 'MeshNode' }],
        },
      ],
    },
  },

  createCubeTestCase('ply', { variant: 'binary', geometry: assimpCubeGeometry, structure: 'directMesh' }),
  createCubeTestCase('ply', { variant: 'ascii', geometry: assimpCubeGeometry, structure: 'directMesh' }),

  // FBX binary/ascii create complex nested structures - skip structure validation
  createCubeTestCase('fbx', { variant: 'binary', geometry: assimpCubeGeometry }),
  createCubeTestCase('fbx', { variant: 'ascii', geometry: assimpCubeGeometry }),
  createCubeTestCase('fbx', {
    variant: 'animations',
    geometry: assimpCubeGeometry,
    structure: 'containerWithMeshChild',
  }),
  createCubeTestCase('fbx', {
    variant: 'textures',
    geometry: assimpCubeGeometry,
    structure: 'containerWithMeshChild',
    skip: true,
    skipReason: 'GLTF texture loading does not work in Node.js yet.',
  }),

  createCubeTestCase('wrl', { geometry: assimpCubeGeometry, structure: 'directMesh' }),
  createCubeTestCase('x3dv', { geometry: assimpCubeGeometry, structure: 'directMesh' }),

  // DAE creates complex multi-mesh structures - skip structure validation
  createCubeTestCase('dae', { geometry: assimpCubeGeometry }),
  createCubeTestCase('dae', {
    variant: 'millimeters',
    geometry: createGeometryVariant(assimpCubeGeometry, {
      // Assimp DAE loader bakes unit scaling into root transform but does not
      // rescale vertex data, so the cube appears at millimeter scale.
      boundingBox: {
        size: [0.002, 0.002, 0.002],
        center: [0, 0.001, 0],
      },
    }),
  }),

  // USD formats — Assimp's tinyusdz behavior varies by file type
  createCubeTestCase('usdz', { geometry: assimpCubeGeometry }),
  createCubeTestCase('usda', {
    geometry: createGeometryVariant(assimpCubeGeometry, {
      boundingBox: { center: [0, 0, 1] },
    }),
  }),
  createCubeTestCase('usdz', {
    variant: 'materials',
    geometry: createGeometryVariant(assimpCubeGeometry, {
      boundingBox: { center: [0, 0, 1] },
    }),
  }),
  createCubeTestCase('usdz', {
    variant: 'textures',
    geometry: assimpCubeGeometry,
    skip: true,
    skipReason: 'GLTF texture loading does not work in Node.js yet.',
  }),

  // 3DS creates complex multi-mesh structures - skip structure validation
  createCubeTestCase('3ds', { geometry: assimpCubeGeometry }),

  createCubeTestCase('amf', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),
  createCubeTestCase('lwo', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),

  createCubeTestCase('x3d', {
    geometry: createGeometryVariant(assimpCubeGeometry, {
      boundingBox: { center: [0, 0, -1] },
    }),
    structure: {
      rootNodes: [
        {
          type: 'ContainerNode',
          children: [
            {
              type: 'ContainerNode',
              children: [{ type: 'MeshNode' }],
            },
          ],
        },
      ],
    },
  }),
  createSkippedTestCase('x3db', 'X3DB (binary) loader is not implemented yet.'),

  createCubeTestCase('xgl', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),

  createCubeTestCase('ifc', {
    variant: 'freecad',
    geometry: assimpCubeGeometry,
    structure: {
      rootNodes: [
        {
          type: 'ContainerNode',
          children: [
            {
              type: 'ContainerNode',
              children: [
                {
                  type: 'ContainerNode',
                  children: [{ type: 'MeshNode' }],
                },
              ],
            },
          ],
        },
      ],
    },
  }),
  createCubeTestCase('ifc', {
    variant: 'blender',
    geometry: assimpCubeGeometry,
    structure: {
      rootNodes: [
        {
          type: 'ContainerNode',
          children: [
            {
              type: 'ContainerNode',
              children: [
                {
                  type: 'ContainerNode',
                  children: [
                    {
                      type: 'ContainerNode',
                      children: [{ type: 'MeshNode' }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  }),

  createCubeTestCase('ase', {
    geometry: assimpCubeGeometry,
    structure: {
      rootNodes: [
        {
          type: 'ContainerNode',
          children: [
            {
              type: 'ContainerNode',
              children: [{ type: 'MeshNode' }],
            },
          ],
        },
      ],
    },
  }),

  createCubeTestCase('off', { geometry: assimpCubeGeometry, structure: 'directMesh' }),

  createCubeTestCase('x', { geometry: assimpCubeGeometry, structure: 'directMesh' }),

  createCubeTestCase('smd', {
    geometry: assimpCubeGeometry,
    structure: {
      rootNodes: [
        {
          type: 'ContainerNode',
          children: [{ type: 'ContainerNode' }],
        },
      ],
    },
    skip: true,
    skipReason: 'SMD loader depends on GLTF image loading, which is not supported in Node.js.',
  }),

  // MD5MESH creates complex skeletal animation structures - skip structure validation
  createCubeTestCase('md5mesh', { geometry: assimpCubeGeometry }),

  createCubeTestCase('ac', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),

  createCubeTestCase('nff', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),

  createCubeTestCase('ogex', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),
  createCubeTestCase('mesh.xml', { geometry: assimpCubeGeometry, structure: 'directMesh' }),

  createCubeTestCase('cob', { geometry: assimpCubeGeometry, structure: 'containerWithMeshChild' }),

  createCubeTestCase('drc', {
    geometry: createGeometryVariant(optimizedCubeGeometry, {
      boundingBox: { center: [0, 0, 1] },
    }),
    structure: {
      rootNodes: [{ type: 'MeshNode' }],
    },
  }),

  createCubeTestCase('dxf', {
    geometry: createGeometryVariant(assimpCubeGeometry, {
      vertexCount: 72,
      faceCount: 24,
    }),
    structure: 'directMesh',
  }),

  createCubeTestCase('3mf', {
    geometry: createGeometryVariant(assimpCubeGeometry, {
      boundingBox: { center: [0, 0, 1] },
    }),
    structure: 'containerWithMeshChild',
  }),

  createCubeTestCase('3dm', {
    variant: 'mesh',
    geometry: {
      vertexCount: 36,
      faceCount: 12,
      meshCount: 1,
      boundingBox: {
        size: [2, 2, 2],
        center: [0, 1, 0],
      },
    },
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
      boundingBox: { size: [12, 2, 7], center: [5, 1, -2.5] },
    },
    structure: {
      rootNodes: [
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
        { type: 'MeshNode', name: 'TestCube' },
      ],
    },
  },

  createCubeTestCase('bvh', {
    geometry: createGeometryVariant(assimpCubeGeometry, {
      vertexCount: 120,
      faceCount: 40,
      boundingBox: {
        size: [2.482_84, 2.4, 2.4],
        center: [-0.041_42, 0, 2],
      },
    }),
    structure: {
      rootNodes: [
        {
          type: 'SkinNode',
          children: [
            {
              type: 'ContainerNode',
              children: [
                {
                  type: 'ContainerNode',
                  children: [
                    {
                      type: 'ContainerNode',
                      children: [
                        {
                          type: 'ContainerNode',
                          children: [
                            {
                              type: 'ContainerNode',
                              children: [
                                {
                                  type: 'ContainerNode',
                                  children: [
                                    {
                                      type: 'ContainerNode',
                                      children: [
                                        {
                                          type: 'ContainerNode',
                                          children: [{ type: 'ContainerNode' }], // BVH creates 10-level deep skeletal hierarchy
                                        },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  }),

  createCubeTestCase('step', {
    geometry: optimizedCubeGeometry,
    structure: 'directMesh',
  }),
  createCubeTestCase('stp', {
    geometry: optimizedCubeGeometry,
    structure: 'directMesh',
  }),
  createCubeTestCase('iges', {
    variant: 'mesh',
    geometry: optimizedCubeGeometry,
    structure: 'directMesh',
  }),
  createCubeTestCase('igs', {
    variant: 'mesh',
    geometry: optimizedCubeGeometry,
    structure: 'directMesh',
  }),
  createCubeTestCase('iges', {
    variant: 'brep',
    geometry: { ...optimizedCubeGeometry, meshCount: 6, facePoints: 4 },
    // Skip structure validation for complex BREP - has 6 separate mesh root nodes
    skip: false,
  }),
  createCubeTestCase('igs', {
    variant: 'brep',
    geometry: { ...optimizedCubeGeometry, meshCount: 6, facePoints: 4 },
    // Skip structure validation for complex BREP - has complex multi-mesh structure
    skip: false,
  }),
  createCubeTestCase('brep', { geometry: optimizedCubeGeometry, structure: 'directMesh' }),

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
      let glbData: Uint8Array<ArrayBuffer>;
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
          for (const value of [...scene.bboxMax, ...scene.bboxMin]) {
            expect(Number.isFinite(value)).toBe(true);
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
    const declaredFormats = supportedImportFormats;

    expect([...new Set(enabledFormats)].sort()).toEqual([...new Set(declaredFormats)].sort());
  });

  it('should throw error when primary file is missing', async () => {
    // Test with a file that doesn't match the expected format (using DRC format which uses findPrimaryFile directly)
    const wrongFiles = [
      {
        name: 'test.txt',
        bytes: new Uint8Array([1, 2, 3]),
      },
    ];

    await expect(importFiles(wrongFiles, 'drc')).rejects.toThrow('No .DRC file found in file set');
  });

  it('should throw error when file array is empty', async () => {
    // Test with 3DM format which uses findPrimaryFile directly
    await expect(importFiles([], '3dm')).rejects.toThrow('No .3DM file found in file set');
  });

  // ========================================================================
  // FileResolver-based import tests
  // ========================================================================
  describe('FileResolver-based import', () => {
    function createMapResolver(files: Map<string, Uint8Array<ArrayBuffer>>): FileResolver {
      return {
        exists: (filename: string) => files.has(filename),
        readFile(filename: string) {
          const bytes = files.get(filename);
          if (!bytes) {
            throw new Error(`File not found: ${filename}`);
          }

          return bytes;
        },
      };
    }

    it('should import GLTF with external binary via FileResolver', async () => {
      const gltfData = loadFixture('cube-bin.gltf');
      const binData = loadFixture('cube-bin.bin');

      const resolver = createMapResolver(
        new Map([
          ['cube-bin.gltf', gltfData],
          ['cube-bin.bin', binData],
        ]),
      );

      const glbData = await importFiles([{ name: 'cube-bin.gltf', bytes: gltfData }], 'gltf', resolver);
      validateGlbData(glbData);

      const report = await getInspectReport(glbData);
      expect(report.meshes.properties.length).toBeGreaterThan(0);
    });

    it('should import Draco-compressed GLTF with external binary via FileResolver', async () => {
      const gltfData = loadFixture('cube-draco-bin.gltf');
      const binData = loadFixture('cube-draco-bin.bin');

      const resolver = createMapResolver(
        new Map([
          ['cube-draco-bin.gltf', gltfData],
          ['cube-draco-bin.bin', binData],
        ]),
      );

      const glbData = await importFiles([{ name: 'cube-draco-bin.gltf', bytes: gltfData }], 'gltf', resolver);
      validateGlbData(glbData);

      const report = await getInspectReport(glbData);
      expect(report.meshes.properties.length).toBeGreaterThan(0);
    });

    it('should import OBJ with MTL sidecar via FileResolver (assimpjs ConvertFile)', async () => {
      const objectData = loadFixture('cube-materials.obj');
      const mtlData = loadFixture('cube-materials.mtl');

      const resolver = createMapResolver(
        new Map([
          ['cube-materials.obj', objectData],
          ['cube-materials.mtl', mtlData],
        ]),
      );

      const glbData = await importFiles([{ name: 'cube-materials.obj', bytes: objectData }], 'obj', resolver);
      validateGlbData(glbData);

      const report = await getInspectReport(glbData);
      expect(report.meshes.properties.length).toBeGreaterThan(0);
    });

    it('should produce same output with FileResolver as with FileInput array for GLTF', async () => {
      const gltfData = loadFixture('cube-bin.gltf');
      const binData = loadFixture('cube-bin.bin');

      // Import via FileInput[] (standard path)
      const glbViaFiles = await importFiles(
        [
          { name: 'cube-bin.gltf', bytes: gltfData },
          { name: 'cube-bin.bin', bytes: binData },
        ],
        'gltf',
      );

      // Import via FileResolver
      const resolver = createMapResolver(
        new Map([
          ['cube-bin.gltf', gltfData],
          ['cube-bin.bin', binData],
        ]),
      );
      const glbViaResolver = await importFiles([{ name: 'cube-bin.gltf', bytes: gltfData }], 'gltf', resolver);

      const reportFiles = await getInspectReport(glbViaFiles);
      const reportResolver = await getInspectReport(glbViaResolver);

      expect(reportResolver.meshes.properties.length).toBe(reportFiles.meshes.properties.length);
    });
  });
});
