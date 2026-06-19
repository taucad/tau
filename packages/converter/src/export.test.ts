import { inflateRawSync } from 'node:zlib';
import { expect, describe, it, beforeEach } from 'vitest';
import type { InspectReport } from '@gltf-transform/functions';
import type { ExportFile } from '@taucad/types';
import { importFiles } from '#import.js';
import { exportFiles } from '#export.js';
import type { SupportedExportFormat } from '#formats.js';
import { supportedExportFormats } from '#formats.js';
import { loadFixture } from '#test.utils.js';
import { getInspectReport } from '#gltf.utils.js';

// ============================================================================
// Types for Export Testing
// ============================================================================

type ExportTestCase = {
  format: SupportedExportFormat;
  description?: string;
  skip?: boolean;
  skipReason?: string;

  // Test fixture selection
  fixture: 'cube' | 'cube-materials' | 'cube-animations';

  // Expected output
  expectedFiles: {
    primaryExtension: string;
    expectedNames: string[]; // Specific expected file names
  };

  // Round-trip assertions using inspect reports
  expectations: {
    geometry: {
      vertexCountTolerance: number; // 0 = exact, >0 = allowed difference
      meshCountTolerance: number; // Tolerance for mesh count differences
      boundingBoxTolerance: number; // Tolerance for bounding box comparison
      // Granular attribute expectations
      hasPositionAttribute: boolean; // Should always be true for valid geometry
      hasNormalAttribute: boolean; // Whether normals are preserved
      hasUvAttribute: boolean; // Whether UV coordinates are preserved
      additionalAttributeCount: number; // Count of other attributes (tangents, colors, etc.)
    };
    materials: {
      expectedMaterialCount: number; // Exact number of materials expected
      expectedTextureCount: number; // Exact number of textures expected
    };
  };
};

// Utility type for comparing inspect reports
type InspectComparison = {
  original: InspectReport;
  roundTrip: InspectReport;
};

// ============================================================================
// Test Utility Functions
// ============================================================================

/**
 * Load GLB data from test fixture
 */
const loadGlbFixture = (fixture: ExportTestCase['fixture']): Uint8Array<ArrayBuffer> => {
  const filename = `${fixture}.glb`;
  return loadFixture(filename);
};

/**
 * Perform round-trip test: GLB → Export → Import → Compare
 */
const performRoundTripTest = async (
  glbData: Uint8Array<ArrayBuffer>,
  format: SupportedExportFormat,
): Promise<{
  exportedFiles: ExportFile[];
  roundTripGlbData: Uint8Array<ArrayBuffer>;
  comparison: InspectComparison;
}> => {
  // Get original inspect report
  const originalReport = await getInspectReport(glbData);

  // Export the GLB data
  const exportedFiles = await exportFiles(glbData, format);

  // If no files were exported, return empty result
  if (exportedFiles.length === 0) {
    const emptyGlbData = new Uint8Array(0);
    const emptyReport = {
      scenes: { properties: [] },
      meshes: { properties: [] },
      materials: { properties: [] },
      textures: { properties: [] },
      animations: { properties: [] },
    };
    return {
      exportedFiles,
      roundTripGlbData: emptyGlbData,
      comparison: { original: originalReport, roundTrip: emptyReport },
    };
  }

  const inputFiles = exportedFiles.map((file) => ({
    name: file.name,
    bytes: file.bytes,
  }));

  // Re-import the exported files
  const roundTripGlbData = await importFiles(inputFiles, format);
  const roundTripReport = await getInspectReport(roundTripGlbData);

  return {
    exportedFiles,
    roundTripGlbData,
    comparison: { original: originalReport, roundTrip: roundTripReport },
  };
};

// ============================================================================
// Individual Assertion Functions (One Expect Each)
// ============================================================================

/**
 * Assert mesh count is within tolerance
 */
const assertMeshCount = (comparison: InspectComparison, tolerance: number): void => {
  const { original, roundTrip } = comparison;
  const meshCountDiff = Math.abs(original.meshes.properties.length - roundTrip.meshes.properties.length);
  expect(meshCountDiff).toBeLessThanOrEqual(tolerance);
};

/**
 * Assert vertex count is within tolerance
 */
const assertVertexCount = (comparison: InspectComparison, tolerance: number): void => {
  const { original, roundTrip } = comparison;
  const originalTotalVertices = original.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
  const roundTripTotalVertices = roundTrip.meshes.properties.reduce((sum, mesh) => sum + mesh.vertices, 0);
  const vertexDiff = Math.abs(originalTotalVertices - roundTripTotalVertices);
  expect(vertexDiff).toBeLessThanOrEqual(tolerance);
};

/**
 * Assert bounding box size is within tolerance (always runs, no conditions)
 */
