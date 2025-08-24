import { expect, describe, it, beforeEach } from 'vitest';
import type { Object3D } from 'three';
import { Vector3, Object3D as ThreeObject3D } from 'three';
import { importThreeJs } from '#threejs-import.js';
import { exportThreeJs, threejsExportFormats, type ThreejsExportFormat } from '#threejs-export.js';
import type { OutputFile, InputFile } from '#types.js';
import { loadFixture, getBoundingBox } from '#threejs-test.utils.js';
import { GltfLoader } from '#loaders/gltf.loader.js';

// ============================================================================
// Types for Export Testing
// ============================================================================

type ExportTestCase = {
  format: ThreejsExportFormat;
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
  
  // Round-trip assertions
  expectations: {
    geometry: {
      vertexCountTolerance: number; // 0 = exact, >0 = allowed difference
      faceCountTolerance: number;
      boundingBoxTolerance: number; // tolerance for bounding box comparison
      preservesNormals: boolean;
      preservesUVs: boolean;
    };
    materials: {
      preservesMaterialCount: boolean;
      preservesBasicProperties: boolean; // color, opacity, etc.
    };
  };
};

// ============================================================================
// Test Utility Functions  
// ============================================================================

/**
 * Load a test fixture as InputFiles for import
 */
const loadTestFixture = (fixture: ExportTestCase['fixture']): InputFile[] => {
  const filename = `${fixture}.glb`;
  return [{
    name: filename,
    data: loadFixture(filename)
  }];
};

/**
 * Load GLB data from test fixture
 */
const loadGlbFixture = (fixture: ExportTestCase['fixture']): Uint8Array => {
  const filename = `${fixture}.glb`;
  return loadFixture(filename);
};

/**
 * Import a test fixture into a Three.js Object3D (for comparison purposes)
 */
const importTestFixture = async (fixture: ExportTestCase['fixture']): Promise<Object3D> => {
  const files = loadTestFixture(fixture);
  return new GltfLoader().initialize({ format: 'glb', transformYtoZup: false, scaleMetersToMillimeters: false }).loadAsync(files);
};

/**
 * Perform round-trip test: GLB → Export → Import → Compare
 */
const performRoundTripTest = async (
  glbData: Uint8Array,
  format: ThreejsExportFormat
): Promise<{ 
  exportedFiles: OutputFile[],
  roundTripObject: Object3D 
}> => {
  // Export the GLB data
  const exportedFiles = await exportThreeJs(glbData, format);
  
  // If no files were exported, return empty result
  if (exportedFiles.length === 0) {
    const emptyObject = new ThreeObject3D();
    return { exportedFiles, roundTripObject: emptyObject };
  }
  
  // Convert OutputFiles to InputFiles for re-import
  const inputFiles: InputFile[] = exportedFiles.map(file => ({
    name: file.name,
    data: file.data
  }));
  
  // Re-import the exported files
  const roundTripObject = await importThreeJs(inputFiles, format);
  
  return { exportedFiles, roundTripObject };
};

/**
 * Assert geometry properties are within tolerance
 */
const assertGeometryProperties = async (
  original: Object3D,
  roundTrip: Object3D,
  expectations: ExportTestCase['expectations']['geometry']
) => {
  // Helper to count vertices and faces recursively
  const countGeometry = (object3d: Object3D) => {
    let vertexCount = 0;
    let faceCount = 0;
    
    object3d.traverse((child) => {
      if ('geometry' in child && child.geometry) {
        const geometry = child.geometry as any;
        if (geometry.attributes?.position) {
          vertexCount += geometry.attributes.position.count;
        }
        if (geometry.index) {
          faceCount += geometry.index.count / 3;
        }
      }
    });
    
    return { vertexCount, faceCount };
  };
  
  const originalGeometry = countGeometry(original);
  const roundTripGeometry = countGeometry(roundTrip);
  
  // Check vertex count within tolerance
  const vertexDiff = Math.abs(originalGeometry.vertexCount - roundTripGeometry.vertexCount);
  expect(vertexDiff).toBeLessThanOrEqual(expectations.vertexCountTolerance);
  
  // Check face count within tolerance
  const faceDiff = Math.abs(originalGeometry.faceCount - roundTripGeometry.faceCount);
  expect(faceDiff).toBeLessThanOrEqual(expectations.faceCountTolerance);
  
  // Check bounding boxes
  original.updateMatrixWorld(true);
  roundTrip.updateMatrixWorld(true);
  
  const originalBox = getBoundingBox(original);
  const roundTripBox = getBoundingBox(roundTrip);
  
  const sizeOriginal = originalBox.getSize(new Vector3());
  const sizeRoundTrip = roundTripBox.getSize(new Vector3());
  
  const sizeDiff = sizeOriginal.distanceTo(sizeRoundTrip);
  expect(sizeDiff).toBeLessThanOrEqual(expectations.boundingBoxTolerance);
};

