import { expect, describe, it, beforeEach } from 'vitest';
import type { InspectReport } from '@gltf-transform/functions';
import { importFiles } from '#import.js';
import { exportFiles, supportedExportFormats } from '#export.js';
import type { SupportedExportFormat } from '#export.js';
import type { OutputFile, InputFile } from '#types.js';
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
const loadGlbFixture = (fixture: ExportTestCase['fixture']): Uint8Array => {
  const filename = `${fixture}.glb`;
  return loadFixture(filename);
};

/**
 * Perform round-trip test: GLB → Export → Import → Compare
 */
const performRoundTripTest = async (
  glbData: Uint8Array,
  format: SupportedExportFormat,
): Promise<{
  exportedFiles: OutputFile[];
  roundTripGlbData: Uint8Array;
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

  // Convert OutputFiles to InputFiles for re-import
  const inputFiles: InputFile[] = exportedFiles.map((file) => ({
    name: file.name,
    data: file.data,
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
  expect(originalScene.bboxMax!.length).toBeGreaterThanOrEqual(3);
  expect(originalScene.bboxMin!.length).toBeGreaterThanOrEqual(3);
  expect(roundTripScene.bboxMax!.length).toBeGreaterThanOrEqual(3);
  expect(roundTripScene.bboxMin!.length).toBeGreaterThanOrEqual(3);
  
  // Calculate bounding box size differences
  const originalSize = [
    originalScene.bboxMax![0]! - originalScene.bboxMin![0]!,
    originalScene.bboxMax![1]! - originalScene.bboxMin![1]!,
    originalScene.bboxMax![2]! - originalScene.bboxMin![2]!,
  ];
  const roundTripSize = [
    roundTripScene.bboxMax![0]! - roundTripScene.bboxMin![0]!,
    roundTripScene.bboxMax![1]! - roundTripScene.bboxMin![1]!,
    roundTripScene.bboxMax![2]! - roundTripScene.bboxMin![2]!,
  ];

  const sizeDiff = Math.sqrt(
    Math.pow(originalSize[0]! - roundTripSize[0]!, 2) +
      Math.pow(originalSize[1]! - roundTripSize[1]!, 2) +
      Math.pow(originalSize[2]! - roundTripSize[2]!, 2),
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
  const hasPosition = mesh.attributes.some(attr => attr.toLowerCase().includes('position'));
  
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
  const hasNormal = mesh.attributes.some(attr => attr.toLowerCase().includes('normal'));
  
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
  const hasUv = mesh.attributes.some(attr => 
    attr.toLowerCase().includes('texcoord') || 
    attr.toLowerCase().includes('uv')
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
  const standardAttributes = mesh.attributes.filter(attr => {
    const attrLower = attr.toLowerCase();
    return attrLower.includes('position') || 
           attrLower.includes('normal') || 
           attrLower.includes('texcoord') || 
           attrLower.includes('uv');
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

const STANDARD_GEOMETRY_EXPECTATIONS = {
  vertexCountTolerance: 0,
  meshCountTolerance: 0,
  boundingBoxTolerance: 0.001,
  hasPositionAttribute: true, // Should always be present
  hasNormalAttribute: true, // Standard formats preserve normals
  hasUvAttribute: false, // Most formats don't actually preserve UVs in round-trip
  additionalAttributeCount: 0, // Most standard formats don't add extra attributes
} as const;

const STANDARD_MATERIAL_EXPECTATIONS = {
  expectedMaterialCount: 1, // Standard cube fixture has 1 material
  expectedTextureCount: 0, // Standard cube fixture has no textures
} as const;

const MULTI_MATERIAL_EXPECTATIONS = {
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
      geometry: createExpectationVariant(STANDARD_GEOMETRY_EXPECTATIONS, options.expectations?.geometry ?? {}),
      materials: createExpectationVariant(STANDARD_MATERIAL_EXPECTATIONS, options.expectations?.materials ?? {}),
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
  }),
  createExportTestCase('glb', {
    expectedFiles: {
      expectedNames: ['model.glb'],
    },
  }),
  
  // Formats that add default materials
  createExportTestCase('dae', {
    expectations: {
      materials: MULTI_MATERIAL_EXPECTATIONS,
    },
  }),
  createExportTestCase('3ds', {
    expectations: {
      materials: MULTI_MATERIAL_EXPECTATIONS,
    },
  }),
  createExportTestCase('obj', {
    expectedFiles: {
      expectedNames: ['result.obj', 'result.mtl'],
    },
    expectations: {
      materials: MULTI_MATERIAL_EXPECTATIONS,
    },
  }),

  // STP Format - CAD format with limited capabilities and may subdivide geometry
  createExportTestCase('stp', {
    expectations: {
      geometry: {
        ...STANDARD_GEOMETRY_EXPECTATIONS,
        meshCountTolerance: 15, // CAD formats often subdivide geometry into multiple meshes
      },
      materials: {
        expectedMaterialCount: 0, // STP doesn't preserve or create materials
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

      let glbData: Uint8Array;
      let exportedFiles: OutputFile[];
      let roundTripGlbData: Uint8Array;
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
          expect(file.data).toBeInstanceOf(Uint8Array);
          expect(file.data.length).toBeGreaterThan(0);
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