const assertBoundingBoxSize = (comparison: InspectComparison, tolerance: number): void => {
  const { original, roundTrip } = comparison;

  // Ensure both have scenes - if not, this is a test failure
  expect(original.scenes.properties.length).toBeGreaterThan(0);
  expect(roundTrip.scenes.properties.length).toBeGreaterThan(0);

  const originalScene = original.scenes.properties[0]!;
  const roundTripScene = roundTrip.scenes.properties[0]!;

  // Ensure bounding boxes exist - if not, this is a test failure
  expect(originalScene.bboxMax).toBeDefined();
  expect(originalScene.bboxMin).toBeDefined();
  expect(roundTripScene.bboxMax).toBeDefined();
  expect(roundTripScene.bboxMin).toBeDefined();
  expect(originalScene.bboxMax.length).toBeGreaterThanOrEqual(3);
  expect(originalScene.bboxMin.length).toBeGreaterThanOrEqual(3);
  expect(roundTripScene.bboxMax.length).toBeGreaterThanOrEqual(3);
  expect(roundTripScene.bboxMin.length).toBeGreaterThanOrEqual(3);

  // Calculate bounding box size differences
  const originalSize = [
    originalScene.bboxMax[0]! - originalScene.bboxMin[0]!,
    originalScene.bboxMax[1]! - originalScene.bboxMin[1]!,
    originalScene.bboxMax[2]! - originalScene.bboxMin[2]!,
  ];
  const roundTripSize = [
    roundTripScene.bboxMax[0]! - roundTripScene.bboxMin[0]!,
    roundTripScene.bboxMax[1]! - roundTripScene.bboxMin[1]!,
    roundTripScene.bboxMax[2]! - roundTripScene.bboxMin[2]!,
  ];

  const sizeDiff = Math.hypot(
    originalSize[0]! - roundTripSize[0]!,
    originalSize[1]! - roundTripSize[1]!,
    originalSize[2]! - roundTripSize[2]!,
  );
  expect(sizeDiff).toBeLessThanOrEqual(tolerance);
};

/**
 * Assert position attribute presence (always runs, no conditions)
 */
const assertPositionAttribute = (comparison: InspectComparison, shouldHave: boolean): void => {
  const { roundTrip } = comparison;

  // Ensure we have meshes to test
  expect(roundTrip.meshes.properties.length).toBeGreaterThan(0);

  const mesh = roundTrip.meshes.properties[0]!;
  const hasPosition = mesh.attributes.some((attribute) => attribute.toLowerCase().includes('position'));

  if (shouldHave) {
    expect(hasPosition).toBe(true);
  } else {
    expect(hasPosition).toBe(false);
  }
};

/**
 * Assert normal attribute presence (always runs, no conditions)
 */
const assertNormalAttribute = (comparison: InspectComparison, shouldHave: boolean): void => {
  const { roundTrip } = comparison;

  // Ensure we have meshes to test
  expect(roundTrip.meshes.properties.length).toBeGreaterThan(0);

  const mesh = roundTrip.meshes.properties[0]!;
  const hasNormal = mesh.attributes.some((attribute) => attribute.toLowerCase().includes('normal'));

  if (shouldHave) {
    expect(hasNormal).toBe(true);
  } else {
    expect(hasNormal).toBe(false);
  }
};

/**
 * Assert UV attribute presence (always runs, no conditions)
 */
const assertUvAttribute = (comparison: InspectComparison, shouldHave: boolean): void => {
  const { roundTrip } = comparison;

  // Ensure we have meshes to test
  expect(roundTrip.meshes.properties.length).toBeGreaterThan(0);

  const mesh = roundTrip.meshes.properties[0]!;
  const hasUv = mesh.attributes.some(
    (attribute) => attribute.toLowerCase().includes('texcoord') || attribute.toLowerCase().includes('uv'),
  );

  if (shouldHave) {
    expect(hasUv).toBe(true);
  } else {
    expect(hasUv).toBe(false);
  }
};

/**
 * Assert additional attribute count (always runs, no conditions)
 */
const assertAdditionalAttributeCount = (comparison: InspectComparison, expectedCount: number): void => {
  const { roundTrip } = comparison;

  // Ensure we have meshes to test
  expect(roundTrip.meshes.properties.length).toBeGreaterThan(0);

  const mesh = roundTrip.meshes.properties[0]!;
  const standardAttributes = mesh.attributes.filter((attribute) => {
    const attributeLower = attribute.toLowerCase();
    return (
      attributeLower.includes('position') ||
      attributeLower.includes('normal') ||
      attributeLower.includes('texcoord') ||
      attributeLower.includes('uv')
    );
  });

  const additionalCount = mesh.attributes.length - standardAttributes.length;
  expect(additionalCount).toBe(expectedCount);
};