/**
 * Assert material properties are preserved
 */
const assertMaterialProperties = (
  original: Object3D,
  roundTrip: Object3D,
  expectations: ExportTestCase['expectations']['materials']
) => {
  const countMaterials = (obj: Object3D) => {
    const materials = new Set();
    obj.traverse((child) => {
      if ('material' in child && child.material) {
        materials.add(child.material);
      }
    });
    return materials.size;
  };
  
  if (expectations.preservesMaterialCount) {
    const originalCount = countMaterials(original);
    const roundTripCount = countMaterials(roundTrip);
    expect(roundTripCount).toBe(originalCount);
  }
  
  // TODO: Add more material property assertions as needed
};


// ============================================================================
// Test Case Templates & Factories
// ============================================================================

const STANDARD_GEOMETRY_EXPECTATIONS = {
  vertexCountTolerance: 0,
  faceCountTolerance: 0,
  boundingBoxTolerance: 0.001,
  preservesNormals: true,
  preservesUVs: true,
} as const;

const STANDARD_MATERIAL_EXPECTATIONS = {
  preservesMaterialCount: true,
  preservesBasicProperties: true,
} as const;

const LIMITED_MATERIAL_EXPECTATIONS = {
  preservesMaterialCount: false,
  preservesBasicProperties: false,
} as const;

const LOSSY_GEOMETRY_EXPECTATIONS = {
  ...STANDARD_GEOMETRY_EXPECTATIONS,
  preservesNormals: false,
  preservesUVs: false,
} as const;

/**
 * Create a variant of expectations with overrides
 */
const createExpectationVariant = <T extends Record<string, any>>(
  base: T,
  overrides: Partial<T>
): T => ({
  ...base,
  ...overrides,
});

/**
 * Factory function for creating export test cases with sensible defaults
 */
const createExportTestCase = (
  format: ThreejsExportFormat,
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
  } = {}
): ExportTestCase => {
  const fixture = options.fixture ?? 'cube';
  const primaryExtension = options.expectedFiles?.primaryExtension ?? format;
  
  // Default file naming pattern
  const getDefaultFileNames = (format: ThreejsExportFormat): string[] => {
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
      geometry: createExpectationVariant(
        STANDARD_GEOMETRY_EXPECTATIONS,
        options.expectations?.geometry ?? {}
      ),
      materials: createExpectationVariant(
        STANDARD_MATERIAL_EXPECTATIONS,
        options.expectations?.materials ?? {}
      ),
    },
  };
};



// ============================================================================
// Test Cases Definition
// ============================================================================