/**
 * Assert exact material count (always runs, no conditions)
 */
const assertMaterialCount = (comparison: InspectComparison, expectedCount: number): void => {
  const { roundTrip } = comparison;
  expect(roundTrip.materials.properties.length).toBe(expectedCount);
};

/**
 * Assert exact texture count (always runs, no conditions)
 */
const assertTextureCount = (comparison: InspectComparison, expectedCount: number): void => {
  const { roundTrip } = comparison;
  expect(roundTrip.textures.properties.length).toBe(expectedCount);
};

// ============================================================================
// Test Case Templates & Factories
// ============================================================================

const standardGeometryExpectations = {
  vertexCountTolerance: 0,
  meshCountTolerance: 0,
  boundingBoxTolerance: 0.001,
  hasPositionAttribute: true, // Should always be present
  hasNormalAttribute: true, // Standard formats preserve normals
  hasUvAttribute: false, // Most formats don't actually preserve UVs in round-trip
  additionalAttributeCount: 0, // Most standard formats don't add extra attributes
} as const;

const standardMaterialExpectations = {
  expectedMaterialCount: 1, // Standard cube fixture has 1 material
  expectedTextureCount: 0, // Standard cube fixture has no textures
} as const;

const multiMaterialExpectations = {
  expectedMaterialCount: 2, // Some formats create multiple default materials
  expectedTextureCount: 0, // These formats don't preserve textures
} as const;

/**
 * Create a variant of expectations with overrides
 */
const createExpectationVariant = <T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T => ({
  ...base,
  ...overrides,
});

/**
 * Factory function for creating export test cases with sensible defaults
 */
const createExportTestCase = (
  format: SupportedExportFormat,
  options: {
    fixture?: ExportTestCase['fixture'];
    description?: string;
    skip?: boolean;
    skipReason?: string;
    expectedFiles?: {
      primaryExtension?: string;
      expectedNames?: string[];
    };
    expectations?: {
      geometry?: Partial<ExportTestCase['expectations']['geometry']>;
      materials?: Partial<ExportTestCase['expectations']['materials']>;
    };
  } = {},
): ExportTestCase => {
  const fixture = options.fixture ?? 'cube';
  const primaryExtension = options.expectedFiles?.primaryExtension ?? format;

  // Default file naming pattern
  const getDefaultFileNames = (format: SupportedExportFormat): string[] => {
    return [`result.${format}`];
  };

  return {
    format,
    fixture,
    description: options.description ?? `${format.toUpperCase()} export with basic ${fixture}`,
    skip: options.skip,
    skipReason: options.skipReason,
    expectedFiles: {
      primaryExtension,
      expectedNames: options.expectedFiles?.expectedNames ?? getDefaultFileNames(format),
    },
    expectations: {
      geometry: createExpectationVariant(standardGeometryExpectations, options.expectations?.geometry ?? {}),
      materials: createExpectationVariant(standardMaterialExpectations, options.expectations?.materials ?? {}),
    },
  };
};

// ============================================================================
// Test Cases Definition
// ============================================================================

const exportTestCases: ExportTestCase[] = [
  // Formats that preserve everything
  createExportTestCase('stl'),
  createExportTestCase('ply'),
  createExportTestCase('fbx'),
  createExportTestCase('x'),
  createExportTestCase('x3d'),
  createExportTestCase('gltf', {
    expectedFiles: {
      expectedNames: ['model.gltf', 'buffer.bin'],
    },
    expectations: {
      geometry: {
        ...standardGeometryExpectations,
        boundingBoxTolerance: 0.005 as number,
      },
    },
  }),
  createExportTestCase('glb', {
    expectedFiles: {
      expectedNames: ['model.glb'],
    },
    expectations: {
      geometry: {
        ...standardGeometryExpectations,
        boundingBoxTolerance: 0.005 as number,
      },
    },
  }),

  // Formats that add default materials
  createExportTestCase('dae', {
    expectations: {
      materials: multiMaterialExpectations,
    },
  }),
  createExportTestCase('3mf', {
    expectations: {
      geometry: { hasNormalAttribute: false },
      materials: multiMaterialExpectations,
    },
  }),
  createExportTestCase('3ds', {
    expectations: {
      materials: multiMaterialExpectations,
    },
  }),
  createExportTestCase('obj', {
    expectedFiles: {
      expectedNames: ['result.obj', 'result.mtl'],
    },
    expectations: {
      materials: multiMaterialExpectations,
    },
  }),

  createExportTestCase('usda'),
  createExportTestCase('usdz'),

  // STP Format - CAD format with limited capabilities and may subdivide geometry
  createExportTestCase('step', {
    expectations: {
      geometry: {
        ...standardGeometryExpectations,
        meshCountTolerance: 15, // CAD formats often subdivide geometry into multiple meshes
      },
      materials: {
        expectedMaterialCount: 12, // STP meshes get fallback default materials on re-import
        expectedTextureCount: 0, // STP doesn't preserve textures
      },
    },
  }),
];