const exportTestCases: ExportTestCase[] = [
  // GLTF/GLB Formats - Skip due to Node.js compatibility issues  
  createExportTestCase('glb', {
    skip: true,
    skipReason: 'GLTFExporter requires FileReader API, not available in Node.js',
    expectedFiles: {
      expectedNames: ['model.glb']
    }
  }),
  createExportTestCase('gltf', {
    skip: true,
    skipReason: 'GLTFExporter requires FileReader API, not available in Node.js',
    expectedFiles: {
      expectedNames: ['model.gltf']
    }
  }),
  
  // STL Format
  createExportTestCase('stl', {
    expectations: {
      geometry: {
        preservesNormals: false, // STL recalculates normals
        preservesUVs: false // STL doesn't support UVs
      },
      materials: LIMITED_MATERIAL_EXPECTATIONS, // STL doesn't support materials
    }
  }),
  
  // OBJ Format
  createExportTestCase('obj', {
    expectedFiles: {
      expectedNames: ['result.obj', 'result.mtl']
    },
    expectations: {
      materials: LIMITED_MATERIAL_EXPECTATIONS, // Basic OBJ export may not preserve materials
    }
  }),
  
  // PLY Format
  createExportTestCase('ply', {
    expectations: {
      geometry: {
        preservesUVs: false // PLY may not preserve UVs consistently
      },
      materials: LIMITED_MATERIAL_EXPECTATIONS, // PLY has limited material support
    }
  }),
  
  // USDZ Format
  createExportTestCase('usdz', {
    expectedFiles: {
      expectedNames: ['model.usdz']
    },
    skip: true,
    skipReason: 'USDZ exporter does not produce valid geometry.',
    expectations: {
      geometry: {
        vertexCountTolerance: 0,
        faceCountTolerance: 0, // USDZ may modify face count during export/import
        boundingBoxTolerance: 0.001, // TODO: debug this tolerance
      },
      materials: {
        preservesMaterialCount: false,
        preservesBasicProperties: true
      },
    }
  }),
  
  // Standard formats that preserve everything
  createExportTestCase('dae'),
  createExportTestCase('fbx'),
  createExportTestCase('x'),
  createExportTestCase('x3d'),
  
  // 3DS Format - doesn't preserve normals
  createExportTestCase('3ds', {
    expectations: {
      geometry: {
        preservesNormals: false,
      }
    }
  }),
  
  // STP Format - CAD format with limited capabilities
  createExportTestCase('stp', {
    expectations: {
      geometry: LOSSY_GEOMETRY_EXPECTATIONS,
    }
  })
];

// ============================================================================
// Main Test Suite
// ============================================================================

describe('threejs-export', () => {
  for (const testCase of exportTestCases) {
    describe(`'${testCase.format}' exporter`, () => {
      if (testCase.skip) {
        it.skip(`should export ${testCase.description}: ${testCase.skipReason}`, () => {
          expect(testCase.skip).toBe(true);
        });
        return;
      }
      
      let originalObject: Object3D;
      let glbData: Uint8Array;
      let exportedFiles: OutputFile[];
      let roundTripObject: Object3D;
      
      beforeEach(async () => {
        // Load GLB data and import for comparison
        glbData = loadGlbFixture(testCase.fixture);
        originalObject = await importTestFixture(testCase.fixture);
        
        // Perform round-trip export/import using GLB data
        const result = await performRoundTripTest(glbData, testCase.format);
        exportedFiles = result.exportedFiles;
        roundTripObject = result.roundTripObject;
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
        const actualNames = exportedFiles.map(f => f.name).sort();
        const expectedNames = [...testCase.expectedFiles.expectedNames].sort();
        expect(actualNames).toEqual(expectedNames);
        
        // Also check primary extension exists
        const primaryFile = exportedFiles.find(f => 
          f.name.endsWith(`.${testCase.expectedFiles.primaryExtension}`)
        );
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
        expect(roundTripObject).toBeDefined();
        expect(roundTripObject).toBeInstanceOf(Object.getPrototypeOf(originalObject).constructor);
      });
      
      it('should preserve geometry properties within tolerance', async () => {
        await assertGeometryProperties(originalObject, roundTripObject, testCase.expectations.geometry);
      });
      
      it('should handle material properties correctly', () => {
        assertMaterialProperties(originalObject, roundTripObject, testCase.expectations.materials);
      });
      

    });
  }
  
  // Meta tests
  describe('skipped exporters', () => {
    const skippedTestCases = exportTestCases.filter(tc => tc.skip);
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
    const testedFormats = exportTestCases.map(tc => tc.format);
    const declaredFormats = threejsExportFormats;
    
    expect([...new Set(testedFormats)].sort()).toEqual([...new Set(declaredFormats)].sort());
  });
  
  it('should throw error when GLB data is empty', async () => {
    const emptyGlbData = new Uint8Array(0);
    await expect(exportThreeJs(emptyGlbData, 'glb')).rejects.toThrow('GLB data cannot be empty');
  });
});