// ============================================================================
// Main Test Suite
// ============================================================================

describe('exportFiles', () => {
  for (const testCase of exportTestCases) {
    describe(`'${testCase.format}' exporter`, () => {
      if (testCase.skip) {
        it.skip(`should export ${testCase.description}: ${testCase.skipReason}`, () => {
          expect(testCase.skip).toBe(true);
        });
        return;
      }

      let glbData: Uint8Array<ArrayBuffer>;
      let exportedFiles: ExportFile[];
      let roundTripGlbData: Uint8Array<ArrayBuffer>;
      let comparison: InspectComparison;

      beforeEach(async () => {
        // Load GLB data
        glbData = loadGlbFixture(testCase.fixture);

        // Perform round-trip export/import using GLB data
        const result = await performRoundTripTest(glbData, testCase.format);
        exportedFiles = result.exportedFiles;
        roundTripGlbData = result.roundTripGlbData;
        comparison = result.comparison;
      });

      it(`should export ${testCase.description}`, () => {
        expect(exportedFiles).toBeDefined();
        expect(exportedFiles.length).toBeGreaterThan(0);
      });

      it('should produce correct number of output files', () => {
        expect(exportedFiles.length).toBe(testCase.expectedFiles.expectedNames.length);
      });

      it('should have correct file names and extensions', () => {
        // Check that we have the expected file names
        const actualNames = exportedFiles.map((f) => f.name).sort();
        const expectedNames = [...testCase.expectedFiles.expectedNames].sort();
        expect(actualNames).toEqual(expectedNames);

        // Also check primary extension exists
        const primaryFile = exportedFiles.find((f) => f.name.endsWith(`.${testCase.expectedFiles.primaryExtension}`));
        expect(primaryFile).toBeDefined();
      });

      it('should have valid file data', () => {
        for (const file of exportedFiles) {
          expect(file.name).toBeTruthy();
          expect(file.bytes).toBeInstanceOf(Uint8Array);
          expect(file.bytes.length).toBeGreaterThan(0);
        }
      });

      it('should successfully round-trip through export/import', () => {
        expect(roundTripGlbData).toBeDefined();
        expect(roundTripGlbData).toBeInstanceOf(Uint8Array);
        expect(comparison.original).toBeDefined();
        expect(comparison.roundTrip).toBeDefined();
      });

      // ============================================================================
      // Granular Geometry Assertions (One Expect Each)
      // ============================================================================

      it('should preserve mesh count within tolerance', () => {
        assertMeshCount(comparison, testCase.expectations.geometry.meshCountTolerance);
      });

      it('should preserve vertex count within tolerance', () => {
        assertVertexCount(comparison, testCase.expectations.geometry.vertexCountTolerance);
      });

      it('should preserve bounding box size within tolerance', () => {
        assertBoundingBoxSize(comparison, testCase.expectations.geometry.boundingBoxTolerance);
      });

      it('should handle position attributes correctly', () => {
        assertPositionAttribute(comparison, testCase.expectations.geometry.hasPositionAttribute);
      });

      it('should handle normal attributes correctly', () => {
        assertNormalAttribute(comparison, testCase.expectations.geometry.hasNormalAttribute);
      });

      it('should handle UV attributes correctly', () => {
        assertUvAttribute(comparison, testCase.expectations.geometry.hasUvAttribute);
      });

      it('should have correct additional attribute count', () => {
        assertAdditionalAttributeCount(comparison, testCase.expectations.geometry.additionalAttributeCount);
      });

      // ============================================================================
      // Material Assertions (One Expect Each)
      // ============================================================================

      it('should handle material count correctly', () => {
        assertMaterialCount(comparison, testCase.expectations.materials.expectedMaterialCount);
      });

      it('should handle texture count correctly', () => {
        assertTextureCount(comparison, testCase.expectations.materials.expectedTextureCount);
      });
    });
  }

  // Meta tests
  describe('skipped exporters', () => {
    const skippedTestCases = exportTestCases.filter((tc) => tc.skip);
    if (skippedTestCases.length > 0) {
      for (const testCase of skippedTestCases) {
        it(`should skip ${testCase.format} exporter: ${testCase.skipReason}`, () => {
          expect(testCase.skip).toBe(true);
        });
      }
    } else {
      it('no skipped tests in current suite', () => {
        expect(skippedTestCases.length).toBe(0);
      });
    }
  });

  it('should test all declared export formats', () => {
    const testedFormats = exportTestCases.map((tc) => tc.format);
    const declaredFormats = supportedExportFormats;

    expect([...new Set(testedFormats)].sort()).toEqual([...new Set(declaredFormats)].sort());
  });

  it('should throw error when GLB data is empty', async () => {
    const emptyGlbData = new Uint8Array(0);
    await expect(exportFiles(emptyGlbData, 'glb')).rejects.toThrow('GLB data cannot be empty');
  });
});

// ============================================================================
// 3MF Export Options Tests
// ============================================================================

/**
 * Extract the `3D/3dmodel.model` XML from a 3MF ZIP archive (ExportFile bytes).
 */
const extract3mfModelXml = (bytes: Uint8Array<ArrayBuffer>): string => {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04_03_4b_50) {
      break;
    }

    const compressionMethod = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLength = buf.readUInt16LE(offset + 26);
    const extraLength = buf.readUInt16LE(offset + 28);
    const name = buf.toString('utf8', offset + 30, offset + 30 + nameLength);
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;

    if (name === '3D/3dmodel.model' || name === '/3D/3dmodel.model') {
      const raw = buf.subarray(dataStart, dataEnd);
      if (compressionMethod === 8) {
        return inflateRawSync(raw).toString('utf8');
      }
      return raw.toString('utf8');
    }
    offset = dataEnd;
  }

  throw new Error('3D/3dmodel.model not found in 3MF ZIP archive');
};

/* eslint-disable @typescript-eslint/naming-convention -- Assimp export property keys use CONSTANT_CASE */
describe('3MF export options', () => {
  let glbData: Uint8Array<ArrayBuffer>;

  beforeEach(() => {
    glbData = loadFixture('cube.glb');
  });

  it('should default to millimeter unit', async () => {
    const files = await exportFiles(glbData, '3mf');
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(xml).toContain('unit="millimeter"');
  });

  it('should set centimeter unit via exportProperties', async () => {
    const files = await exportFiles(glbData, '3mf', {
      '3MF_EXPORT_UNIT': 'centimeter',
    });
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(xml).toContain('unit="centimeter"');
  });

  it('should set inch unit via exportProperties', async () => {
    const files = await exportFiles(glbData, '3mf', {
      '3MF_EXPORT_UNIT': 'inch',
    });
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(xml).toContain('unit="inch"');
  });

  it('should set Application metadata via exportProperties', async () => {
    const files = await exportFiles(glbData, '3mf', {
      '3MF_EXPORT_APPLICATION': 'PrusaSlicer 2.8',
    });
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(xml).toContain('name="Application"');
    expect(xml).toContain('PrusaSlicer 2.8');
  });

  it('should omit Application metadata when not specified', async () => {
    const files = await exportFiles(glbData, '3mf');
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(xml).not.toContain('name="Application"');
  });

  it('should set both unit and application together', async () => {
    const files = await exportFiles(glbData, '3mf', {
      '3MF_EXPORT_UNIT': 'meter',
      '3MF_EXPORT_APPLICATION': 'BambuStudio 1.9',
    });
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(xml).toContain('unit="meter"');
    expect(xml).toContain('name="Application"');
    expect(xml).toContain('BambuStudio 1.9');
  });
});
/* eslint-enable @typescript-eslint/naming-convention -- re-enable after 3MF tests */

// ============================================================================
// 3MF Rendering Artifact Regressions
// ============================================================================
// Pin the 3MF rendering-artifact fixes so they cannot regress:
//   - lib3mf decimal precision raised from 6 to 9 (default) so vertex
//     truncation no longer creates µm-scale gaps at shared mesh boundaries.
//   - aiProcess_Triangulate + aiProcess_JoinIdenticalVertices enforced for
//     the 3MF exporter; vertex welding runs per-aiMesh, so multi-primitive
//     scenes keep one <object> per primitive and per-material colors stay
//     intact.
//   - Lib3MFBridge converts non-triangle aiFaces with push_back, so any
//     residual N-gon never leaves a zero-initialised degenerate slot that
//     lib3mf would otherwise reject.
//   - aiProcess_FindDegenerates + aiProcess_FindInvalidData guard against
//     malformed input slipping through to the bridge.

/**
 * Build a minimal, valid multi-primitive GLB in-memory: one mesh with two
 * primitives that reference distinct materials. Vertex coordinates use values
 * that require >= 9 fractional digits to round-trip without loss, which exposes
 * the precision regression at the heart of the artifact fix.
 */
const buildMultiPrimitiveGlb = (): Uint8Array<ArrayBuffer> => {
  const triangleA = {
    positions: [
      [0, 0, 0],
      [1.123_456_789, 0, 0],
      [0, 1.234_567_891, 0],
    ] as const,
    min: [0, 0, 0] as const,
    max: [1.123_456_789, 1.234_567_891, 0] as const,
  };
  const triangleB = {
    positions: [
      [2, 2, 2],
      [3.555_555_555, 2, 2],
      [2, 3.777_777_777, 2],
    ] as const,
    min: [2, 2, 2] as const,
    max: [3.555_555_555, 3.777_777_777, 2] as const,
  };

  const positionsBytesPerPrim = 3 * 3 * 4; // 3 verts * vec3 * f32
  const indicesBytesPerPrim = 3 * 4; // 3 indices * u32
  const bufferLength = (positionsBytesPerPrim + indicesBytesPerPrim) * 2;

  const binary = new ArrayBuffer(bufferLength);
  const f32 = new Float32Array(binary);
  const u32 = new Uint32Array(binary);

  // Buffer layout (matches the bufferView byteOffsets below):
  //   [0..36)   posA (36B)
  //   [36..72)  posB (36B)
  //   [72..84)  idxA (12B)
  //   [84..96)  idxB (12B)
  let cursor = 0;
  for (const tri of [triangleA, triangleB]) {
    for (const [x, y, z] of tri.positions) {
      f32[cursor] = x;
      f32[cursor + 1] = y;
      f32[cursor + 2] = z;
      cursor += 3;
    }
  }
  const indexStartU32 = (positionsBytesPerPrim * 2) / 4;
  u32[indexStartU32] = 0;
  u32[indexStartU32 + 1] = 1;
  u32[indexStartU32 + 2] = 2;
  u32[indexStartU32 + 3] = 0;
  u32[indexStartU32 + 4] = 1;
  u32[indexStartU32 + 5] = 2;

  const json = {
    asset: { version: '2.0', generator: 'tau-3mf-regression' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [
      {
        name: 'MultiPrimMesh',
        primitives: [
          // eslint-disable-next-line @typescript-eslint/naming-convention -- POSITION is the glTF 2.0 attribute name mandated by the spec.
          { attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 },
          // eslint-disable-next-line @typescript-eslint/naming-convention -- POSITION is the glTF 2.0 attribute name mandated by the spec.
          { attributes: { POSITION: 2 }, indices: 3, material: 1, mode: 4 },
        ],
      },
    ],
    materials: [
      {
        name: 'MatRed',
        pbrMetallicRoughness: { baseColorFactor: [1, 0, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
      },
      {
        name: 'MatBlue',
        pbrMetallicRoughness: { baseColorFactor: [0, 0, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [...triangleA.min],
        max: [...triangleA.max],
      },
      { bufferView: 1, componentType: 5125, count: 3, type: 'SCALAR' },
      {
        bufferView: 2,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [...triangleB.min],
        max: [...triangleB.max],
      },
      { bufferView: 3, componentType: 5125, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBytesPerPrim, target: 34_962 },
      {
        buffer: 0,
        byteOffset: positionsBytesPerPrim * 2,
        byteLength: indicesBytesPerPrim,
        target: 34_963,
      },
      {
        buffer: 0,
        byteOffset: positionsBytesPerPrim,
        byteLength: positionsBytesPerPrim,
        target: 34_962,
      },
      {
        buffer: 0,
        byteOffset: positionsBytesPerPrim * 2 + indicesBytesPerPrim,
        byteLength: indicesBytesPerPrim,
        target: 34_963,
      },
    ],
    buffers: [{ byteLength: bufferLength }],
  };

  const jsonText = JSON.stringify(json);
  const jsonBytes = Buffer.from(jsonText, 'utf8');
  // GLTF spec requires JSON chunk padded to 4-byte boundary with 0x20 (space).
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkLength = jsonBytes.length + jsonPadding;

  const binaryPadding = (4 - (binary.byteLength % 4)) % 4;
  const binaryChunkLength = binary.byteLength + binaryPadding;

  const totalLength = 12 + 8 + jsonChunkLength + 8 + binaryChunkLength;
  const out = Buffer.alloc(totalLength);
  out.writeUInt32LE(0x46_54_6c_67, 0); // 'glTF'
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);

  out.writeUInt32LE(jsonChunkLength, 12);
  out.writeUInt32LE(0x4e_4f_53_4a, 16); // 'JSON'
  jsonBytes.copy(out, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonChunkLength);

  const binChunkOffset = 20 + jsonChunkLength;
  out.writeUInt32LE(binaryChunkLength, binChunkOffset);
  out.writeUInt32LE(0x00_4e_49_42, binChunkOffset + 4); // 'BIN\0'
  Buffer.from(binary).copy(out, binChunkOffset + 8);
  // Binary chunk pads with 0x00 (Buffer.alloc default).

  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
};

/**
 * Build a named two-node GLB that mirrors Tau's JSCAD assembly contract:
 * one glTF node/mesh per semantic part.
 */
const buildNamedMultiNodeGlb = (): Uint8Array<ArrayBuffer> => {
  const triangleA = {
    positions: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ] as const,
    min: [0, 0, 0] as const,
    max: [1, 1, 0] as const,
  };
  const triangleB = {
    positions: [
      [2, 0, 0],
      [3, 0, 0],
      [2, 1, 0],
    ] as const,
    min: [2, 0, 0] as const,
    max: [3, 1, 0] as const,
  };

  const positionsBytesPerMesh = 3 * 3 * 4;
  const indicesBytesPerMesh = 3 * 4;
  const bufferLength = (positionsBytesPerMesh + indicesBytesPerMesh) * 2;
  const binary = new ArrayBuffer(bufferLength);
  const f32 = new Float32Array(binary);
  const u32 = new Uint32Array(binary);

  let cursor = 0;
  for (const tri of [triangleA, triangleB]) {
    for (const [x, y, z] of tri.positions) {
      f32[cursor] = x;
      f32[cursor + 1] = y;
      f32[cursor + 2] = z;
      cursor += 3;
    }
  }

  const indexStartU32 = (positionsBytesPerMesh * 2) / 4;
  u32[indexStartU32] = 0;
  u32[indexStartU32 + 1] = 1;
  u32[indexStartU32 + 2] = 2;
  u32[indexStartU32 + 3] = 0;
  u32[indexStartU32 + 4] = 1;
  u32[indexStartU32 + 5] = 2;

  const json = {
    asset: { version: '2.0', generator: 'tau-named-parts-regression' },
    scene: 0,
    scenes: [{ nodes: [0, 1] }],
    nodes: [
      { name: 'Housing', mesh: 0 },
      { name: 'Sun Gear', mesh: 1 },
    ],
    meshes: [
      {
        name: 'Housing',
        primitives: [
          // eslint-disable-next-line @typescript-eslint/naming-convention -- POSITION is the glTF 2.0 attribute name mandated by the spec.
          { attributes: { POSITION: 0 }, indices: 1, material: 0, mode: 4 },
        ],
      },
      {
        name: 'Sun Gear',
        primitives: [
          // eslint-disable-next-line @typescript-eslint/naming-convention -- POSITION is the glTF 2.0 attribute name mandated by the spec.
          { attributes: { POSITION: 2 }, indices: 3, material: 1, mode: 4 },
        ],
      },
    ],
    materials: [
      {
        name: 'Housing Material',
        pbrMetallicRoughness: { baseColorFactor: [0.5, 0.5, 0.5, 1], metallicFactor: 0, roughnessFactor: 1 },
      },
      {
        name: 'Sun Material',
        pbrMetallicRoughness: { baseColorFactor: [1, 0.75, 0, 1], metallicFactor: 0, roughnessFactor: 1 },
      },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [...triangleA.min],
        max: [...triangleA.max],
      },
      { bufferView: 1, componentType: 5125, count: 3, type: 'SCALAR' },
      {
        bufferView: 2,
        componentType: 5126,
        count: 3,
        type: 'VEC3',
        min: [...triangleB.min],
        max: [...triangleB.max],
      },
      { bufferView: 3, componentType: 5125, count: 3, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionsBytesPerMesh, target: 34_962 },
      {
        buffer: 0,
        byteOffset: positionsBytesPerMesh * 2,
        byteLength: indicesBytesPerMesh,
        target: 34_963,
      },
      {
        buffer: 0,
        byteOffset: positionsBytesPerMesh,
        byteLength: positionsBytesPerMesh,
        target: 34_962,
      },
      {
        buffer: 0,
        byteOffset: positionsBytesPerMesh * 2 + indicesBytesPerMesh,
        byteLength: indicesBytesPerMesh,
        target: 34_963,
      },
    ],
    buffers: [{ byteLength: bufferLength }],
  };

  const jsonText = JSON.stringify(json);
  const jsonBytes = Buffer.from(jsonText, 'utf8');
  const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
  const jsonChunkLength = jsonBytes.length + jsonPadding;
  const binaryPadding = (4 - (binary.byteLength % 4)) % 4;
  const binaryChunkLength = binary.byteLength + binaryPadding;
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binaryChunkLength;
  const out = Buffer.alloc(totalLength);

  out.writeUInt32LE(0x46_54_6c_67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(totalLength, 8);
  out.writeUInt32LE(jsonChunkLength, 12);
  out.writeUInt32LE(0x4e_4f_53_4a, 16);
  jsonBytes.copy(out, 20);
  out.fill(0x20, 20 + jsonBytes.length, 20 + jsonChunkLength);

  const binChunkOffset = 20 + jsonChunkLength;
  out.writeUInt32LE(binaryChunkLength, binChunkOffset);
  out.writeUInt32LE(0x00_4e_49_42, binChunkOffset + 4);
  Buffer.from(binary).copy(out, binChunkOffset + 8);

  return new Uint8Array(out.buffer, out.byteOffset, out.byteLength);
};

type ThreeMfObject = {
  id?: string;
  name?: string;
  type?: string;
};

const parseXmlAttributes = (tag: string): ThreeMfObject => {
  const attributes: ThreeMfObject = {};
  const attributeRegex = /([:A-Z_a-z][\w.:-]*)="([^"]*)"/g;
  let match: RegExpExecArray | undefined = attributeRegex.exec(tag) ?? undefined;
  while (match !== undefined) {
    const key = match[1];
    const value = match[2];
    if ((key === 'id' || key === 'name' || key === 'type') && value !== undefined) {
      attributes[key] = value;
    }
    match = attributeRegex.exec(tag) ?? undefined;
  }
  return attributes;
};

const readModelObjects = (xml: string): ThreeMfObject[] =>
  (xml.match(/<object\b[^>]*>/g) ?? [])
    .map((tag) => parseXmlAttributes(tag))
    .filter((object) => object.type === 'model');

/**
 * Parse vertex elements from a 3MF model XML and return the maximum number of
 * fractional digits seen across any x/y/z attribute.
 */
const maxVertexFractionalDigits = (xml: string): number => {
  const vertexRegex = /<vertex\b[^/]*\/>/g;
  const coordRegex = /[x-z]="(-?\d+(?:\.(\d+))?)"/g;
  let max = 0;
  for (const vertex of xml.match(vertexRegex) ?? []) {
    coordRegex.lastIndex = 0;
    let match: RegExpExecArray | undefined = coordRegex.exec(vertex) ?? undefined;
    while (match !== undefined) {
      const fractional = match[2] ?? '';
      if (fractional.length > max) {
        max = fractional.length;
      }
      match = coordRegex.exec(vertex) ?? undefined;
    }
  }
  return max;
};

describe('3MF rendering artifact regressions', () => {
  it('preserves one <object> per glTF primitive (JoinIdenticalVertices runs per-aiMesh)', async () => {
    const multiPrimGlb = buildMultiPrimitiveGlb();
    const files = await exportFiles(multiPrimGlb, '3mf');
    const xml = extract3mfModelXml(files[0]!.bytes);

    const objects = readModelObjects(xml);
    expect(objects.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves named glTF assembly nodes as separate 3MF model objects', async () => {
    const namedAssemblyGlb = buildNamedMultiNodeGlb();
    const files = await exportFiles(namedAssemblyGlb, '3mf');
    const xml = extract3mfModelXml(files[0]!.bytes);

    const objects = readModelObjects(xml);
    const objectNames = objects.map((object) => object.name);

    expect(objects.length).toBeGreaterThanOrEqual(2);
    expect(objectNames).toEqual(expect.arrayContaining(['Housing', 'Sun Gear']));
  });

  it('emits at least 9 fractional digits for vertex coordinates by default', async () => {
    const multiPrimGlb = buildMultiPrimitiveGlb();
    const files = await exportFiles(multiPrimGlb, '3mf');
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(maxVertexFractionalDigits(xml)).toBeGreaterThanOrEqual(9);
  });

  it('honours an explicit higher precision via 3MF_EXPORT_DECIMAL_PRECISION', async () => {
    const multiPrimGlb = buildMultiPrimitiveGlb();
    const files = await exportFiles(multiPrimGlb, '3mf', {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Assimp property key uses CONSTANT_CASE
      '3MF_EXPORT_DECIMAL_PRECISION': 12,
    });
    const xml = extract3mfModelXml(files[0]!.bytes);

    expect(maxVertexFractionalDigits(xml)).toBeGreaterThanOrEqual(10);
  });

  it('exports a normal cube without polygon-face fallout (degenerate / invalid-data guards)', async () => {
    const cubeGlb = loadFixture('cube.glb');
    const files = await exportFiles(cubeGlb, '3mf');
    const xml = extract3mfModelXml(files[0]!.bytes);

    const triangleCount = (xml.match(/<triangle\b/g) ?? []).length;
    const vertexCount = (xml.match(/<vertex\b/g) ?? []).length;
    expect(triangleCount).toBeGreaterThan(0);
    expect(vertexCount).toBeGreaterThan(0);
    expect(xml).not.toContain('v1="0" v2="0" v3="0"');
  });
});
